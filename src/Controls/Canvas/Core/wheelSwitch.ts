export interface WheelOption {
  icon: string
  label: string
  description?: string
}

export const wrapWheelIndex = (index: number, count: number): number => ((index % count) + count) % count
