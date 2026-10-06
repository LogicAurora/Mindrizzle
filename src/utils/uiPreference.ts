// SPDX-License-Identifier: MIT
import { ref } from 'vue'

import { getSetting, setSetting } from './settingsStore'

export const TITLE_ROLL_SETTING_KEY = 'title-roll-direction'

export type TitleRollDirection = 'top-down' | 'bottom-up'

export const DEFAULT_TITLE_ROLL_DIRECTION: TitleRollDirection = 'top-down'

export const titleRollDirection = ref<TitleRollDirection>(DEFAULT_TITLE_ROLL_DIRECTION)

export function isTitleRollDirection(value: unknown): value is TitleRollDirection {
  return value === 'top-down' || value === 'bottom-up'
}

export async function loadTitleRollDirection(): Promise<void> {
  const saved = await getSetting<unknown>(TITLE_ROLL_SETTING_KEY)
  if (isTitleRollDirection(saved)) titleRollDirection.value = saved
}

export async function saveTitleRollDirection(direction: TitleRollDirection): Promise<void> {
  titleRollDirection.value = direction
  await setSetting(TITLE_ROLL_SETTING_KEY, direction)
}
