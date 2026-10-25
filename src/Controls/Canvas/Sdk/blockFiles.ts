import { ComponentDataStore } from '../../../utils/componentDataStore.ts'

import type { BlockFiles } from './block.types.ts'

export const createBlockFiles = (uuid: string): BlockFiles => {
  // 构造时捕获当前笔记，块被虚拟化重建后也不会读到别的笔记
  const store = new ComponentDataStore()
  const url = (path: string) => store.urlOf(uuid, path)
  return {
    url,
    readText: (path) => store.readText(url(path)),
    readBinary: (path) => store.readFile(url(path)),
    write: (path, content) => store.writeFile(url(path), content),
    list: () => store.listFiles(uuid),
    remove: (path) => store.deleteFile(url(path)),
    exists: (path) => store.hasFile(url(path)),
    exportTo: (path, targetPath) => store.exportFile(url(path), targetPath),
  }
}
