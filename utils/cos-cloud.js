/**
 * COS 操作封装 - 使用云托管 API + COS SDK
 * 
 * 架构：
 * 1. 调用云托管 API 获取临时密钥
 * 2. 使用临时密钥初始化 COS SDK
 * 3. SDK 直接与 COS 通信（无需后端代理上传）
 * 
 * 优势：
 * - 无需将 SecretId/SecretKey 暴露在小程序端
 * - 临时密钥有效期短，更安全
 * - 支持细粒度权限控制
 */

const COS = require('cos-wx-sdk-v5');

// 云托管服务地址（从环境变量或配置中读取）
let apiBaseUrl = '';

// COS 实例缓存
let cosInstance = null;
let currentCredentials = null;
let credentialsExpiredTime = 0;

/**
 * 获取 API 基础地址
 */
function getApiBaseUrl() {
  if (apiBaseUrl) return apiBaseUrl;
  
  // 从本地存储读取（在配置页面设置）
  try {
    const config = wx.getStorageSync('cos_manager_config');
    if (config && config.apiBaseUrl) {
      apiBaseUrl = config.apiBaseUrl;
      return apiBaseUrl;
    }
  } catch (e) {
    console.error('读取配置失败:', e);
  }
  
  // 默认地址（替换为你的云托管服务地址）
  // 格式：https://service-id.service.dev.tencentcloud.com 或自定义域名
  return 'https://express-6nbh.service.dev.tencentcloud.com';
}

/**
 * 初始化 COS 实例（复用已有密钥）
 */
function getCosInstance() {
  if (cosInstance) {
    return cosInstance;
  }

  cosInstance = new COS({
    getAuthorization: (options, callback) => {
      // 检查是否需要刷新密钥（提前5分钟刷新）
      if (currentCredentials && Date.now() < credentialsExpiredTime - 5 * 60 * 1000) {
        callback(currentCredentials);
        return;
      }

      // 调用云托管 API 获取临时密钥
      wx.request({
        url: `${getApiBaseUrl()}/get-cos-secret`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
        },
        data: {
          action: options.action || 'all',
          path: options.key || '*',
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data.code === 0) {
            const data = res.data.data;
            currentCredentials = {
              TmpSecretId: data.tmpSecretId,
              TmpSecretKey: data.tmpSecretKey,
              XCosSecurityToken: data.sessionToken,
              expiredTime: data.expiredTime,
            };
            credentialsExpiredTime = data.expiredTime * 1000; // 转换为毫秒
            callback(currentCredentials);
          } else {
            console.error('获取临时密钥失败:', res.data);
            wx.showToast({
              title: res.data?.message || '获取密钥失败',
              icon: 'none',
            });
          }
        },
        fail: (err) => {
          console.error('API 调用失败:', err);
          wx.showToast({
            title: '网络请求失败',
            icon: 'none',
          });
        },
      });
    },
  });

  return cosInstance;
}

/**
 * 上传文件（通过后端 API 代理上传）
 *
 * 大文件策略：
 * - 文件 >= 5MB → 使用 FileSystemManager.readFile 分片并发上传
 *   （绕过 wx.uploadFile 在 iOS 真机上的大文件超时问题）
 * - 文件 < 5MB  → wx.uploadFile 直传后端
 *
 * @param {string} filePath - 文件临时路径
 * @param {string} key - COS 存储路径（如 images/test.jpg）
 * @param {object} options - 其他选项（如 onProgress）
 */
export const uploadFile = (filePath, key, options = {}) => {
  const { bucket, region } = getBucketConfig();
  if (!bucket || !region) {
    return Promise.reject(new Error('请先配置 COS 参数（Bucket 和 Region）'));
  }

  // 先获取文件大小，决定上传策略
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: (info) => {
        const fileSize = info.size;
        console.log(`[upload] 文件大小: ${fileSize} bytes, 文件名: ${key}`);

        if (fileSize >= 5 * 1024 * 1024) {
          console.log('[upload] cos-cloud: 使用分片上传策略');
          uploadInChunksCloud(filePath, key, fileSize, options)
            .then(resolve)
            .catch(reject);
        } else {
          console.log('[upload] cos-cloud: 使用 wx.uploadFile 策略');
          tryUploadViaUploadFile(filePath, key, options)
            .then(resolve)
            .catch(reject);
        }
      },
      fail: (err) => {
        console.error('[upload] getFileInfo 失败，降级使用分片上传:', err);
        uploadInChunksCloud(filePath, key, -1, options)
          .then(resolve)
          .catch(reject);
      }
    });
  });
};

/**
 * 小文件上传（wx.uploadFile 直传后端）
 */
function tryUploadViaUploadFile(filePath, key, options = {}) {
  return new Promise((resolve, reject) => {
    const apiBase = getApiBaseUrl();
    let configHeaders = {};
    try {
      const rawConfig = wx.getStorageSync('cos_manager_config');
      if (rawConfig) {
        const parsed = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
        if (parsed.secretId) configHeaders['x-cos-secret-id'] = parsed.secretId;
        if (parsed.secretKey) configHeaders['x-cos-secret-key'] = parsed.secretKey;
        if (parsed.bucket) configHeaders['x-cos-bucket'] = parsed.bucket;
        if (parsed.region) configHeaders['x-cos-region'] = parsed.region;
        if (parsed.baseUrl) configHeaders['x-cos-base-url'] = parsed.baseUrl;
      }
    } catch (e) {
      // 忽略
    }

    console.log(`[upload] uploadFile 直传: ${key}`);
    const uploadTask = wx.uploadFile({
      url: `${apiBase}/upload`,
      filePath: filePath,
      name: 'file',
      timeout: 600000,
      header: configHeaders,
      formData: {
        fileName: key,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(res.data);
            if (data.code === 0) {
              resolve({
                code: 0,
                message: '上传成功',
                data: data.data || {
                  key: key,
                  location: `https://${bucket}.cos.${region}.myqcloud.com/${key}`,
                },
              });
            } else {
              reject(new Error(data.message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        } else {
          try {
            const data = JSON.parse(res.data);
            reject(new Error(data.message || `上传失败: ${res.statusCode}`));
          } catch (e) {
            reject(new Error(`上传失败: ${res.statusCode}`));
          }
        }
      },
      fail: (err) => {
        console.error('后端代理上传失败:', err);
        reject(new Error(err.errMsg || '网络请求失败，请检查网络连接'));
      },
    });

    if (options.onProgress) {
      uploadTask.onProgressUpdate((res) => {
        options.onProgress(res.progress);
      });
    }
  });
}

/**
 * 分片上传（cos-cloud 版本）
 *
 * 原理同 cos.js 的 uploadInChunks：
 * - 用 fs.readFile (position+length) 分片读取
 * - 并发上传到 /upload-chunk-* 接口
 * - 支持自动重试和进度回调
 */
function uploadInChunksCloud(filePath, fileName, fileSize, options) {
  const CHUNK_SIZE = 48 * 1024; // 每片 48KB，base64 编码后约 64KB，确保低于后端 body-parser 100KB (102400 bytes) 限制
  const CONCURRENCY = 6; // 分片变小了，提高并发数补偿总速度
  const fs = wx.getFileSystemManager();
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise(async (resolve, reject) => {
    try {
      // 1. 获取文件大小
      if (fileSize < 0) {
        try {
          const info = await new Promise((res, rej) => {
            wx.getFileInfo({ filePath, success: res, fail: rej });
          });
          fileSize = info.size;
        } catch {
          fileSize = 100 * 1024 * 1024;
        }
      }

      const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
      const apiBase = getApiBaseUrl();
      let configHeaders = {};

      try {
        const rawConfig = wx.getStorageSync('cos_manager_config');
        if (rawConfig) {
          const parsed = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
          if (parsed.secretId) configHeaders['x-cos-secret-id'] = parsed.secretId;
          if (parsed.secretKey) configHeaders['x-cos-secret-key'] = parsed.secretKey;
          if (parsed.bucket) configHeaders['x-cos-bucket'] = parsed.bucket;
          if (parsed.region) configHeaders['x-cos-region'] = parsed.region;
          if (parsed.baseUrl) configHeaders['x-cos-base-url'] = parsed.baseUrl;
        }
      } catch (e) {}

      console.log(`[chunk-cloud] 总共 ${totalChunks} 片，每片 ${CHUNK_SIZE / 1024}KB，并发 ${CONCURRENCY}`);

      // 2. 初始化
      const initRes = await requestPromise({
        url: `${apiBase}/upload-chunk-init`,
        method: 'POST',
        header: { ...configHeaders, 'Content-Type': 'application/json' },
        data: { fileName, fileSize, totalChunks, uploadId },
      });
      if (initRes.code !== 0) throw new Error(initRes.message || '初始化失败');

      // 3. 并发上传分片
      let uploadedCount = 0;
      let nextChunkIndex = 0;

      const uploadOneChunk = async (chunkIndex) => {
        const start = chunkIndex * CHUNK_SIZE;
        const length = Math.min(CHUNK_SIZE, fileSize - start);
        let lastErr = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
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

            const chunkRes = await requestPromise({
              url: `${apiBase}/upload-chunk`,
              method: 'POST',
              header: { ...configHeaders, 'Content-Type': 'application/json' },
              data: { uploadId, chunkIndex, totalChunks, fileName, fileData: readRes.data },
              timeout: 120000,
            });
            if (chunkRes.code !== 0) throw new Error(chunkRes.message || `分片${chunkIndex + 1}上传失败`);

            uploadedCount++;
            const progress = Math.round((uploadedCount / totalChunks) * 100);
            if (options.onProgress) options.onProgress(progress);

            return;
          } catch (err) {
            lastErr = err;
            console.warn(`[chunk-cloud] 分片 ${chunkIndex} 第${attempt + 1}次尝试失败:`, err.message);
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
            }
          }
        }

        throw lastErr || new Error(`分片 ${chunkIndex + 1} 上传失败`);
      };

      const activeUploads = new Set();
      while (nextChunkIndex < totalChunks || activeUploads.size > 0) {
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
        if (activeUploads.size > 0) {
          await Promise.race(activeUploads);
        }
      }

      // 4. 完成
      const completeRes = await requestPromise({
        url: `${apiBase}/upload-chunk-complete`,
        method: 'POST',
        header: { ...configHeaders, 'Content-Type': 'application/json' },
        data: { uploadId, fileName, totalChunks },
      });
      if (completeRes.code !== 0) throw new Error(completeRes.message || '完成上传失败');

      console.log(`[chunk-cloud] 上传成功: ${fileName}`);
      if (options.onProgress) options.onProgress(100);
      resolve(completeRes);

    } catch (err) {
      console.error('[chunk-cloud] 分片上传失败:', err.message);
      reject(err);
    }
  });
}

/**
 * 辅助：wx.request 返回 Promise
 */
function requestPromise(opts) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...opts,
      timeout: opts.timeout || 30000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error(res.data?.message || `HTTP ${res.statusCode}`));
      },
      fail: (err) => {
        reject(new Error(err.errMsg || JSON.stringify(err)));
      },
    });
  });
}

/**
 * 获取文件列表
 */
export const listFiles = async (marker = '', maxResults = 100) => {
  return new Promise((resolve, reject) => {
    const cos = getCosInstance();
    const { bucket, region } = getBucketConfig();

    if (!bucket || !region) {
      reject(new Error('请先配置 COS 参数'));
      return;
    }

    cos.getBucket(
      {
        Bucket: bucket,
        Region: region,
        Marker: marker,
        MaxKeys: maxResults,
      },
      (err, data) => {
        if (err) {
          console.error('获取文件列表失败:', err);
          reject(new Error(err.message || '获取列表失败'));
        } else {
          resolve({
            code: 0,
            message: 'success',
            data: {
              files: (data.Contents || []).map((item) => ({
                key: item.Key,
                name: decodeURIComponent(item.Key.split('/').pop()),
                size: item.Size,
                lastModified: item.LastModified,
                url: `https://${bucket}.cos.${region}.myqcloud.com/${item.Key}`,
              })),
              nextMarker: data.NextMarker || '',
              isTruncated: data.IsTruncated === 'true',
            },
          });
        }
      }
    );
  });
};

/**
 * 删除单个文件
 */
export const deleteFile = async (key) => {
  return new Promise((resolve, reject) => {
    const cos = getCosInstance();
    const { bucket, region } = getBucketConfig();

    if (!bucket || !region) {
      reject(new Error('请先配置 COS 参数'));
      return;
    }

    cos.deleteObject(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
      },
      (err, data) => {
        if (err) {
          console.error('删除失败:', err);
          reject(new Error(err.message || '删除失败'));
        } else {
          resolve({
            code: 0,
            message: '删除成功',
            data: data,
          });
        }
      }
    );
  });
};

/**
 * 批量删除文件
 */
export const deleteFiles = async (keys) => {
  return new Promise((resolve, reject) => {
    const cos = getCosInstance();
    const { bucket, region } = getBucketConfig();

    if (!bucket || !region) {
      reject(new Error('请先配置 COS 参数'));
      return;
    }

    cos.deleteMultipleObjects(
      {
        Bucket: bucket,
        Region: region,
        Objects: keys.map((key) => ({ Key: key })),
      },
      (err, data) => {
        if (err) {
          console.error('批量删除失败:', err);
          reject(new Error(err.message || '批量删除失败'));
        } else {
          resolve({
            code: 0,
            message: '批量删除成功',
            data: data,
          });
        }
      }
    );
  });
};

/**
 * 获取文件访问 URL
 */
export const getFileUrl = (key) => {
  const { bucket, region } = getBucketConfig();
  if (!bucket || !region) return '';
  return `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
};

/**
 * 验证配置（检查 API 是否可用）
 */
export const validateConfig = async () => {
  try {
    const res = await new Promise((resolve, reject) => {
      wx.request({
        url: `${getApiBaseUrl()}/health`,
        method: 'GET',
        success: (res) => resolve(res),
        fail: (err) => reject(err),
      });
    });

    if (res.statusCode === 200) {
      return { code: 0, message: '配置验证成功' };
    } else {
      return { code: -1, message: 'API 服务不可用' };
    }
  } catch (err) {
    return { code: -1, message: 'API 调用失败，请检查网络和配置' };
  }
};

/**
 * 获取存储桶配置（从本地读取）
 */
function getBucketConfig() {
  try {
    const raw = wx.getStorageSync('cos_manager_config');
    if (!raw) return { bucket: '', region: '' };
    const config = JSON.parse(raw);
    return {
      bucket: config.bucket || '',
      region: config.region || '',
    };
  } catch (e) {
    return { bucket: '', region: '' };
  }
}

/**
 * 设置 API 基础地址
 */
export const setApiBaseUrl = (url) => {
  apiBaseUrl = url;
  try {
    const config = wx.getStorageSync('cos_manager_config') || '{}';
    const parsed = JSON.parse(config);
    parsed.apiBaseUrl = url;
    wx.setStorageSync('cos_manager_config', JSON.stringify(parsed));
  } catch (e) {
    console.error('保存配置失败:', e);
  }
};

/**
 * 清除缓存的密钥（需要刷新时调用）
 */
export const clearCredentialsCache = () => {
  cosInstance = null;
  currentCredentials = null;
  credentialsExpiredTime = 0;
};
