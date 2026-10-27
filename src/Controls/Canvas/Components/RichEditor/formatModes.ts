import { mdiFormatBold, mdiFormatHeader1, mdiFormatItalic, mdiFormatUnderline } from '@mdi/js'

export type FormatModeId = 'heading' | 'bold' | 'italic' | 'underline'

export interface FormatMode {
  id: FormatModeId
  icon: string
  label: string
  description: string
}

export const FORMAT_MODES: readonly FormatMode[] = [
  { id: 'heading', icon: mdiFormatHeader1, label: '标题', description: '把选区切换为一级标题' },
  { id: 'bold', icon: mdiFormatBold, label: '加粗', description: '加粗或取消加粗选区文字' },
  { id: 'italic', icon: mdiFormatItalic, label: '斜体', description: '倾斜或取消倾斜选区文字' },
  { id: 'underline', icon: mdiFormatUnderline, label: '下划线', description: '给选区文字加下划线或取消' },
]
