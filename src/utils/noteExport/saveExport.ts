// SPDX-License-Identifier: MIT
import { invoke, isTauri } from '@tauri-apps/api/core';
import { save as saveNativeFile } from '@tauri-apps/plugin-dialog';

import { safeFileName } from './exportAssets';

const DOWNLOAD_TIMEOUT_MS = 10_000;

function downloadInBrowser(fileName: string, content: string): string {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_TIMEOUT_MS);
  return fileName;
}

/** 返回实际保存位置；用户取消时返回 null */
export async function saveHtmlFile(title: string, content: string): Promise<string | null> {
  const fileName = `${safeFileName(title)}.html`;
  if (!isTauri()) return downloadInBrowser(fileName, content);

  const path = await saveNativeFile({
    defaultPath: fileName,
    filters: [{ name: 'HTML 网页', extensions: ['html'] }],
  });
  if (!path) return null;
  await invoke('save_export_file', { path, content });
  return path;
}
