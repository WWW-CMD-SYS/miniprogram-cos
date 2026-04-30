// pages/config/index.js
import { loadConfig, saveConfig as saveConfigUtil, clearConfig } from '../../utils/config';
import { validateConfig } from '../../utils/cos';
import Toast from 'tdesign-miniprogram/toast/index';

Page({
  data: {
    formData: {
      secretId: '',
      secretKey: '',
      bucket: '',
      region: '',
      baseUrl: ''
    },
    saving: false,
    showSecretKey: false,
    hasExistingConfig: false
  },

  onLoad() {
    this.loadSavedConfig();
  },

  // 加载已保存的配置
  loadSavedConfig() {
    const saved = loadConfig();
    if (saved && saved.secretId) {
      this.setData({
        formData: {
          secretId: saved.secretId || '',
          secretKey: saved.secretKey || '',
          bucket: saved.bucket || '',
          region: saved.region || '',
          baseUrl: saved.baseUrl || ''
        },
        hasExistingConfig: true
      });
    }
  },

  // 切换 SecretKey 显示/隐藏
  toggleSecretKeyVisibility() {
    this.setData({
      showSecretKey: !this.data.showSecretKey
    });
  },

  // 输入处理 - 原生 input 使用 bindinput
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 打开腾讯云控制台
  openCosConsole() {
    wx.setClipboardData({
      data: 'https://console.cloud.tencent.com/cos',
      success: () => {
        Toast({ message: '链接已复制，请在浏览器中打开', theme: 'success' });
      }
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 保存配置
  async saveConfig() {
    const { secretId, secretKey, bucket, region } = this.data.formData;

    // 简单验证
    if (!secretId) {
      Toast({ message: 'SecretId 不能为空', theme: 'error' });
      return;
    }
    if (!secretKey) {
      Toast({ message: 'SecretKey 不能为空', theme: 'error' });
      return;
    }
    if (!bucket) {
      Toast({ message: 'Bucket 不能为空', theme: 'error' });
      return;
    }
    if (!region) {
      Toast({ message: 'Region 不能为空', theme: 'error' });
      return;
    }

    this.setData({ saving: true });

    try {
      // 先保存到本地存储
      saveConfigUtil(this.data.formData);

      // 验证配置（调用后端 API）
      const res = await validateConfig();

      if (res.code === 0) {
        Toast({ message: '配置保存并验证成功', theme: 'success' });
        setTimeout(() => {
          this.goBack();
        }, 1000);
      } else {
        // 验证失败，清除配置
        clearConfig();
        Toast({ message: res.message || '配置验证失败', theme: 'error' });
      }
    } catch (e) {
      console.error('保存配置出错:', e);
      // 网络错误时保留本地配置
      Toast({ message: '配置已保存（验证请求失败，请检查后端服务）', theme: 'warning' });
      setTimeout(() => {
        this.goBack();
      }, 1500);
    }

    this.setData({ saving: false });
  }
});
