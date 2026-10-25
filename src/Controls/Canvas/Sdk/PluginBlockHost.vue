<template>
  <component :is="definition.component" />
</template>

<script setup lang="ts">
import { computed, provide, shallowRef, watch } from 'vue'

import type { MdrCanvasComponentShellProps } from '../Core/MdrCanvasComponentBase.types.ts'

import { createBlockFiles } from './blockFiles.ts'
import { BLOCK_CONTEXT_KEY, BLOCK_SHELL_KEY, type BlockShellProvide } from './blockContext.ts'
import type { BlockContext, BlockDefinition, BlockDropHandlers } from './block.types.ts'

const props = defineProps<{
  definition: BlockDefinition
  config: Record<string, unknown>
  base: MdrCanvasComponentShellProps
  virtualized?: boolean
  snapshot?: string
}>()

const configRef = shallowRef<Record<string, unknown>>(props.config)
const dropHandlers = shallowRef<BlockDropHandlers | null>(null)
const commandsRef = shallowRef<unknown>(null)

// 载入新文档会整体换掉 config；块内写入由 setConfig 自持，不依赖父级重渲染
watch(
  () => props.config,
  (next) => {
    if (next !== configRef.value) configRef.value = next
  },
)

const changeableEnv = () => ({
  isCompact: props.base.compact === true,
  isReadOnly: props.base.readOnly === true,
})

const widthChangable = computed(
  () => props.definition.widthChangableOf?.(configRef.value, changeableEnv()) ?? true,
)
const heightChangable = computed(
  () => props.definition.heightChangableOf?.(configRef.value, changeableEnv()) ?? true,
)
const icon = computed(() => props.definition.iconOf?.(configRef.value) ?? props.definition.icon)
const title = computed(() => props.definition.titleOf?.(configRef.value) ?? props.definition.title)

const setConfig = (patch: Record<string, unknown>) => {
  configRef.value = { ...configRef.value, ...patch }
  props.base.handlers.writeConfig(patch)
}

const ctx: BlockContext = {
  uuid: props.base.uuid,
  get config() {
    return configRef.value
  },
  get readOnly() {
    return props.base.readOnly === true
  },
  get isCompact() {
    return props.base.compact === true
  },
  get isActive() {
    return props.base.active === true
  },
  files: createBlockFiles(props.base.uuid),
  setConfig,
  getSize: () => ({ w: props.base.width, h: props.base.height }),
  moveBy: (dx, dy) => props.base.handlers.moveBy(dx, dy),
  resizeTo: (size) => props.base.handlers.resizeTo({ width: size.w, height: size.h }),
  getView: () => props.base.handlers.getCanvasView(),
  panBy: (dx, dy) => props.base.handlers.panCanvas(dx, dy),
  zoomTo: (zoom) => props.base.handlers.zoomCanvas(zoom),
  setDropHandlers: (handlers) => {
    dropHandlers.value = handlers
  },
  setCommands: (commands) => {
    commandsRef.value = commands
  },
}

// 块组件根是 BlockShell，它从这份描述里取壳层属性与虚拟化状态
const shell: BlockShellProvide = {
  get base() {
    return props.base
  },
  get icon() {
    return icon.value
  },
  get title() {
    return title.value
  },
  get widthChangable() {
    return widthChangable.value
  },
  get heightChangable() {
    return heightChangable.value
  },
  get virtualized() {
    return props.virtualized === true
  },
  get snapshot() {
    return props.snapshot ?? ''
  },
}

provide(BLOCK_CONTEXT_KEY, ctx)
provide(BLOCK_SHELL_KEY, shell)

const contentRootOf = (): HTMLElement | null => {
  const uuid = CSS.escape(props.base.uuid)
  return document.querySelector<HTMLElement>(`.drag-wrapper[data-uuid="${uuid}"] .inner-component`)
}

const snapshotHtml = (): string => {
  const mode = props.definition.snapshot ?? 'html'
  if (mode === 'none') return '<div class="virtual-snapshot-empty"></div>'
  if (typeof mode === 'function') return mode(configRef.value, contentRootOf())
  // 'html' 不下发，画布直接克隆块内 DOM
  return ''
}

defineExpose({
  snapshotHtml,
  flushConfig: () => configRef.value,
  get commands() {
    return commandsRef.value
  },
  applyConfig: (next: Record<string, unknown>) => {
    configRef.value = next
  },
  resolveDropAtElement: (el: HTMLElement | null, preferBefore: boolean) =>
    dropHandlers.value?.resolveDropAtElement(el, preferBefore) ?? null,
  scrollContent: (deltaY: number) => dropHandlers.value?.scrollContent?.(deltaY),
})
</script>

<style scoped>
.plugin-block {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.plugin-block > * {
  flex: 1;
  min-height: 0;
}

.plugin-block-settings {
  display: flex;
  flex-direction: column;
}

/* 快照是克隆的组件 DOM，用 display:contents 让它直接充当 .content-area 的 flex 子项 */
.virtual-snapshot {
  display: contents;
}

/* 克隆里残留的 pointer-events:auto 会吞掉指针事件，所以整棵子树穿透 */
.virtual-snapshot :deep(*) {
  pointer-events: none !important;
}
</style>
