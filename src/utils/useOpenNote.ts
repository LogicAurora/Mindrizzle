import { inject } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { fileOperations } from '../fileOperations';
import { noteFileContextOf, type NoteFileLocation } from '../fileOperations/types';
import { loadEditorComponent, storePendingEditorBody, type EditorBodyResult } from './editorRoute';
import {
  isDebugLoadingEnabled,
  noteLoadControllerKey,
  startEditorTransitionKey,
} from './routeTransition';
import { recordRecentNote } from './homeActivity';

export function useOpenNote() {
  const startEditorTransition = inject(startEditorTransitionKey)!;
  const noteLoadController = inject(noteLoadControllerKey)!;

  return async function openNote(note: NoteFileLocation): Promise<void> {
    const noteContext = noteFileContextOf(note);
    noteLoadController.setName(noteContext.fileName);
    let unlisten: (() => void) | undefined;
    try {
      if (isTauri()) {
        unlisten = await listen<number>('file-load-progress', (event) => {
          noteLoadController.setProgress(event.payload);
        });
      }

      const bodyPromise: Promise<EditorBodyResult> = fileOperations
        .getNoteBody(note, isDebugLoadingEnabled.value)
        .then(
          (body) => ({ content: body.content ?? '' }),
          (error: unknown) => ({ error }),
        );
      storePendingEditorBody(noteContext, bodyPromise);
      await Promise.all([loadEditorComponent(), bodyPromise]);
      const didNavigate = await startEditorTransition(
        {
          name: 'editor',
          params: { fileName: noteContext.fileName },
          query: {
            ...(noteContext.dir ? { dir: noteContext.dir } : {}),
            ...(noteContext.filePath ? { path: noteContext.filePath } : {}),
          },
        },
        () => Promise.resolve(),
      );
      if (didNavigate) recordRecentNote(noteContext);
    } finally {
      unlisten?.();
    }
  };
}
