// SPDX-License-Identifier: MIT

// ComponentDataStore 可能在任意块组件里构造，而路由参数只在编辑页可见，所以用模块级上下文共享
let currentFileName = ''

export const setCurrentNoteFileName = (fileName: string): void => {
  currentFileName = fileName
}

export const getCurrentNoteFileName = (): string => currentFileName
