// pages/index/index.js
import { hasConfig } from '../../utils/config';
import { listFiles, deleteFile as apiDeleteFile, deleteFiles as apiDeleteFiles, uploadFile } from '../../utils/cos';
import { getFileType } from '../../utils/format';
import { startTracking, stopTracking, getCurrentPosition, getTrackingStatus } from '../../utils/location';
import Toast from 'tdesign-miniprogram/toast/index';

Page({
  data: {
    isDark: true,
    listLoading: false,
    fileList: [],
    selectedFiles: [],
    uploadQueue: [],
    filteredFiles: [],
    isAllSelected: false,
    // 搜索相关
    searchKeyword: '',
    // 物流追踪相关
    isTracking: false,
    currentPosition: null,
  },

  /**
   * 页面加载生命周期
   * 初始化主题，检查 COS 配置，有配置则拉取文件列表，否则引导去配置页
   */
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

  /**
   * 页面显示生命周期
   * 每次切回页面时刷新文件列表（仅当列表为空时），并恢复物流追踪状态
   */
  onShow() {
    if (hasConfig() && this.data.fileList.length === 0) {
      this.fetchFileList();
    }
    // 恢复追踪状态显示
    this.setData({ isTracking: getTrackingStatus() });
  },

  /**
   * 初始化主题
   * 从本地存储读取主题偏好，默认深色模式
   */
  initTheme() {
    const saved = wx.getStorageSync('cos_manager_theme');
    this.setData({ isDark: saved !== 'light' });
    this.applyTheme(this.data.isDark);
  },

  /**
   * 应用主题到当前页面
   * @param {boolean} isDark - 是否为深色模式
   */
  applyTheme(isDark) {
    wx.setStorageSync('cos_manager_theme', isDark ? 'dark' : 'light');
    const pages = getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      currentPage.setData({ isDark });
    }
  },

  /**
   * 切换深色/浅色主题（工具方法，暂未在页面中绑定）
   */
  toggleTheme() {
    const newDark = !this.data.isDark;
    this.setData({ isDark: newDark });
    this.applyTheme(newDark);
    Toast({ message: newDark ? '已切换到深色模式' : '已切换到浅色模式', theme: 'success' });
  },

  /**
   * 跳转到 COS 配置页面
   */
  openConfig() {
    wx.navigateTo({ url: '/pages/config/index' });
  },

  /**
   * 搜索框输入事件
   * 实时根据关键词过滤文件列表
   */
  onSearchInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ searchKeyword: keyword });
    this.updateComputed();
  },

  /**
   * 搜索确认（键盘回车）
   */
  onSearchConfirm(e) {
    const keyword = e.detail.value || '';
    this.setData({ searchKeyword: keyword });
    this.updateComputed();
  },

  /**
   * 清除搜索关键词，恢复完整列表
   */
  clearSearch() {
    this.setData({ searchKeyword: '' });
    this.updateComputed();
  },

  /**
   * 核心计算：根据搜索关键词过滤、排序，并计算全选状态
   * 排序规则：按上传时间由近至远
   */
  updateComputed() {
    const { fileList, selectedFiles, searchKeyword } = this.data;

    // 根据关键词过滤文件
    let filtered = fileList;
    if (searchKeyword && searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      filtered = fileList.filter(file =>
        file.name && file.name.toLowerCase().includes(keyword)
      );
    }

    // 按上传时间由近至远排序（lastModified / LastModified 字段）
    filtered = [...filtered].sort((a, b) => {
      const timeA = new Date(a.lastModified || a.LastModified || 0).getTime();
      const timeB = new Date(b.lastModified || b.LastModified || 0).getTime();
      return timeB - timeA;
    });

    // 给每个文件添加 selected 属性
    const filesWithSelected = filtered.map(f => ({
      ...f,
      selected: selectedFiles.includes(f.key)
    }));

    // 计算是否全选
    const isAllSelected = filesWithSelected.length > 0 && filesWithSelected.every(f => f.selected);

    this.setData({
      filteredFiles: filesWithSelected,
      isAllSelected
    });
  },

  /**
   * 从后端拉取 COS 存储桶文件列表
   * 对返回的文件名做解码处理，重置搜索和选中状态
   */
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
        // 处理文件列表，提取原始文件名
        const files = (res.data.files || []).map(file => {
          // 优先使用 name 字段，否则从 key 中提取
          let name = file.name;
          if (!name && file.key) {
            // 尝试解码 URL 编码的文件名
            try {
              name = decodeURIComponent(file.key);
            } catch (e) {
              name = file.key;
            }
            // 如果解码后看起来还是哈希值（没有扩展名或太短），保留原 key
            const hasExt = /\.[a-zA-Z0-9]+$/.test(name);
            if (!hasExt && name.length < 20) {
              name = file.key;
            }
          }
          return {
            ...file,
            name: name || file.key
          };
        });

        this.setData({
          fileList: files,
          selectedFiles: [],
          searchKeyword: '' // 重置搜索
        });
        this.updateComputed();
        Toast({ message: `加载成功，共 ${files.length} 个文件`, theme: 'success' });
      } else {
        Toast({ message: res.message || '获取列表失败', theme: 'error' });
      }
    } catch (e) {
      console.error('获取文件列表失败:', e);
      Toast({ message: '网络请求失败，请检查后端服务是否运行', theme: 'error' });
    }

    this.setData({ listLoading: false });
  },

  /**
   * 切换单个文件的选中状态
   * @param {Object} e - 事件对象，需携带 data-key
   */
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

  // ==================== 物流位置追踪 ====================

  /**
   * 切换物流追踪的启动/停止状态
   */
  toggleTracking() {
    if (this.data.isTracking) {
      this.stopLocationTracking();
    } else {
      this.startLocationTracking();
    }
  },

  /**
   * 开始持续上报位置到物流服务器
   *
   * ⚠️ 启动前请先确保：
   *   1. 物流坐标中转服务已启动：node server/location-server.js
   *   2. 将 DEFAULT_SERVER 替换为你的电脑局域网 IP
   *   3. 微信开发者工具 → 详情 → 不校验合法域名（勾选）
   */
  startLocationTracking() {
    // 替换为你的服务器地址
    // 查看本机IP：ifconfig | grep "inet " | grep -v 127.0.0.1
    const serverUrl = 'http://101.43.98.105:3001';

    startTracking({
      deviceId: 'truck-001',
      serverUrl: serverUrl,
      interval: 30000,
      onUpdate: (pos) => {
        this.setData({
          currentPosition: pos
        });
      }
    });

    this.setData({ isTracking: true });
    wx.showToast({ title: '已开始追踪', icon: 'success', duration: 1500 });
  },

  /**
   * 停止物流位置追踪
   * 清除追踪状态和当前位置信息
   */
  stopLocationTracking() {
    stopTracking();
    this.setData({
      isTracking: false,
      currentPosition: null
    });
    wx.showToast({ title: '已停止追踪', icon: 'none', duration: 1500 });
  },

  /**
   * 单次获取当前位置并弹窗显示（调试用，页面中已注释）
   */
  clickMe() {
    getCurrentPosition()
      .then(pos => {
        console.log('位置为：', pos.lat, pos.lng);
        wx.showModal({
          title: '当前位置',
          content: `纬度：${pos.lat.toFixed(6)}\n经度：${pos.lng.toFixed(6)}`,
          showCancel: false,
          confirmText: '确定'
        });
      })
      .catch(() => {
        wx.showToast({ title: '定位失败，请检查权限设置', icon: 'none' });
      });
  },

  /**
   * 全选/取消全选当前过滤后的文件列表
   */
  toggleSelectAll() {
    const filtered = this.data.filteredFiles;
    const selected = [...this.data.selectedFiles];

    if (this.data.isAllSelected) {
      filtered.forEach(f => {
        const idx = selected.indexOf(f.key);
        if (idx > -1) selected.splice(idx, 1);
      });
    } else {
      filtered.forEach(f => {
        if (!selected.includes(f.key)) selected.push(f.key);
      });
    }

    this.setData({ selectedFiles: selected });
    this.updateComputed();
  },

  /**
   * 跳转到文件详情页
   * @param {Object} e - 事件对象，需携带 data-file（文件完整信息）
   */
  openFile(e) {
    const file = e.currentTarget.dataset.file;
    wx.navigateTo({
      url: `/pages/file-detail/index?file=${encodeURIComponent(JSON.stringify(file))}`
    });
  },

  /**
   * 预览文件
   * 根据文件类型选择预览方式：图片用 previewImage，视频用 previewMedia，
   * PDF/Office 先下载再用 openDocument 打开
   * @param {Object} e - 事件对象，需携带 data-file
   */
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
    } else if (type === 'video') {
      // 使用 previewMedia 预览视频（基础库 2.20.0+ 支持）
      try {
        wx.previewMedia({
          sources: [{
            url: file.url,
            type: 'video',
            poster: '' // COS 视频无封面，留空
          }],
          current: 0,
          fail: () => {
            // previewMedia 失败时降级到详情页使用 <video> 组件
            this.openFile(e);
          }
        });
      } catch (err) {
        // previewMedia API 不存在（基础库 < 2.20.0），降级到详情页
        console.warn('previewMedia 不可用，降级到详情页:', err);
        this.openFile(e);
      }
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

  /**
   * 下载文件
   * 图片类型保存到相册，其他类型用 openDocument 打开
   * @param {Object} e - 事件对象，需携带 data-file
   */
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

  /**
   * 删除单个文件（带二次确认弹窗）
   * @param {Object} e - 事件对象，需携带 data-file
   */
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

  /**
   * 批量删除选中的文件（带二次确认）
   * 优先使用批量删除接口，失败时降级为逐个删除
   */
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

  /**
   * 弹出上传来源选择菜单（相册 / 微信聊天文件）
   */
  showUploadSource() {
    if (!hasConfig()) {
      Toast({ message: '请先配置 COS 参数', theme: 'warning' });
      this.openConfig();
      return;
    }

    wx.showActionSheet({
      itemList: ['从相册选择', '从微信聊天选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 从相册选择
          this.chooseFromAlbum();
        } else if (res.tapIndex === 1) {
          // 从微信聊天选择
          this.chooseFromChat();
        }
      },
      fail: (err) => {
        console.error('选择取消:', err);
      }
    });
  },

  /**
   * 从相册选择图片/视频上传
   * 使用 wx.chooseMedia 统一选择，上传前自动按时间戳命名
   */
  chooseFromAlbum() {
    // 统一使用 chooseMedia，避免真机上同时调用 chooseImage + chooseMedia 的冲突
    wx.chooseMedia({
      count: 9,
      mediaType: ['image', 'video'],
      sourceType: ['album'],
      success: (res) => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const baseName = `${year}${month}${day}${hour}${minute}`;

        const files = res.tempFiles.map((f, index) => {
          const isVideo = f.fileType === 'video';
          const ext = isVideo ? 'mp4' : 'jpg';
          return {
            id: Date.now() + index,
            name: `${baseName}_${index + 1}.${ext}`,
            status: 'pending',
            path: f.tempFilePath,
            progress: 0
          };
        });

        if (files.length > 0) {
          this.setData({ uploadQueue: files });
          this.uploadFiles(files);
        }
      },
      fail: (err) => {
        console.error('选择文件失败:', err);
        if (!err.errMsg?.includes('cancel')) {
          Toast({ message: '选择文件失败', theme: 'error' });
        }
      }
    });
  },

  /**
   * 从微信聊天记录中选择文件上传
   * 使用 wx.chooseMessageFile，支持所有文件类型，保留原始文件名
   */
  chooseFromChat() {
    wx.chooseMessageFile({
      count: 10,
      success: (res) => {
        const files = res.tempFiles;
        const queue = files.map((f, index) => ({
          id: Date.now() + index,
          // 使用原始文件名（chooseMessageFile 会保留原始文件名）
          name: f.name || f.path.split('/').pop() || `文件${index + 1}`,
          status: 'pending',
          path: f.path,
          progress: 0
        }));

        this.setData({ uploadQueue: queue });
        this.uploadFiles(queue);
      },
      fail: (err) => {
        console.error('选择文件失败:', err);
        if (!err.errMsg.includes('cancel')) {
          Toast({ message: '选择文件失败', theme: 'error' });
        }
      }
    });
  },

  /**
   * 执行文件上传（逐个串行上传）
   * 上传完成后延迟 1.5 秒清空队列并刷新文件列表
   * @param {Array} queue - 待上传文件队列，每项包含 path、name 字段
   */
  async uploadFiles(queue) {
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      this.setData({
        [`uploadQueue[${i}].status`]: 'uploading',
        [`uploadQueue[${i}].progress`]: 0
      });

      try {
        const result = await uploadFile(file.path, file.name, {
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
