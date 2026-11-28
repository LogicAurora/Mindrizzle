import { isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { error as logError } from '@tauri-apps/plugin-log';
import { computed, readonly, ref, shallowRef } from 'vue';

import { applyUpdate, canSelfUpdate, checkForUpdates, type UpdateInfo } from './updater';

const UPDATE_PROGRESS_EVENT = 'update-progress';

export type UpdatePhase =
  'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'installing' | 'failed';

type UpdateProgressPayload =
  { stage: 'downloading'; downloaded: number; total: number | null } | { stage: 'installing' };

const phase = ref<UpdatePhase>('idle');
const info = shallowRef<UpdateInfo | null>(null);
const errorMessage = ref('');
const isDialogOpen = ref(false);
const isSupported = ref(false);
// 调试页注入假更新时置真，避免把预览当成真的可安装更新
const isPreview = ref(false);
// null 表示远端没给总大小，进度条走不确定态
const downloadPercent = ref<number | null>(null);

let supportPromise: Promise<void> | null = null;
let hasAutoChecked = false;
let progressListener: UnlistenFn | undefined;

export const updatePhase = readonly(phase);
export const updateInfo = readonly(info);
export const updateError = readonly(errorMessage);
export const isUpdateDialogOpen = readonly(isDialogOpen);
export const isUpdateSupported = readonly(isSupported);
export const isUpdatePreview = readonly(isPreview);
export const updatePercent = readonly(downloadPercent);

export const isUpdateBusy = computed(
  () => phase.value === 'checking' || phase.value === 'downloading' || phase.value === 'installing',
);

export const isUpdateProgressVisible = computed(
  () => phase.value === 'checking' || phase.value === 'downloading' || phase.value === 'installing',
);

export function ensureUpdateSupport() {
  supportPromise ??= resolveUpdateSupport();
  return supportPromise;
}

async function resolveUpdateSupport() {
  if (!isTauri()) return;
  try {
    isSupported.value = await canSelfUpdate();
  } catch (error) {
    // 能力查询失败按不支持处理，避免把用户引到会覆盖安装文件的路径
    isSupported.value = false;
    void logError(`查询更新能力失败：${describeError(error)}`);
    return;
  }
  if (!isSupported.value) return;
  try {
    progressListener ??= await listen<UpdateProgressPayload>(UPDATE_PROGRESS_EVENT, (event) =>
      handleProgress(event.payload),
    );
  } catch (error) {
    void logError(`监听更新进度失败：${describeError(error)}`);
  }
}

export function disposeUpdateListener() {
  progressListener?.();
  progressListener = undefined;
  supportPromise = null;
}

export async function checkForUpdatesOnStartup() {
  if (hasAutoChecked) return;
  hasAutoChecked = true;
  await runCheck({ isSilent: true });
}

export async function runCheck(options: { isSilent?: boolean } = {}) {
  if (!isTauri() || isUpdateBusy.value) return;
  await ensureUpdateSupport();
  if (!isSupported.value) return;

  isPreview.value = false;
  phase.value = 'checking';
  errorMessage.value = '';
  try {
    const result = await checkForUpdates();
    if (!result.available) {
      phase.value = options.isSilent ? 'idle' : 'latest';
      return;
    }
    info.value = {
      version: result.version,
      currentVersion: result.currentVersion,
      notes: result.notes,
    };
    phase.value = 'available';
    isDialogOpen.value = true;
  } catch (error) {
    info.value = null;
    errorMessage.value = `检查更新失败：${describeError(error)}`;
    phase.value = options.isSilent ? 'idle' : 'failed';
    if (options.isSilent) void logError(errorMessage.value);
  }
}

export async function installUpdate() {
  if (!isTauri() || !isSupported.value || isUpdateBusy.value) return;
  if (phase.value !== 'available' || isPreview.value) return;

  phase.value = 'downloading';
  downloadPercent.value = null;
  errorMessage.value = '';
  isDialogOpen.value = true;
  try {
    await applyUpdate();
  } catch (error) {
    errorMessage.value = `安装更新失败：${describeError(error)}`;
    phase.value = 'failed';
    void logError(errorMessage.value);
  }
}

export function closeUpdateDialog() {
  isDialogOpen.value = false;
}

export function previewUpdate(preview: UpdateInfo) {
  info.value = preview;
  phase.value = 'available';
  errorMessage.value = '';
  downloadPercent.value = null;
  isPreview.value = true;
  isDialogOpen.value = true;
}

export function resetUpdateState() {
  phase.value = 'idle';
  info.value = null;
  errorMessage.value = '';
  downloadPercent.value = null;
  isPreview.value = false;
  isDialogOpen.value = false;
}

function handleProgress(payload: UpdateProgressPayload) {
  if (payload.stage === 'installing') {
    phase.value = 'installing';
    return;
  }
  phase.value = 'downloading';
  downloadPercent.value =
    payload.total && payload.total > 0
      ? Math.min(100, Math.round((payload.downloaded / payload.total) * 100))
      : null;
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
