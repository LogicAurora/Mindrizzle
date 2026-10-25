import type { BlockDefinition } from './block.types.ts'

export const defineBlock = <TConfig extends Record<string, unknown>>(
  definition: BlockDefinition<TConfig>,
): BlockDefinition<TConfig> => ({ kind: 'block', snapshot: 'html', ...definition })
