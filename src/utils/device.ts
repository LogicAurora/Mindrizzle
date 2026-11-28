// src/utils/device.ts
import { platform } from '@tauri-apps/plugin-os';
import { isTauri } from '@tauri-apps/api/core';

/**
 * 综合判断当前是否为手机端环境
 * 不依赖屏幕尺寸，仅依赖系统特征和 UA
 */
export const isMobileDevice = (): boolean => {
  // 1. 如果是在 Tauri 环境下运行
  if (isTauri()) {
    try {
      const currentPlatform = platform();
      // Tauri 环境下，直接通过底层系统判断是否为 iOS 或 Android
      return currentPlatform === 'ios' || currentPlatform === 'android';
    } catch (error) {
      console.error('获取 Tauri 平台信息失败:', error);
    }
  }

  // 2. 如果是纯 Web 浏览器环境，通过 User-Agent 判断
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent.toLowerCase();
    // 匹配常见的移动端设备标识
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/.test(userAgent);
  }

  return false;
};
