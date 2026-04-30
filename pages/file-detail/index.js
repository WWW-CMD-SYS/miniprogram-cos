// pages/file-detail/index.js
import { formatSize, formatDate, getFileType, getStorageText, getStorageTheme } from '../../utils/format';
import { deleteFile as apiDeleteFile } from '../../utils/cos';

Page({
  data: {
    fileInfo: {},
    fileType: '',
    textContent: '',
    loading: false,
    // 格式化后的显示数据
    displaySize: '-',
    displayDate: '-',
    displayStorageText: '-',
    displayStorageTheme: 'default',
    toast: {
      visible: false,
      message: '',
      theme: 'success'
    }
  },

  onLoad(options) {
    try {
      const fileStr = decodeURIComponent(options.file);
      const fileInfo = JSON.parse(fileStr);
      this.setData({ fileInfo });

      // 预处理格式化数据
      this.prepareDisplayData(fileInfo);

      this.initFile();
    } catch (e) {
      console.error('解析文件信息失败:', e);
      this.showToast('文件信息解析失败', 'error');
    }
  },

  // 预处理显示数据
  prepareDisplayData(fileInfo) {
    this.setData({
      displaySize: formatSize(fileInfo.size),
      displayDate: formatDate(fileInfo.lastModified),
      displayStorageText: getStorageText(fileInfo.storageClass),
      displayStorageTheme: getStorageTheme(fileInfo.storageClass)
    });
  },

  // 初始化文件预览
  initFile() {
    const { fileInfo } = this.data;
    const fileType = getFileType(fileInfo.name);
    this.setData({ fileType });

    if (fileType === 'text' && fileInfo.url) {
      this.loadTextContent();
    }
  },

  // 加载文本内容
  loadTextContent() {
    this.setData({ loading: true });
    
    wx.request({
      url: this.data.fileInfo.url,
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({ textContent: res.data });
        } else {
          this.setData({ textContent: '加载失败' });
        }
      },
      fail: () => {
        this.setData({ textContent: '加载失败' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 预览图片
  previewImage() {
    wx.previewImage({
      urls: [this.data.fileInfo.url],
      current: this.data.fileInfo.url
    });
  },

  // 下载文件
  downloadFile() {
    if (!this.data.fileInfo.url) {
      this.showToast('文件 URL 不存在', 'error');
      return;
    }

    wx.showLoading({ title: '正在下载...' });

    wx.downloadFile({
      url: this.data.fileInfo.url,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200) {
          const tempPath = res.tempFilePath;
          const ext = this.data.fileInfo.name.split('.').pop().toLowerCase();

          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
            wx.saveImageToPhotosAlbum({
              filePath: tempPath,
              success: () => {
                this.showToast('已保存到相册', 'success');
              },
              fail: (err) => {
                if (err.errMsg.includes('auth deny')) {
                  this.showToast('请授权保存图片到相册', 'warning');
                  wx.openSetting();
                } else {
                  this.showToast('保存失败', 'error');
                }
              }
            });
          } else {
            wx.openDocument({
              filePath: tempPath,
              showMenu: true,
              success: () => {
                this.showToast('打开成功', 'success');
              },
              fail: () => {
                this.showToast('打开失败', 'error');
              }
            });
          }
        } else {
          this.showToast('下载失败', 'error');
        }
      },
      fail: () => {
        wx.hideLoading();
        this.showToast('下载失败', 'error');
      }
    });
  },

  // 确认删除
  confirmDelete() {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 "${this.data.fileInfo.name}" 吗？此操作不可恢复。`,
      confirmColor: '#d54941',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await apiDeleteFile(this.data.fileInfo.key);
            if (result.code === 0) {
              // 刷新列表页面
              this.refreshListPage();
              // 立即返回列表页面
              this.goBack();
            } else {
              this.showToast(result.message || '删除失败', 'error');
            }
          } catch (e) {
            this.showToast('删除失败', 'error');
          }
        }
      }
    });
  },

  // 刷新列表页面
  refreshListPage() {
    const pages = getCurrentPages();
    // 查找列表页面（index 页面）
    const listPage = pages.find(p => p.route === 'pages/index/index');
    if (listPage && typeof listPage.fetchFileList === 'function') {
      listPage.fetchFileList();
    }
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
    }, 2000);
  }
});
