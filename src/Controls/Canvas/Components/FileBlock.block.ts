import { mdiPaperclip } from '@mdi/js'

import { escapeHtml } from '../../../utils/escapeHtml.ts'
import { formatBytes } from '../../../utils/formatBytes.ts'
import { FILE_BLOCK_CONSTRAINTS } from '../Registry/componentConstraints.ts'
import type { FileBlockConfig } from '../Registry/canvasComponents.ts'
import { defineBlock } from '../Sdk/defineBlock.ts'
import FileBlockEmbed from './FileBlock/FileBlockEmbed.vue'
import FileSettings from './FileBlock/FileSettings.vue'

const SNAPSHOT_STYLE =
  'display:flex;align-items:center;gap:10px;width:100%;height:100%;padding:16px;box-sizing:border-box;font-size:12px'

// 预览图是运行时 blob URL，实例一销毁就失效，所以快照只画文件卡片
export default defineBlock<FileBlockConfig>({
  key: 'FileBlock',
  title: '附件',
  icon: mdiPaperclip,
  addId: 'add-file',
  order: 50,
  constraints: FILE_BLOCK_CONSTRAINTS,
  defaultConfig: () => ({ path: '', name: '', mime: '', size: 0 }),
  defaultSize: { w: 300, h: 180 },
  settings: FileSettings,
  embed: {
    nodeName: 'FileBlock',
    component: FileBlockEmbed,
    toProps: (config) => ({ path: config.path, name: config.name, mime: config.mime, size: config.size }),
    fromProps: (props) => ({
      path: String(props.path ?? ''),
      name: String(props.name ?? ''),
      mime: String(props.mime ?? ''),
      size: Number(props.size ?? 0),
    }),
  },
  snapshot: (config) => {
    const name = String(config.name ?? '')
    if (!config.path) return `<div style="${SNAPSHOT_STYLE}">还没有附件</div>`
    return `<div style="${SNAPSHOT_STYLE}"><span>${escapeHtml(name)}</span><span>${formatBytes(Number(config.size ?? 0))}</span></div>`
  },
})
