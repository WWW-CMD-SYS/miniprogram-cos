// pages/index/index.js
import { loadConfig, hasConfig } from '../../utils/config';
import { listFiles, deleteFile as apiDeleteFile, deleteFiles as apiDeleteFiles, uploadFile } from '../../utils/cos';
import { formatSize, getFileType } from '../../utils/format';
import Toast from 'tdesign-miniprogram/toast/index';

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
    filteredFiles: [],
    totalPages: 0,
    isAllSelected: false,
    // 搜索相关
    searchKeyword: ''
  },

  onLoad() {
    this.initTheme();
    if (hasConfig()) {
      this.fetchFileList();
    } else {
      Toast({ message: '请先配置 COS 参数', theme: 'warning' });
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
    Toast({ message: newDark ? '已切换到深色模式' : '已切换到浅色模式', theme: 'success' });
  },

  // 打开配置页
  openConfig() {
    wx.navigateTo({ url: '/pages/config/index' });
  },

  // 搜索输入处理
  onSearchInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ searchKeyword: keyword });
    this.setData({ currentPage: 1 }); // 重置到第一页
    this.updateComputed();
  },

  // 搜索确认（键盘回车）
  onSearchConfirm(e) {
    const keyword = e.detail.value || '';
    this.setData({ searchKeyword: keyword });
    this.setData({ currentPage: 1 });
    this.updateComputed();
  },

  // 清除搜索
  clearSearch() {
    this.setData({ searchKeyword: '' });
    this.setData({ currentPage: 1 });
    this.updateComputed();
  },

  // 计算分页和选中状态（包含过滤逻辑）
  updateComputed() {
    const { fileList, selectedFiles, currentPage, pageSize, searchKeyword } = this.data;

    // 根据关键词过滤文件
    let filtered = fileList;
    if (searchKeyword && searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      filtered = fileList.filter(file =>
        file.name && file.name.toLowerCase().includes(keyword)
      );
    }

    // 计算分页数据，并给每个文件添加 selected 属性
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    const paginatedFiles = filtered.slice(start, end).map(f => ({
      ...f,
      selected: selectedFiles.includes(f.key)
    }));

    // 计算是否全选（基于当前页）
    const isAllSelected = paginatedFiles.length > 0 && paginatedFiles.every(f => f.selected);

    this.setData({
      filteredFiles: filtered,
      paginatedFiles,
      totalPages,
      isAllSelected,
      currentPage: safePage
    });
  },

  // 加载文件列表
  async fetchFileList() {
    if (!hasConfig()) {
      Toast({ message: '请先配置 COS 参数', theme: 'warning' });
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
          currentPage: 1,
          searchKeyword: '' // 重置搜索
        });
        this.updateComputed();
        Toast({ message: `加载成功，共 ${res.data.files?.length || 0} 个文件`, theme: 'success' });
      } else {
        Toast({ message: res.message || '获取列表失败', theme: 'error' });
      }
    } catch (e) {
      console.error('获取文件列表失败:', e);
      Toast({ message: '网络请求失败，请检查后端服务是否运行', theme: 'error' });
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
      Toast({ message: '文件 URL 不存在', theme: 'error' });
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
                Toast({ message: '打开成功', theme: 'success' });
              },
              fail: () => {
                Toast({ message: '打开失败', theme: 'error' });
              }
            });
          }
        },
        fail: () => {
          wx.hideLoading();
          Toast({ message: '下载失败', theme: 'error' });
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
      Toast({ message: '文件 URL 不存在', theme: 'error' });
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
                Toast({ message: `已保存 ${file.name} 到相册`, theme: 'success' });
              },
              fail: (err) => {
                if (err.errMsg.includes('auth deny')) {
                  Toast({ message: '请授权保存图片到相册', theme: 'warning' });
                  wx.openSetting();
                } else {
                  Toast({ message: '保存失败', theme: 'error' });
                }
              }
            });
          } else {
            wx.openDocument({
              filePath: tempPath,
              showMenu: true,
              success: () => {
                Toast({ message: '打开成功', theme: 'success' });
              },
              fail: () => {
                Toast({ message: '打开失败', theme: 'error' });
              }
            });
          }
        } else {
          Toast({ message: '下载失败', theme: 'error' });
        }
      },
      fail: () => {
        wx.hideLoading();
        Toast({ message: '下载失败', theme: 'error' });
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
              Toast({ message: '删除成功', theme: 'success' });
              this.fetchFileList();
            } else {
              Toast({ message: result.message || '删除失败', theme: 'error' });
            }
          } catch (e) {
            console.error('删除失败:', e);
            Toast({ message: '删除失败', theme: 'error' });
          }
        }
      }
    });
  },

  // 批量删除
  batchDelete() {
    if (this.data.selectedFiles.length === 0) {
      Toast({ message: '请先选择要删除的文件', theme: 'warning' });
      return;
    }

    wx.showModal({
      title: '确认批量删除',
      content: `确定要删除选中的 ${this.data.selectedFiles.length} 个文件吗？此操作不可恢复。`,
      confirmColor: '#d54941',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });

          const keys = [...this.data.selectedFiles];
          let successCount = 0;
          let failCount = 0;

          // 优先尝试批量删除接口
          try {
            const result = await apiDeleteFiles(keys);
            if (result.code === 0) {
              successCount = keys.length;
            } else {
              // 批量接口失败，降级为循环删除
              console.log('批量删除失败，降级为循环删除:', result.message);
              for (const key of keys) {
                const r = await apiDeleteFile(key);
                if (r.code === 0) successCount++;
                else failCount++;
              }
            }
          } catch (e) {
            // 网络错误，降级为循环删除
            console.log('批量删除请求失败，降级为循环删除:', e.message);
            for (const key of keys) {
              try {
                const r = await apiDeleteFile(key);
                if (r.code === 0) successCount++;
                else failCount++;
              } catch {
                failCount++;
              }
            }
          }

          wx.hideLoading();

          if (failCount === 0) {
            Toast({ message: `批量删除成功，共删除 ${successCount} 个文件`, theme: 'success' });
          } else {
            Toast({ message: `删除完成，成功 ${successCount} 个，失败 ${failCount} 个`, theme: failCount > successCount ? 'error' : 'warning' });
          }

          this.setData({ selectedFiles: [] });
          this.fetchFileList();
        }
      }
    });
  },

  // 选择文件上传
  chooseFile() {
    if (!hasConfig()) {
      Toast({ message: '请先配置 COS 参数', theme: 'warning' });
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
        Toast({ message: `${file.name} 上传成功`, theme: 'success' });

      } catch (e) {
        console.error(`上传 ${file.name} 失败:`, e);
        this.setData({
          [`uploadQueue[${i}].status`]: 'fail'
        });
        Toast({ message: `${file.name} 上传失败`, theme: 'error' });
      }
    }

    setTimeout(() => {
      this.setData({ uploadQueue: [] });
      this.fetchFileList();
    }, 1500);
  }
});
