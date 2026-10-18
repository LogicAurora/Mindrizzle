// Tauri 没有同步的平台查询接口，navigator.platform 在 WebKitGTK 与浏览器里都能稳定标识 Linux
export const isLinuxPlatform = /linux/i.test(navigator.platform)
