// pages/config/index.js
import { loadConfig, saveConfig as saveConfigUtil, clearConfig, getApiBaseUrl } from '../../utils/config';
import { validateConfig } from '../../utils/cos';

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
    toast: {
      visible: false,
      message: '',
      theme: 'success'
    }
  },

  onLoad() {
    this.loadSavedConfig();
  },

  // 加载已保存的配置
  loadSavedConfig() {
    const saved = loadConfig();
    if (saved) {
      this.setData({
        formData: {
          secretId: saved.secretId || '',
          secretKey: saved.secretKey || '',
          bucket: saved.bucket || '',
          region: saved.region || '',
          baseUrl: saved.baseUrl || ''
        }
      });
    }
  },

  // 输入处理
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
        wx.showModal({
          title: '提示',
          content: '链接已复制，请在浏览器中打开',
          showCancel: false
        });
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
      this.showToast('SecretId 不能为空', 'error');
      return;
    }
    if (!secretKey) {
      this.showToast('SecretKey 不能为空', 'error');
      return;
    }
    if (!bucket) {
      this.showToast('Bucket 不能为空', 'error');
      return;
    }
    if (!region) {
      this.showToast('Region 不能为空', 'error');
      return;
    }

    this.setData({ saving: true });

    try {
      // 先保存到本地存储
      saveConfigUtil(this.data.formData);

      // 验证配置（调用后端 API）
      const res = await validateConfig();

      if (res.code === 0) {
        this.showToast('配置保存并验证成功', 'success');
        setTimeout(() => {
          this.goBack();
        }, 1000);
      } else {
        // 验证失败，清除配置
        clearConfig();
        this.showToast(res.message || '配置验证失败', 'error');
      }
    } catch (e) {
      console.error('保存配置出错:', e);
      // 网络错误时保留本地配置
      this.showToast('配置已保存（验证请求失败，请检查后端服务）', 'warning');
      setTimeout(() => {
        this.goBack();
      }, 1500);
    }

    this.setData({ saving: false });
  },

  // 显示 Toast
  showToast(message, theme = 'success') {
    this.setData({
      toast: {
        visible: true,
        message,
        theme
      }
    });

    setTimeout(() => {
      this.setData({
        'toast.visible': false
      });
    }, 2500);
  }
});
