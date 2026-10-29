import { mdiTableLarge } from '@mdi/js'

import { escapeHtml } from '../../../utils/escapeHtml.ts'
import { TABLE_BLOCK_CONSTRAINTS } from '../Registry/componentConstraints.ts'
import type { TableBlockConfig } from '../Registry/canvasComponents.ts'
import { defineBlock } from '../Sdk/defineBlock.ts'
import TableBlockEmbed from './TableBlock/TableBlockEmbed.vue'
import TableSettings from './TableBlock/TableSettings.vue'
import { normalizeTableRows } from './TableBlock/tableRows.ts'

const CELL_BASE = 'border:1px solid rgba(128,128,128,.32);padding:6px 8px;overflow:hidden;text-overflow:ellipsis'
const HEADER_CELL = `${CELL_BASE};font-weight:600;background:rgba(128,128,128,.08)`

// 单元格是 input，innerHTML 拿不到 value，所以快照必须自己出文本
export default defineBlock<TableBlockConfig>({
  key: 'TableBlock',
  title: '表格',
  description: '可编辑单元格的表格',
  icon: mdiTableLarge,
  addId: 'add-table',
  order: 70,
  constraints: TABLE_BLOCK_CONSTRAINTS,
  defaultConfig: () => ({
    rows: [
      ['列 1', '列 2', '列 3'],
      ['', '', ''],
      ['', '', ''],
    ],
    header: true,
  }),
  defaultSize: { w: 420, h: 240 },
  settings: TableSettings,
  embed: {
    nodeName: 'TableBlock',
    component: TableBlockEmbed,
    toProps: (config) => ({ rows: config.rows, header: config.header !== false }),
    fromProps: (props) => ({ rows: normalizeTableRows(props.rows), header: props.header !== false }),
  },
  snapshot: (config) => {
    const rows = Array.isArray(config.rows) ? config.rows : []
    const isHeaderRow = config.header !== false
    const cellsOf = (row: unknown, index: number) =>
      (Array.isArray(row) ? row : [])
        .map((cell) => `<td style="${isHeaderRow && index === 0 ? HEADER_CELL : CELL_BASE}">${escapeHtml(String(cell ?? ''))}</td>`)
        .join('')
    const body = rows.map((row, index) => `<tr>${cellsOf(row, index)}</tr>`).join('')
    return `<div style="width:100%;height:100%;overflow:hidden;padding:4px;box-sizing:border-box">` +
      `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px">${body}</table></div>`
  },
})
