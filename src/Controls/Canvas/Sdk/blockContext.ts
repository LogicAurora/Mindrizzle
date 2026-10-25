import { inject, type InjectionKey } from 'vue'

import type { MdrCanvasComponentShellProps } from '../Core/MdrCanvasComponentBase.types.ts'
import type { BlockContext } from './block.types.ts'

export const BLOCK_CONTEXT_KEY: InjectionKey<BlockContext> = Symbol('mdr:block-context')
export const BLOCK_SHELL_KEY: InjectionKey<BlockShellProvide> = Symbol('mdr:block-shell')

export interface BlockShellProvide {
  readonly base: MdrCanvasComponentShellProps
  readonly icon: string
  readonly title: string
  readonly widthChangable: boolean
  readonly heightChangable: boolean
  readonly virtualized: boolean
  readonly snapshot: string
}

export const useBlockContext = <TConfig extends Record<string, unknown> = Record<string, unknown>>(): BlockContext<TConfig> => {
  const ctx = inject(BLOCK_CONTEXT_KEY, null)
  if (!ctx) throw new Error('useBlockContext 只能在 defineBlock 的块组件内调用')
  return ctx as BlockContext<TConfig>
}

export const useBlockShell = (): BlockShellProvide => {
  const shell = inject(BLOCK_SHELL_KEY, null)
  if (!shell) throw new Error('BlockShell 只能在 defineBlock 的块组件内使用')
  return shell
}
