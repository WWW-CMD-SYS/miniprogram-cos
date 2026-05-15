/**
 * COS API 请求封装 - 调用后端 API
 */

import { loadConfig, getApiBaseUrl, getBaseUrl } from './config';

/**
 * 发送请求到后端 API
 */
export const requestApi = async (action, method = 'GET', data = null) => {
  const config = loadConfig();
  if (!config) {
    return { code: -1, message: '请先配置 COS 参数' };
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/${action}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      header: {
        'Content-Type': 'application/json',
        'x-cos-secret-id': config.secretId,
        'x-cos-secret-key': config.secretKey,
        'x-cos-bucket': config.bucket,
        'x-cos-region': config.region,
        'x-cos-base-url': config.baseUrl || ''
      },
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const msg = res.data?.message || `请求失败: ${res.statusCode}`;
          reject(new Error(msg));
        }
      },
      fail: (err) => {
        console.error('请求失败:', err);
        reject(new Error('网络请求失败，请检查网络连接'));
      }
    });
  });
};

/**
 * 上传文件到 COS（通过后端代理）
 *
 * 真机兼容性策略（按优先级）：
 * 1. FileSystemManager.read 分片上传（兼容所有基础库，大文件专用）
 *    - 每片 1MB，通过 wx.request 发送到 /upload-chunk-* 接口
 *    - 绕过 wx.uploadFile 的大文件连接超时问题
 * 2. wx.uploadFile（备用，小文件专用，基础库 2.25+ 推荐）
 *
 * @param {string} filePath - 文件临时路径
 * @param {string} fileName - 原始文件名
 * @param {object} options - 其他选项（如 onProgress）
 */
export const uploadFile = (filePath, fileName, options = {}) => {
  const config = loadConfig();
  if (!config) {
    return Promise.reject(new Error('请先配置 COS 参数'));
  }

  const apiBase = getApiBaseUrl();

  // 先获取文件大小，决定上传策略
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: (info) => {
        const fileSize = info.size;
        console.log(`[upload] 文件大小: ${fileSize} bytes, 文件名: ${fileName}`);

        // 文件 >= 5MB → 分片上传（避免 wx.uploadFile 大文件超时）
        // 文件 < 5MB → wx.uploadFile（简单高效）
        if (fileSize >= 5 * 1024 * 1024) {
          console.log('[upload] 使用分片上传策略');
          uploadInChunks(filePath, fileName, fileSize, config, apiBase, options)
            .then(resolve)
            .catch(reject);
        } else {
          console.log('[upload] 使用 uploadFile 策略');
          tryUploadViaUploadFile(filePath, fileName, config, apiBase, options)
            .then(resolve)
            .catch(reject);
        }
      },
      fail: (err) => {
        console.error('[upload] getFileInfo 失败，默认使用分片上传:', err);
        // 降级：强制使用分片上传
        uploadInChunks(filePath, fileName, -1, config, apiBase, options)
          .then(resolve)
          .catch(reject);
      }
    });
  });
};

/**
 * 小文件上传（wx.uploadFile 直传后端）
 * 仅用于 < 5MB 的小文件，简单高效
 */
function tryUploadViaUploadFile(filePath, fileName, config, apiBase, options) {
  return new Promise((resolve, reject) => {
    console.log(`[upload] uploadFile 直传: ${fileName}`);

    const uploadTask = wx.uploadFile({
      url: `${apiBase}/upload`,
      filePath,
      name: 'file',
      timeout: 600000,
      header: {
        'x-cos-secret-id': config.secretId,
        'x-cos-secret-key': config.secretKey,
        'x-cos-bucket': config.bucket,
        'x-cos-region': config.region,
        'x-cos-base-url': config.baseUrl || '',
      },
      formData: { fileName },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(res.data);
            if (data.code === 0) {
              console.log(`[upload] 上传成功: ${fileName}`);
              resolve(data);
            } else {
              reject(new Error(data.message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        } else {
          reject(new Error(`上传失败: HTTP ${res.statusCode}`));
        }
      },
      fail: reject,
    });

    if (options.onProgress) {
      uploadTask.onProgressUpdate((res) => options.onProgress(res.progress));
    }
  });
}

/**
 * 分片上传（FileSystemManager.readFile position+length，兼容所有基础库版本）
 *
 * 原理：
 * - 用 wx.getFileInfo 获取文件大小
 * - 用 FileSystemManager.readFile (position+length) 分片读取文件
 *   注意：fs.read 需要先 open 获取 fd，直接传 filePath 会报 invalid fd
 *   fs.readFile 支持直接传 filePath + position + length，基础库 2.16.0+ 均可用
 * - 每片 1MB，通过 wx.request 发送到后端 /upload-chunk-* 接口
 * - 后端合并分片后调用 COS sliceUploadFile 上传
 *
 * 为什么不用 wx.uploadFile：
 * - iOS 真机大文件（>~5MB）上传时，微信代理层可能触发超时重置
 * - 分片上传每片只需几秒，不触发超时
 */
function uploadInChunks(filePath, fileName, fileSize, config, apiBase, options) {
  const CHUNK_SIZE = 48 * 1024; // 每片 48KB，base64 编码后约 64KB，确保低于后端 body-parser 100KB (102400 bytes) 限制
  const CONCURRENCY = 6; // 分片变小了，提高并发数补偿总速度
  const fs = wx.getFileSystemManager();
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise(async (resolve, reject) => {
    try {
      // 1. 如果没传入 fileSize，先获取
      if (fileSize < 0) {
        try {
          const info = await promisify(wx.getFileInfo, [{ filePath }]);
          fileSize = info.size;
        } catch {
          fileSize = 100 * 1024 * 1024; // 默认假设 100MB，往大估
        }
      }

      const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
      console.log(`[chunk] 总共 ${totalChunks} 片，每片 ${CHUNK_SIZE / 1024}KB (base64后约${Math.round(CHUNK_SIZE * 4 / 3 / 1024)}KB)，并发 ${CONCURRENCY}`);

      // 2. 初始化上传会话
      let initRes;
      try {
        initRes = await requestPromise({
          url: `${apiBase}/upload-chunk-init`,
          method: 'POST',
          header: buildHeader(config),
          data: { fileName, fileSize, totalChunks, uploadId },
        });
      } catch (netErr) {
        console.error('[chunk] 初始化请求网络错误:', JSON.stringify(netErr));
        throw new Error(`初始化网络请求失败: ${netErr.errMsg || netErr.message || JSON.stringify(netErr)}`);
      }
      if (initRes.code !== 0) throw new Error(initRes.message || '初始化失败');

      // 3. 并发读取并上传分片（带重试机制）
      let uploadedCount = 0;
      let nextChunkIndex = 0;

      const uploadOneChunk = async (chunkIndex) => {
        const start = chunkIndex * CHUNK_SIZE;
        const length = Math.min(CHUNK_SIZE, fileSize - start);
        let lastErr = null;

        // 最多重试 3 次
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            // 读取这片数据（base64）
            const readRes = await new Promise((res, rej) => {
              fs.readFile({
                filePath,
                encoding: 'base64',
                position: start,
                length,
                success: res,
                fail: rej,
              });
            });
            const chunkData = readRes.data;

            // 上传这片
            const chunkRes = await requestPromise({
              url: `${apiBase}/upload-chunk`,
              method: 'POST',
              header: buildHeader(config),
              data: { uploadId, chunkIndex, totalChunks, fileName, fileData: chunkData },
              timeout: 120000,
            });
            if (chunkRes.code !== 0) throw new Error(chunkRes.message || `分片${chunkIndex + 1}上传失败`);

            uploadedCount++;
            const progress = Math.round((uploadedCount / totalChunks) * 100);
            if (options.onProgress) options.onProgress(progress);

            return; // 成功，退出重试循环
          } catch (err) {
            lastErr = err;
            console.warn(`[chunk] 分片 ${chunkIndex} 第${attempt + 1}次尝试失败:`, err.message || JSON.stringify(err));
            if (attempt < 2) {
              // 指数退避等待
              await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
            }
          }
        }

        // 3 次都失败，抛出最后一个错误
        throw lastErr || new Error(`分片 ${chunkIndex + 1} 上传失败`);
      };

      // 使用并发池控制同时上传的分片数
      const activeUploads = new Set();

      while (nextChunkIndex < totalChunks || activeUploads.size > 0) {
        // 填充并发槽
        while (activeUploads.size < CONCURRENCY && nextChunkIndex < totalChunks) {
          const idx = nextChunkIndex++;
          const p = uploadOneChunk(idx).then(() => {
            activeUploads.delete(p);
          }).catch((err) => {
            activeUploads.delete(p);
            throw err;
          });
          activeUploads.add(p);
        }

        // 等待任意一个完成
        if (activeUploads.size > 0) {
          await Promise.race(activeUploads);
        }
      }

      // 4. 完成分片上传
      const completeRes = await requestPromise({
        url: `${apiBase}/upload-chunk-complete`,
        method: 'POST',
        header: buildHeader(config),
        data: { uploadId, fileName, totalChunks },
      });
      if (completeRes.code !== 0) throw new Error(completeRes.message || '完成上传失败');

      console.log(`[chunk] 上传成功: ${fileName}`);
      if (options.onProgress) options.onProgress(100);
      resolve(completeRes);

    } catch (err) {
      console.error('[chunk] 分片上传失败:', err.message || JSON.stringify(err));
      reject(err);
    }
  });
}

/**
 * 辅助：把 wx API 回调转 Promise
 */
function promisify(fn, args) {
  return new Promise((resolve, reject) => {
    fn({
      ...(Array.isArray(args) ? args[0] : args),
      success: resolve,
      fail: reject,
    });
  });
}

/**
 * 辅助：构造请求头
 */
function buildHeader(config) {
  return {
    'Content-Type': 'application/json',
    'x-cos-secret-id': config.secretId,
    'x-cos-secret-key': config.secretKey,
    'x-cos-bucket': config.bucket,
    'x-cos-region': config.region,
    'x-cos-base-url': config.baseUrl || '',
  };
}

/**
 * 辅助：wx.request 返回 Promise
 */
function requestPromise(opts) {
  return new Promise((resolve, reject) => {
    const req = wx.request({
      ...opts,
      timeout: opts.timeout || 30000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error(res.data?.message || `HTTP ${res.statusCode}`));
      },
      fail: (err) => {
        console.error('[requestPromise] wx.request fail:', JSON.stringify(err));
        reject(new Error(err.errMsg || JSON.stringify(err)));
      },
    });
  });
}

/**
 * 获取文件列表
 */
export const listFiles = async (marker = '', maxResults = 100) => {
  return requestApi(`list?marker=${encodeURIComponent(marker)}&maxResults=${maxResults}`, 'GET');
};

/**
 * 删除单个文件
 */
export const deleteFile = async (key) => {
  return requestApi('delete', 'POST', { key });
};

/**
 * 批量删除文件
 */
export const deleteFiles = async (keys) => {
  return requestApi('delete-batch', 'POST', { keys });
};

/**
 * 验证配置
 */
export const validateConfig = async () => {
  return requestApi('validate', 'POST');
};

/**
 * 获取文件访问 URL
 */
export const getFileUrl = (key) => {
  const config = loadConfig();
  if (!config) return '';
  const base = getBaseUrl(config);
  return `${base}/${key}`;
};
