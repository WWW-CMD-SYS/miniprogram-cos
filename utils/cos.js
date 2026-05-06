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
 * @param {string} filePath - 文件临时路径
 * @param {string} fileName - 原始文件名
 * @param {object} options - 其他选项（如 onProgress）
 */
export const uploadFile = (filePath, fileName, options = {}) => {
  const config = loadConfig();
  if (!config) {
    return Promise.reject(new Error('请先配置 COS 参数'));
  }

  // 构建 formData
  const formData = {
    fileName: fileName
  };

  // 如果有进度回调
  if (options.onProgress) {
    formData.onProgress = options.onProgress;
  }

  return new Promise((resolve, reject) => {
    const uploadTask = wx.uploadFile({
      url: `${getApiBaseUrl()}/upload`,
      filePath: filePath,
      name: 'file',
      header: {
        'x-cos-secret-id': config.secretId,
        'x-cos-secret-key': config.secretKey,
        'x-cos-bucket': config.bucket,
        'x-cos-region': config.region,
        'x-cos-base-url': config.baseUrl || ''
      },
      formData: {
        fileName: fileName
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(res.data);
            if (data.code === 0) {
              resolve(data);
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
        console.error('上传失败:', err);
        reject(new Error('网络请求失败，请检查网络连接'));
      }
    });

    // 上传进度回调
    if (options.onProgress) {
      uploadTask.onProgressUpdate((res) => {
        options.onProgress(res.progress);
      });
    }
  });
};

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
