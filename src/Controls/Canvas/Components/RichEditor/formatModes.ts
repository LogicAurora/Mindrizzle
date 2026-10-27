import { mdiFormatBold, mdiFormatHeader1, mdiFormatItalic, mdiFormatUnderline, mdiMouse } from '@mdi/js'

export interface FormatMode {
  icon: string
  label: string
  description: string
}

// 指针代表“不改格式”，applyFormatMode 对索引 0 不执行命令
export const FORMAT_MODES: readonly FormatMode[] = [
  { icon: mdiFormatHeader1, label: '标题', description: '把选区切换为一级标题' },
  { icon: mdiFormatBold, label: '加粗', description: '加粗或取消加粗选区文字' },
  { icon: mdiFormatItalic, label: '斜体', description: '倾斜或取消倾斜选区文字' },
  { icon: mdiFormatUnderline, label: '下划线', description: '给选区文字加下划线或取消' },
]
