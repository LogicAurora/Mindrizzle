import { mdiCheckboxMarkedOutline } from '@mdi/js'

import { escapeHtml } from '../../../utils/escapeHtml.ts'
import { TASK_LIST_BLOCK_CONSTRAINTS } from '../Registry/componentConstraints.ts'
import type { TaskItem, TaskListBlockConfig } from '../Registry/canvasComponents.ts'
import { defineBlock } from '../Sdk/defineBlock.ts'
import TaskListBlockEmbed from './TaskListBlock/TaskListBlockEmbed.vue'
import TaskSettings from './TaskListBlock/TaskSettings.vue'
import { normalizeTasks } from './TaskListBlock/taskItems.ts'

const ROW_STYLE = 'display:flex;align-items:center;gap:8px;padding:1px 2px;font-size:12px'
const DONE_ROW_STYLE = `${ROW_STYLE};text-decoration:line-through;opacity:.5`
const SNAPSHOT_STYLE = 'width:100%;height:100%;padding:10px 12px;box-sizing:border-box;overflow:hidden'

// 任务行是 input，innerHTML 拿不到值，所以快照必须自己出文本
export default defineBlock<TaskListBlockConfig>({
  key: 'TaskListBlock',
  title: '任务',
  description: '可勾选的任务清单',
  icon: mdiCheckboxMarkedOutline,
  addId: 'add-task',
  order: 80,
  constraints: TASK_LIST_BLOCK_CONSTRAINTS,
  defaultConfig: () => ({
    title: '',
    tasks: [
      { id: 'task-1', text: '', done: false },
      { id: 'task-2', text: '', done: false },
      { id: 'task-3', text: '', done: false },
    ],
  }),
  defaultSize: { w: 320, h: 220 },
  titleOf: (config) => (config.title ? `任务 : ${config.title}` : '任务'),
  settings: TaskSettings,
  embed: {
    nodeName: 'TaskListBlock',
    component: TaskListBlockEmbed,
    toProps: (config) => ({ title: config.title ?? '', tasks: config.tasks ?? [] }),
    fromProps: (props) => ({ title: String(props.title ?? ''), tasks: normalizeTasks(props.tasks) }),
  },
  snapshot: (config) => {
    const tasks = Array.isArray(config.tasks) ? config.tasks : []
    const rows = tasks.map((task) => {
      const item = task as Partial<TaskItem>
      const isDone = item.done === true
      const mark = isDone ? '☑' : '☐'
      return `<div style="${isDone ? DONE_ROW_STYLE : ROW_STYLE}"><span>${mark}</span>` +
        `<span>${escapeHtml(String(item.text ?? ''))}</span></div>`
    }).join('')
    const heading = config.title
      ? `<div style="font-size:13px;font-weight:600;margin-bottom:6px">${escapeHtml(String(config.title))}</div>`
      : ''
    const empty = '<div style="font-size:12px;opacity:.4">还没有任务</div>'
    return `<div style="${SNAPSHOT_STYLE}">${heading}${rows || empty}</div>`
  },
})
