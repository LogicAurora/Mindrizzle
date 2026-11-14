// SPDX-License-Identifier: MIT
import { ref } from 'vue';

import { getSetting, setSetting } from './settingsStore';

export const DEVELOPER_MODE_SETTING_KEY = 'developer-mode';

// 开发者入口只在用户显式开启后出现，构建环境不参与判断
export const isDeveloperMode = ref(false);

export function isDeveloperModeValue(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export async function loadDeveloperMode(): Promise<void> {
  const saved = await getSetting<unknown>(DEVELOPER_MODE_SETTING_KEY);
  if (isDeveloperModeValue(saved)) isDeveloperMode.value = saved;
}

export async function saveDeveloperMode(enabled: boolean): Promise<void> {
  isDeveloperMode.value = enabled;
  await setSetting(DEVELOPER_MODE_SETTING_KEY, enabled);
}
