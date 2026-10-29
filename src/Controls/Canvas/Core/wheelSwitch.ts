export interface WheelOption {
  icon?: string
  label: string
  description?: string
  // 颜色类选项用色块代替图标
  swatch?: string
  // 自定义颜色：点击时打开取色器而不是直接切换
  custom?: boolean
}

export const wrapWheelIndex = (index: number, count: number): number => ((index % count) + count) % count
