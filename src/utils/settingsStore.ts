import { invoke, isTauri } from '@tauri-apps/api/core'

const SETTINGS_KEY_PREFIX = 'mindrizzle:setting:'

function validateKey(key: string): void {
  if (!key.trim()) throw new Error('设置键不能为空')
}

/**
 * 读取设置；Tauri 从应用配置目录读取，网页端从 localStorage 读取。
 * 不存在时返回 null，调用方应通过类型参数声明期望的数据结构。
 * @example const theme = await getSetting<'light' | 'dark'>('theme')
 */
export async function getSetting<T>(key: string): Promise<T | null> {
  validateKey(key)
  if (isTauri()) return invoke<T | null>('get_setting', { key })

  const storedValue = localStorage.getItem(`${SETTINGS_KEY_PREFIX}${key}`)
  return storedValue === null ? null : JSON.parse(storedValue) as T
}

/**
 * 保存设置；同一键会被新值完整覆盖，不会合并对象。
 * 值必须可序列化为 JSON，键不能为空。
 * @example await setSetting('theme', 'dark')
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  validateKey(key)
  if (isTauri()) {
    await invoke('set_setting', { key, value })
    return
  }

  const serializedValue = JSON.stringify(value)
  if (serializedValue === undefined) throw new Error('设置值必须可序列化为 JSON')
  localStorage.setItem(`${SETTINGS_KEY_PREFIX}${key}`, serializedValue)
}

/**
 * 删除指定设置，不影响其他设置键。
 * @example await removeSetting('theme')
 */
export async function removeSetting(key: string): Promise<void> {
  validateKey(key)
  if (isTauri()) {
    await invoke('remove_setting', { key })
    return
  }

  localStorage.removeItem(`${SETTINGS_KEY_PREFIX}${key}`)
}