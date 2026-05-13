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
 * 上传文件
 * @param {string} filePath - 文件临时路径
 * @param {string} key - COS 存储路径（如 images/test.jpg）
 * @param {object} options - 其他选项
 */
export const uploadFile = (filePath, key, options = {}) => {
  return new Promise((resolve, reject) => {
    const cos = getCosInstance();

    // 获取存储桶配置
    const { bucket, region } = getBucketConfig();
    if (!bucket || !region) {
      reject(new Error('请先配置 COS 参数（Bucket 和 Region）'));
      return;
    }

    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        FilePath: filePath,
        onProgress: (info) => {
          if (options.onProgress) {
            options.onProgress(Math.round(info.percent * 100));
          }
        },
      },
      (err, data) => {
        if (err) {
          console.error('上传失败:', err);
          reject(new Error(err.message || '上传失败'));
        } else {
          resolve({
            code: 0,
            message: '上传成功',
            data: {
              key: key,
              etag: data.ETag,
              location: `https://${bucket}.cos.${region}.myqcloud.com/${key}`,
            },
          });
        }
      }
    );
  });
};

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
