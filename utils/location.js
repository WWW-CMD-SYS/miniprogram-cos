/**
 * 物流坐标上报工具
 *
 * 用法：
 *   import { startTracking, stopTracking, getTrackingStatus } from '../../utils/location'
 *
 *   // 开始持续追踪
 *   startTracking({
 *     deviceId: 'truck-001',
 *     serverUrl: 'http://wxjsun.com:3001',
 *     onUpdate: (pos) => console.log(pos)
 *   })
 *
 *   // 查看当前是否在追踪
 *   getTrackingStatus()
 *
 *   // 停止追踪
 *   stopTracking()
 */

// ====================== 内部状态 ======================

// 是否正在追踪
let isTracking = false
// 微信位置变化的回调函数引用（用于注销监听）
let locationListener = null
// 追踪配置
let options = {}
// 外部传入的位置更新回调
let updateCallback = null
// 上次上报服务器的时间戳（用于限频）
let lastReportTime = 0

// 默认服务器地址
const DEFAULT_SERVER = 'http://wxjsun.com:3001'

// ====================== 对外方法 ======================

/**
 * 开始持续追踪位置，定时上报到服务器
 * @param {Object} opts 配置项
 * @param {string} opts.deviceId - 设备/车辆编号，默认 'default'
 * @param {string} opts.serverUrl - 坐标接收服务器地址
 * @param {Function} opts.onUpdate - 每次获取到位置后的回调 (pos) => {}
 * @param {number} opts.interval - 上报间隔（毫秒），默认 3000
 */
export function startTracking(opts = {}) {
  if (isTracking) {
    console.warn('[Location] 已在追踪中，请勿重复开启')
    return
  }

  // 保存配置
  options = {
    deviceId: opts.deviceId || 'default',
    serverUrl: opts.serverUrl || DEFAULT_SERVER,
    interval: opts.interval || 3000,
  }
  updateCallback = opts.onUpdate || null

  // 提前标记为追踪中，避免 stopTracking() 在异步过程中因状态不对而失效
  isTracking = true

  // 位置变化时的处理函数：把微信返回的坐标整理后，通知页面并上报服务器
  locationListener = (res) => {
    const pos = {
      lng: res.longitude,       // 经度
      lat: res.latitude,        // 纬度
      speed: res.speed || 0,    // 速度（米/秒）
      heading: 0,               // 设备方向角，微信 onLocationChange 不返回此字段，固定为 0
      accuracy: res.accuracy || 0, // 定位精度（米）
      time: Date.now()          // 当前时间戳（毫秒）
    }
    console.log('[Location] 位置更新:', pos.lng, pos.lat)

    if (updateCallback) {
      updateCallback(pos)
    }

    reportPosition(pos)
  }

  // 启动微信小程序的持续定位
  wx.startLocationUpdate({
    success: () => {
      // 可能在等待期间用户已经调用了 stopTracking()
      if (!isTracking) {
        console.warn('[Location] 已在启动过程中被停止，不再注册监听')
        return
      }
      //微信持续获取位置信息的方法--注册位置变化监听：每当 GPS 检测到位置变化，就触发 locationListener 处理
      wx.onLocationChange(locationListener)
      console.log('[Location] 追踪已启动, deviceId=' + options.deviceId)
    },
    fail: (err) => {
      console.error('[Location] 启动定位失败:', err)
      // 启动失败，回滚状态
      isTracking = false
      locationListener = null
      updateCallback = null
      wx.showModal({
        title: '定位失败',
        content: '请在设置中允许小程序使用位置信息',
        showCancel: false
      })
    }
  })
}

/**
 * 停止位置追踪，注销监听
 */
export function stopTracking() {
  if (!isTracking) return

  // 注销微信的位置监听
  if (locationListener) {
    wx.offLocationChange(locationListener)
    locationListener = null
  }

  // 停止微信的定位服务
  wx.stopLocationUpdate({
    success: () => {
      console.log('[Location] 定位服务已关闭')
    }
  })

  // 重置内部状态
  isTracking = false
  updateCallback = null
  lastReportTime = 0
  console.log('[Location] 追踪已停止')
}

/**
 * 查询当前是否正在追踪
 * @returns {boolean}
 */
export function getTrackingStatus() {
  return isTracking
}

// ====================== 内部方法 ======================

/**
 * 把位置数据 POST 到后台服务器
 * 内置限频逻辑，按 options.interval 控制上报频率
 */
function reportPosition(pos) {
  const now = Date.now()
  if (now - lastReportTime < options.interval) return
  lastReportTime = now

  wx.request({
    url: `${options.serverUrl}/api/location`,
    method: 'POST',
    data: {
      lng: pos.lng,           // 经度
      lat: pos.lat,           // 纬度
      speed: pos.speed,       // 速度（米/秒）
      heading: pos.heading,   // 设备方向角（0~360）
      deviceId: options.deviceId, // 设备/车辆编号
    },
    success: (res) => {
      if (res.data?.code === 0) {
        console.log('[Location] 上报成功')
      } else {
        console.warn('[Location] 上报失败:', res.data?.message)
      }
    },
    fail: (err) => {
      console.error('[Location] 网络请求失败:', err)
    }
  })
}
