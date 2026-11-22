import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { error as logError } from '@tauri-apps/plugin-log';

import type { NoteFileLocation } from '../fileOperations/types';
import { getErrorMessage } from './getErrorMessage';
import { loadWorkspaceState, rememberExternalNote } from './workspaceStore';

const OPEN_FILE_EVENT = 'mdrf-open-file';
const PENDING_OPEN_COMMAND = 'take_pending_open_file';
const MDRF_EXTENSION = /\.mdrf$/i;
const PATH_SEPARATOR = /[\\/]/;

interface OpenFileRequest {
  id: number;
  path: string;
}

const fileNameOfPath = (path: string): string =>
  (path.split(PATH_SEPARATOR).pop() ?? '').replace(MDRF_EXTENSION, '');

async function rememberOpenedFile(path: string, fileName: string) {
  try {
    // 先加载既有记录，避免直接写设置时覆盖用户已收藏的其他外部笔记
    await loadWorkspaceState();
    await rememberExternalNote({ path, fileName, name: fileName, updatedAt: Date.now() });
  } catch (error) {
    await logError(`记录外部笔记失败：${getErrorMessage(error)}`);
  }
}

export function watchOsOpenFile(openNote: (note: NoteFileLocation) => Promise<void>): () => void {
  if (!isTauri()) return () => undefined;

  let isStopped = false;
  let unlisten: (() => void) | undefined;
  let lastHandledId = 0;

  const openRequest = async (request: OpenFileRequest) => {
    if (request.id <= lastHandledId) return;
    lastHandledId = request.id;
    const fileName = fileNameOfPath(request.path);
    if (!MDRF_EXTENSION.test(request.path) || !fileName) return;
    try {
      await openNote({ kind: 'externalFile', fileName, filePath: request.path });
    } catch (error) {
      await logError(`打开关联笔记失败：${getErrorMessage(error)}`);
      return;
    }
    await rememberOpenedFile(request.path, fileName);
  };

  void (async () => {
    unlisten = await listen<OpenFileRequest>(OPEN_FILE_EVENT, (event) => {
      void openRequest(event.payload);
    });
    if (isStopped) {
      unlisten();
      return;
    }
    try {
      const pending = await invoke<OpenFileRequest | null>(PENDING_OPEN_COMMAND);
      if (pending) await openRequest(pending);
    } catch (error) {
      await logError(`读取启动关联文件失败：${getErrorMessage(error)}`);
    }
  })();

  return () => {
    isStopped = true;
    unlisten?.();
  };
}
