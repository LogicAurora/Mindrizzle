import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateChannel = 'stable' | 'beta' | 'alpha';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
}

export type UpdateCheckResult =
  { available: false } | ({ available: true } & UpdateInfo & { channel: UpdateChannel });

const CHANNEL_STORAGE_KEY = 'updater_channel';
const UPDATE_CHANNELS: readonly UpdateChannel[] = ['stable', 'beta', 'alpha'];

// localStorage 可能残留旧版本或手工写入的非法值，读时统一回落到 stable
export function readUpdateChannel(): UpdateChannel {
  const stored = localStorage.getItem(CHANNEL_STORAGE_KEY);
  return UPDATE_CHANNELS.find((item) => item === stored) ?? 'stable';
}

export function saveUpdateChannel(channel: UpdateChannel) {
  localStorage.setItem(CHANNEL_STORAGE_KEY, channel);
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const channel = readUpdateChannel();
  const update = await invoke<UpdateInfo | null>('check_update', { channel });
  return update ? { available: true, ...update, channel } : { available: false };
}

// 只有被 tauri bundler 打过 bundle 标记的安装（AppImage/deb/rpm/NSIS/.app）才能被 updater 原地替换
export async function canSelfUpdate(): Promise<boolean> {
  return invoke<boolean>('supports_self_update');
}

export async function applyUpdate() {
  await invoke('install_update', { channel: readUpdateChannel() });
  await relaunch();
}
