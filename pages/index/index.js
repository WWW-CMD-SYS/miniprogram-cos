// pages/index/index.js
import { loadConfig, hasConfig, getApiBaseUrl } from '../../utils/config';
import { listFiles, deleteFile as apiDeleteFile, deleteFiles as apiDeleteFiles, uploadFile } from '../../utils/cos';
import { formatSize, getFileType } from '../../utils/format';

Page({
  data: {
    isDark: true,
    listLoading: false,
    fileList: [],
    selectedFiles: [],
    uploadQueue: [],
    currentPage: 1,
    pageSize: 10,
    // 计算属性需要手动放在 data 中
    paginatedFiles: [],
    totalPages: 0,
    isAllSelected: false,
    toast: {
      visible: false,
      message: '',
      theme: 'success'
    }
  },

  onLoad() {
    this.initTheme();
    if (hasConfig()) {
      this.fetchFileList();
    } else {
      this.showToast('请先配置 COS 参数', 'warning');
      setTimeout(() => {
        this.openConfig();
      }, 500);
    }
  },

  onShow() {
    if (hasConfig() && this.data.fileList.length === 0) {
      this.fetchFileList();
    }
  },

  // 初始化主题
  initTheme() {
    const saved = wx.getStorageSync('cos_manager_theme');
    this.setData({ isDark: saved !== 'light' });
    this.applyTheme(this.data.isDark);
  },

  // 应用主题
  applyTheme(isDark) {
    wx.setStorageSync('cos_manager_theme', isDark ? 'dark' : 'light');
    const pages = getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      currentPage.setData({ isDark });
    }
  },

  // 切换主题
  toggleTheme() {
    const newDark = !this.data.isDark;
    this.setData({ isDark: newDark });
    this.applyTheme(newDark);
    this.showToast(newDark ? '已切换到深色模式' : '已切换到浅色模式', 'success');
  },

  // 打开配置页
  openConfig() {
    wx.navigateTo({ url: '/pages/config/index' });
  },

  // 计算分页和选中状态
  updateComputed() {
    const { fileList, selectedFiles, currentPage, pageSize } = this.data;

    // 计算分页数据
    const totalPages = Math.max(1, Math.ceil(fileList.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    const paginatedFiles = fileList.slice(start, end);

    // 计算是否全选
    const isAllSelected = paginatedFiles.length > 0 && paginatedFiles.every(f => selectedFiles.includes(f.key));

    this.setData({
      paginatedFiles,
      totalPages,
      isAllSelected,
      currentPage: safePage
    });
  },

  // 加载文件列表
  async fetchFileList() {
    if (!hasConfig()) {
      this.showToast('请先配置 COS 参数', 'warning');
      this.openConfig();
      return;
    }

    this.setData({ listLoading: true });

    try {
      const res = await listFiles();
      if (res.code === 0) {
        this.setData({
          fileList: res.data.files || [],
          selectedFiles: [],
          currentPage: 1
        });
        this.updateComputed();
        this.showToast(`加载成功，共 ${res.data.files?.length || 0} 个文件`, 'success');
      } else {
        this.showToast(res.message || '获取列表失败', 'error');
      }
    } catch (e) {
      console.error('获取文件列表失败:', e);
      this.showToast('网络请求失败，请检查后端服务是否运行', 'error');
    }

    this.setData({ listLoading: false });
  },

  // 分页
  prevPage() {
    if (this.data.currentPage > 1) {
      this.setData({ currentPage: this.data.currentPage - 1 });
      this.updateComputed();
    }
  },

  nextPage() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({ currentPage: this.data.currentPage + 1 });
      this.updateComputed();
    }
  },

  // 选择文件
  toggleSelect(e) {
    const key = e.currentTarget.dataset.key;
    const selected = [...this.data.selectedFiles];
    const index = selected.indexOf(key);

    if (index > -1) {
      selected.splice(index, 1);
    } else {
      selected.push(key);
    }

    this.setData({ selectedFiles: selected });
    this.updateComputed();
  },

  toggleSelectAll() {
    const paginated = this.data.paginatedFiles;
    const selected = [...this.data.selectedFiles];

    if (this.data.isAllSelected) {
      paginated.forEach(f => {
        const idx = selected.indexOf(f.key);
        if (idx > -1) selected.splice(idx, 1);
      });
    } else {
      paginated.forEach(f => {
        if (!selected.includes(f.key)) selected.push(f.key);
      });
    }

    this.setData({ selectedFiles: selected });
    this.updateComputed();
  },

  // 打开文件详情
  openFile(e) {
    const file = e.currentTarget.dataset.file;
    wx.navigateTo({
      url: `/pages/file-detail/index?file=${encodeURIComponent(JSON.stringify(file))}`
    });
  },

  // 预览文件
  previewFile(e) {
    const file = e.currentTarget.dataset.file;
    if (!file.url) {
      this.showToast('文件 URL 不存在', 'error');
      return;
    }

    const type = getFileType(file.name);

    if (type === 'image') {
      wx.previewImage({
        urls: [file.url],
        current: file.url
      });
    } else if (type === 'pdf' || type === 'office') {
      wx.showLoading({ title: '加载中...' });
      wx.downloadFile({
        url: file.url,
        success: (res) => {
          wx.hideLoading();
          if (res.statusCode === 200) {
            wx.openDocument({
              filePath: res.tempFilePath,
              showMenu: true,
              success: () => {
                this.showToast('打开成功', 'success');
              },
              fail: () => {
                this.showToast('打开失败', 'error');
              }
            });
          }
        },
        fail: () => {
          wx.hideLoading();
          this.showToast('下载失败', 'error');
        }
      });
    } else {
      this.openFile(e);
    }
  },

  // 下载文件
  downloadFile(e) {
    const file = e.currentTarget.dataset.file;
    if (!file.url) {
      this.showToast('文件 URL 不存在', 'error');
      return;
    }

    wx.showLoading({ title: '正在下载...' });

    wx.downloadFile({
      url: file.url,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200) {
          const tempPath = res.tempFilePath;
          const ext = file.name.split('.').pop().toLowerCase();

          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
            wx.saveImageToPhotosAlbum({
              filePath: tempPath,
              success: () => {
                this.showToast(`已保存 ${file.name} 到相册`, 'success');
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

  // 删除文件
  deleteFile(e) {
    const file = e.currentTarget.dataset.file;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 "${file.name}" 吗？此操作不可恢复。`,
      confirmColor: '#d54941',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await apiDeleteFile(file.key);
            if (result.code === 0) {
              this.showToast('删除成功', 'success');
              this.fetchFileList();
            } else {
              this.showToast(result.message || '删除失败', 'error');
            }
          } catch (e) {
            console.error('删除失败:', e);
            this.showToast('删除失败', 'error');
          }
        }
      }
    });
  },

  // 批量删除
  batchDelete() {
    if (this.data.selectedFiles.length === 0) {
      this.showToast('请先选择要删除的文件', 'warning');
      return;
    }

    wx.showModal({
      title: '确认批量删除',
      content: `确定要删除选中的 ${this.data.selectedFiles.length} 个文件吗？此操作不可恢复。`,
      confirmColor: '#d54941',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });

          try {
            const result = await apiDeleteFiles(this.data.selectedFiles);
            wx.hideLoading();

            if (result.code === 0) {
              this.showToast(`批量删除成功，共删除 ${this.data.selectedFiles.length} 个文件`, 'success');
              this.setData({ selectedFiles: [] });
              this.fetchFileList();
            } else {
              this.showToast(result.message || '删除失败', 'error');
            }
          } catch (e) {
            wx.hideLoading();
            console.error('批量删除失败:', e);
            this.showToast('批量删除失败', 'error');
          }
        }
      }
    });
  },

  // 选择文件上传
  chooseFile() {
    if (!hasConfig()) {
      this.showToast('请先配置 COS 参数', 'warning');
      this.openConfig();
      return;
    }

    wx.chooseMessageFile({
      count: 10,
      success: (res) => {
        const files = res.tempFiles;
        const queue = files.map((f, index) => ({
          id: Date.now() + index,
          name: f.name,
          status: 'pending',
          path: f.path,
          progress: 0
        }));

        this.setData({ uploadQueue: queue });
        this.uploadFiles(queue);
      }
    });
  },

  // 上传文件
  async uploadFiles(queue) {
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      this.setData({
        [`uploadQueue[${i}].status`]: 'uploading',
        [`uploadQueue[${i}].progress`]: 0
      });

      try {
        const result = await uploadFile(file.path, {
          onProgress: (progress) => {
            this.setData({
              [`uploadQueue[${i}].progress`]: progress
            });
          }
        });

        this.setData({
          [`uploadQueue[${i}].status`]: 'success',
          [`uploadQueue[${i}].progress`]: 100
        });
        this.showToast(`${file.name} 上传成功`, 'success');

      } catch (e) {
        console.error(`上传 ${file.name} 失败:`, e);
        this.setData({
          [`uploadQueue[${i}].status`]: 'fail'
        });
        this.showToast(`${file.name} 上传失败`, 'error');
      }
    }

    setTimeout(() => {
      this.setData({ uploadQueue: [] });
      this.fetchFileList();
    }, 1500);
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
