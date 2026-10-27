import { mdiFormatBold, mdiFormatHeader1, mdiFormatItalic, mdiFormatUnderline, mdiMouse } from '@mdi/js'

export interface FormatMode {
  icon: string
  label: string
}

// 指针代表“不改格式”，applyFormatMode 对索引 0 不执行命令
export const FORMAT_MODES: readonly FormatMode[] = [
  { icon: mdiMouse, label: '指针' },
  { icon: mdiFormatHeader1, label: '标题' },
  { icon: mdiFormatBold, label: '加粗' },
  { icon: mdiFormatItalic, label: '斜体' },
  { icon: mdiFormatUnderline, label: '下划线' },
]
