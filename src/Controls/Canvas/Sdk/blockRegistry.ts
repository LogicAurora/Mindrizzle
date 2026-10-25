import type { AnyBlockDefinition } from './block.types.ts'

const registry = new Map<string, AnyBlockDefinition>()

// 开发态热更新会重复执行注册，同 key 以最后一次为准
export const registerBlock = (definition: AnyBlockDefinition): void => {
  registry.set(definition.key, definition)
}

export const registerBlocks = (definitions: AnyBlockDefinition[]): void => {
  definitions.forEach(registerBlock)
}

export const blockDefinitionOf = (key: string): AnyBlockDefinition | undefined => registry.get(key)

export const blockDefinitions = (): AnyBlockDefinition[] => Array.from(registry.values())

export const embeddedBlockOf = (nodeName: string): AnyBlockDefinition | undefined =>
  blockDefinitions().find((definition) => definition.embed?.nodeName === nodeName)
