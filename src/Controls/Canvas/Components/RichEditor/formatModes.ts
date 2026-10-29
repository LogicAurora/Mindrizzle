import {
  mdiClose,
  mdiFormatBold,
  mdiFormatColorHighlight,
  mdiFormatColorText,
  mdiFormatHeader1,
  mdiFormatHeader2,
  mdiFormatHeader3,
  mdiFormatHeader4,
  mdiFormatHeader5,
  mdiFormatHeader6,
  mdiFormatItalic,
  mdiFormatTitle,
  mdiFormatUnderline,
  mdiPalette,
} from '@mdi/js'

import type { WheelOption } from '../../Core/wheelSwitch.ts'

export type FormatModeId = 'heading' | 'bold' | 'italic' | 'underline' | 'textColor' | 'highlight'

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
  { id: 'textColor', icon: mdiFormatColorText, label: '字体颜色', description: '设置文字颜色，块下方选择颜色' },
  { id: 'highlight', icon: mdiFormatColorHighlight, label: '背景高亮', description: '设置文字背景，块下方选择颜色' },
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

const COLOR_PALETTE = [
  { label: '红色', color: '#ef4444' },
  { label: '橙色', color: '#f97316' },
  { label: '琥珀', color: '#f59e0b' },
  { label: '黄色', color: '#eab308' },
  { label: '青柠', color: '#84cc16' },
  { label: '绿色', color: '#22c55e' },
  { label: '青色', color: '#14b8a6' },
  { label: '天蓝', color: '#06b6d4' },
  { label: '蓝色', color: '#3b82f6' },
  { label: '靛蓝', color: '#6366f1' },
  { label: '紫色', color: '#8b5cf6' },
  { label: '灰色', color: '#6b7280' },
] as const

export type ColorDetailKind = 'text' | 'background'

// 色板固定 12 色 + 清除 + 自定义，保证最多三行、列数自动增加
export const colorDetailsOf = (kind: ColorDetailKind, customColor: string): readonly WheelOption[] => {
  const noneLabel = kind === 'text' ? '无颜色' : '无背景'
  const noneDesc = kind === 'text' ? '清除选区文字颜色' : '清除选区背景颜色'
  return [
    { icon: mdiClose, label: noneLabel, description: noneDesc },
    ...COLOR_PALETTE.map((item) => ({
      label: item.label,
      description: kind === 'text' ? `文字设为${item.label}` : `背景设为${item.label}`,
      swatch: item.color,
    })),
    { label: '自定义颜色', description: '打开取色器选择任意颜色', icon: mdiPalette, swatch: customColor, custom: true },
  ]
}
