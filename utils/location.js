/**
 * 物流坐标上报工具
 *
 * 用法：
 *   import { startTracking, stopTracking, getCurrentPosition } from '../../utils/location'
 *
 *   // 开始持续追踪
 *   startTracking({
 *     deviceId: 'truck-001',
 *     serverUrl: 'http://192.168.1.100:3001',
 *     onUpdate: (pos) => console.log(pos)
 *   })
 *
 *   // 停止追踪
 *   stopTracking()
 *
 *   // 单次获取
 *   const pos = await getCurrentPosition()
 */

// ====================== 状态管理 ======================
let isTracking = false
let locationListener = null
let options = {}
let updateCallback = null

// 默认服务器地址（开发时请替换为你的电脑局域网 IP）
const DEFAULT_SERVER = 'http://192.168.1.100:3001'

// ====================== 持续追踪 ======================

/**
 * 开始持续上报位置
 * @param {Object} opts
 * @param {string} opts.deviceId - 设备/车辆编号
 * @param {string} opts.serverUrl - 坐标接收服务器地址
 * @param {Function} opts.onUpdate - 位置更新回调 (pos) => {}
 * @param {number} opts.interval - 上报间隔(毫秒)，默认 3000
 */
export function startTracking(opts = {}) {
  if (isTracking) {
    console.warn('[Location] 已在追踪中')
    return
  }

  options = {
    deviceId: opts.deviceId || 'default',
    serverUrl: opts.serverUrl || DEFAULT_SERVER,
    interval: opts.interval || 3000,
  }
  updateCallback = opts.onUpdate || null

  // ✅ 关键修复：先标记追踪状态为 true，确保 stopTracking() 能立即生效
  // 之前将 isTracking=true 放在 wx.startLocationUpdate 的 success 回调中，
  // 导致异步时序下 stopTracking() 因状态仍未更新而提前 return，无法停止追踪
  isTracking = true

  // 注册位置变化回调（在启动监听前预定义，避免竞态）
  locationListener = (res) => {
    const pos = {
      lng: res.longitude,
      lat: res.latitude,
      speed: res.speed || 0,
      heading: 0,          // 小程序 onLocationChange 不返回 heading
      accuracy: res.accuracy || 0,
      time: Date.now()
    }
    console.log('[Location] 位置更新:', pos.lng, pos.lat)

    // 通知回调
    if (updateCallback) {
      updateCallback(pos)
    }

    // 上报到后台
    reportPosition(pos)
  }

  // 启动位置监听（前台定位）
  wx.startLocationUpdate({
    success: () => {
      // 二次检查：用户可能已在异步期间调用了 stopTracking()
      if (!isTracking) {
        console.warn('[Location] 追踪已在启动过程中被停止，跳过监听注册')
        return
      }
      console.log('[Location] 位置监听已启动')
      // 注册位置变化回调
      wx.onLocationChange(locationListener)
      console.log('[Location] 持续追踪已开始 deviceId=' + options.deviceId)
    },
    fail: (err) => {
      console.error('[Location] 启动位置监听失败:', err)
      // 失败时回滚状态，保证 stopTracking() 不会误认为仍在追踪
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
 * 停止上报
 */
export function stopTracking() {
  if (!isTracking) return

  if (locationListener) {
    wx.offLocationChange(locationListener)
    locationListener = null
  }

  wx.stopLocationUpdate({
    success: () => {
      console.log('[Location] 位置监听已停止')
    }
  })

  isTracking = false
  updateCallback = null
  console.log('[Location] 持续追踪已停止')
}

/**
 * 获取追踪状态
 */
export function getTrackingStatus() {
  return isTracking
}

// ====================== 单次定位 ======================

/**
 * 获取当前单次位置（使用 gcj02 坐标系，与高德地图兼容）
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        resolve({
          lng: res.longitude,
          lat: res.latitude,
          speed: res.speed || 0,
          accuracy: res.accuracy || 0,
          time: Date.now()
        })
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

// ====================== 内部：上报到服务器 ======================

let lastReportTime = 0

function reportPosition(pos) {
  const now = Date.now()
  // 限频：避免过于频繁的请求
  if (now - lastReportTime < options.interval) return
  lastReportTime = now

  wx.request({
    url: `${options.serverUrl}/api/location`,
    method: 'POST',
    data: {
      lng: pos.lng,
      lat: pos.lat,
      speed: pos.speed,
      heading: pos.heading,
      deviceId: options.deviceId,
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
