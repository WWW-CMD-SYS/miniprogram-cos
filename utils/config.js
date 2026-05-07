/**
 * COS 配置管理工具
 */

const CONFIG_KEY = 'cos_manager_config';

// 后端 API 基础地址
const API_BASE_URL = 'http://10.25.225.144:8001/api';

/**
 * 获取 API 基础地址
 */
export const getApiBaseUrl = () => API_BASE_URL;

/**
 * 保存 COS 配置到本地存储
 */
export const saveConfig = (config) => {
  try {
    const data = {
      secretId: config.secretId,
      secretKey: config.secretKey,
      bucket: config.bucket,
      region: config.region,
      baseUrl: config.baseUrl || ''
    };
    wx.setStorageSync(CONFIG_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('保存配置失败:', e);
    return false;
  }
};

/**
 * 从本地存储读取 COS 配置
 */
export const loadConfig = () => {
  try {
    const raw = wx.getStorageSync(CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('读取配置失败:', e);
    return null;
  }
};

/**
 * 清除本地配置
 */
export const clearConfig = () => {
  try {
    wx.removeStorageSync(CONFIG_KEY);
    return true;
  } catch (e) {
    console.error('清除配置失败:', e);
    return false;
  }
};

/**
 * 检查是否已配置 COS
 */
export const hasConfig = () => {
  const config = loadConfig();
  return !!(config && config.secretId && config.secretKey && config.bucket && config.region);
};

/**
 * 获取访问域名
 */
export const getBaseUrl = (config) => {
  if (config.baseUrl) {
    return config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
  }
  return `https://${config.bucket}.cos.${config.region}.myqcloud.com`;
};
