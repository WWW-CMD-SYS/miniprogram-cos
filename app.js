// app.js
App({
  onLaunch() {
    // 初始化主题
    const saved = wx.getStorageSync('cos_manager_theme');
    const isDark = saved ? saved === 'dark' : true;
    wx.setStorageSync('cos_manager_theme', isDark ? 'dark' : 'light');
  }
})
