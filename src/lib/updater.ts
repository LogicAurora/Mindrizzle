import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateChannel = "stable" | "beta" | "alpha";

export type UpdateCheckResult =
  | { available: false }
  | { available: true; version: string; channel: UpdateChannel };

const CHANNEL_STORAGE_KEY = "updater_channel";
const UPDATE_CHANNELS: readonly UpdateChannel[] = ["stable", "beta", "alpha"];

// localStorage 可能残留旧版本或手工写入的非法值，读时统一回落到 stable
export function readUpdateChannel(): UpdateChannel {
  const stored = localStorage.getItem(CHANNEL_STORAGE_KEY);
  return UPDATE_CHANNELS.find((item) => item === stored) ?? "stable";
}

export function saveUpdateChannel(channel: UpdateChannel) {
  localStorage.setItem(CHANNEL_STORAGE_KEY, channel);
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const channel = readUpdateChannel();
  const version = await invoke<string | null>("check_update", { channel });
  return version ? { available: true, version, channel } : { available: false };
}

export async function applyUpdate() {
  await invoke("install_update", { channel: readUpdateChannel() });
  await relaunch();
}