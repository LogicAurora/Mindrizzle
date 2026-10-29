import {
  mdiFormatBold,
  mdiFormatHeader1,
  mdiFormatHeader2,
  mdiFormatHeader3,
  mdiFormatHeader4,
  mdiFormatHeader5,
  mdiFormatHeader6,
  mdiFormatItalic,
  mdiFormatTitle,
  mdiFormatUnderline,
} from '@mdi/js'

import type { WheelOption } from '../../Core/wheelSwitch.ts'

export type FormatModeId = 'heading' | 'bold' | 'italic' | 'underline'

export interface FormatMode {
  id: FormatModeId
  icon: string
  label: string
  description: string
}

export const FORMAT_MODES: readonly FormatMode[] = [
  { id: 'heading', icon: mdiFormatTitle, label: '标题', description: '切换为标题，级别在块下方调整' },
  { id: 'bold', icon: mdiFormatBold, label: '加粗', description: '加粗或取消加粗选区文字' },
  { id: 'italic', icon: mdiFormatItalic, label: '斜体', description: '倾斜或取消倾斜选区文字' },
  { id: 'underline', icon: mdiFormatUnderline, label: '下划线', description: '给选区文字加下划线或取消' },
]

// 标题模式的详情选项，索引即 level - 1
export const HEADING_DETAILS: readonly WheelOption[] = [
  { icon: mdiFormatHeader1, label: '一级标题', description: '应用一级标题样式' },
  { icon: mdiFormatHeader2, label: '二级标题', description: '应用二级标题样式' },
  { icon: mdiFormatHeader3, label: '三级标题', description: '应用三级标题样式' },
  { icon: mdiFormatHeader4, label: '四级标题', description: '应用四级标题样式' },
  { icon: mdiFormatHeader5, label: '五级标题', description: '应用五级标题样式' },
  { icon: mdiFormatHeader6, label: '六级标题', description: '应用六级标题样式' },
]
