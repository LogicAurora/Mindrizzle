// SPDX-License-Identifier: MIT
export interface CurrentNoteRef {
  fileName: string
  dir?: string
  filePath?: string
}

// ComponentDataStore 可能在任意块组件里构造，而路由参数只在编辑页可见，所以用模块级上下文共享
let currentNote: CurrentNoteRef = { fileName: '' }

export const setCurrentNote = (note: CurrentNoteRef): void => {
  currentNote = note
}

export const getCurrentNote = (): CurrentNoteRef => currentNote
