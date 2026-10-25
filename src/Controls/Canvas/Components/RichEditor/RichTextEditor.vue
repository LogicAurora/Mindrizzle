<template>
  <MdrCanvasComponentBase ref="baseRef" v-bind="props.base" :icon="mdiNoteText" :title="RICH_TEXT_LABEL"
    :height-changable="!autoHeight" :width-changable="props.base.compact !== true">
    <div v-if="!virtualized" ref="wrapperRef" class="editor-wrapper inner-component"
      :data-read-only="readOnly ? 'true' : 'false'" :class="{ compact: useCompact, 'auto-height': autoHeight }"
      :style="{
        color: 'var(--v-theme-on-surface)',
        background: 'var(--v-theme-surface)',
      }" @mousedown.stop @touchstart.stop>
      <ProseKit :editor="editor">
        <div class="editor-scroll-shell">
          <div ref="scrollRef" class="editor-scroll" @scroll="updateScrollMetrics">
            <div ref="editorMount" class="editor-mount" />
          </div>
          <div v-if="scrollMetrics.hasVertical" class="custom-scrollbar custom-scrollbar-vertical"
            @pointerdown="startVerticalScrollbar" @wheel="scrollVertical">
            <div class="custom-scrollbar-thumb" :style="verticalThumbStyle"
              @pointerdown.stop="startVerticalThumb" />
          </div>
          <div v-if="scrollMetrics.hasHorizontal" class="custom-scrollbar custom-scrollbar-horizontal"
            @pointerdown="startHorizontalScrollbar" @wheel="scrollHorizontal">
            <div class="custom-scrollbar-thumb" :style="horizontalThumbStyle"
              @pointerdown.stop="startHorizontalThumb" />
          </div>
        </div>
        <blockHandle :editor="editor" :read-only="readOnly" />
        <!-- .vdr 的 transform 祖先会使 fixed 基准偏移，所以 Teleport 到 body -->
        <Teleport to="body">
          <RowDropIndicator :editor="editor" />
        </Teleport>
      </ProseKit>
    </div>
    <!-- 视口外的块只留静态快照，省掉 ProseMirror 的插件 state、RO 与逐块 window 捕获监听 -->
    <div v-else class="virtual-snapshot inner-component" v-html="snapshot" />
    <template #settings>
      <v-list density="compact">
        <v-list-item>
          <v-switch :model-value="autoHeight" color="primary" label="高度自适应内容" hint="块高随内容自动调整"
            persistent-hint hide-details @update:model-value="onAutoHeightToggle" />
        </v-list-item>
      </v-list>
    </template>
  </MdrCanvasComponentBase>
</template>
<script lang="ts">
import type { RichTextConfig } from '../../Registry/canvasComponents.ts'

export { RICH_TEXT_CONSTRAINTS as resizeConstraints } from '../../Registry/componentConstraints.ts'

export const RICH_TEXT_LABEL = '富文本'

// 高度由内容驱动时联结不得改它的高度
export const isHeightChangable = (config: RichTextConfig): boolean => config.autoHeight !== true
</script>
<script setup lang="ts">
import 'prosekit/basic/style.css'
import 'prosekit/basic/typography.css'
import 'prosekit/pm/view/style/prosemirror.css'

import blockHandle from './extensions/block-handle.vue'
import RowDropIndicator from './extensions/RowDropIndicator.vue'
import { ref, onMounted, onUnmounted, computed, reactive, watch } from 'vue'
import { ProseKit, useDocChange } from '@prosekit/vue'
import { useDisplay } from 'vuetify'
import { mdiNoteText } from '@mdi/js'

import { defineExtension } from './extension.ts'
import { createEditor, NodeJSON } from '@prosekit/core'
import { layoutToViewportSize, layoutToViewportX, layoutToViewportY, viewportToLayout } from './extensions/blockHandleUtils.ts'
import MdrCanvasComponentBase from '../../Core/MdrCanvasComponentBase.vue'
import type { MdrCanvasComponentContentProps } from '../../Core/MdrCanvasComponentBase.types.ts'
import type { WidgetConfig } from '../../Registry/canvasComponents.ts'
import type { BlockCanvasController, BlockComponentController } from '../../Core/canvasComponentControllers.ts'

const props = defineProps<MdrCanvasComponentContentProps<WidgetConfig> & {
  virtualized?: boolean
  snapshot?: string
}>()

const { xs } = useDisplay()
const isMobile = computed(() => xs.value)
const useCompact = computed(() => props.base.compact ?? isMobile.value)
const readOnly = computed(() => props.base.readOnly === true)
const richTextConfig = computed(() => props.config as RichTextConfig)
const autoHeight = computed(() => richTextConfig.value.autoHeight === true)

// 块组件是 base 的父级、inject 拿不到子级 provide，所以经 ref 取 base 暴露的 controller
const baseRef = ref<{ controller: BlockComponentController; canvasController: BlockCanvasController } | null>(null)

// 自动高度改变块高与手柄集合，所以经画布刷新派生状态
const onAutoHeightToggle = (value: unknown) => {
  props.base.handlers.updateConfig({ autoHeight: !!value })
}

const extension = defineExtension()
const editor = createEditor({ extension })
const editorMount = ref<HTMLDivElement>()
const wrapperRef = ref<HTMLDivElement>()
const scrollRef = ref<HTMLDivElement>()
const scrollMetrics = reactive({ scrollTop: 0, scrollLeft: 0, scrollHeight: 0, scrollWidth: 0, clientHeight: 0, clientWidth: 0, hasVertical: false, hasHorizontal: false })
let editorMounted = false

const syncReadOnly = (readOnly: boolean) => {
  if (!editorMounted) return
  editor.view.setProps({ editable: () => !readOnly })
  wrapperRef.value?.dispatchEvent(new CustomEvent('Mindrizzle:rich-text-read-only', { detail: readOnly }))
}

watch(readOnly, (value) => syncReadOnly(value))

const updateScrollMetrics = () => {
  const scroll = scrollRef.value
  if (!scroll) return
  Object.assign(scrollMetrics, {
    scrollTop: scroll.scrollTop,
    scrollLeft: scroll.scrollLeft,
    scrollHeight: scroll.scrollHeight,
    scrollWidth: scroll.scrollWidth,
    clientHeight: scroll.clientHeight,
    clientWidth: scroll.clientWidth,
    hasVertical: scroll.scrollHeight > scroll.clientHeight,
    hasHorizontal: scroll.scrollWidth > scroll.clientWidth,
  })
}

// thumb 有 24px 下限、轨道两端各留 2px，所以拖动量与 scroll 的换算必须与渲染公式严格互逆（否则越拖越偏）
const thumbGeometry = (viewport: number, content: number) => {
  const track = Math.max(viewport - 4, 0)
  const thumb = Math.max(24, viewport ** 2 / Math.max(content, 1))
  return { thumb, travel: Math.max(track - thumb, 0), maxScroll: Math.max(content - viewport, 1) }
}

const verticalThumbStyle = computed(() => ({
  height: `${thumbGeometry(scrollMetrics.clientHeight, scrollMetrics.scrollHeight).thumb}px`,
  transform: `translateY(${getThumbOffset('vertical')}px)`,
}))

const horizontalThumbStyle = computed(() => ({
  width: `${thumbGeometry(scrollMetrics.clientWidth, scrollMetrics.scrollWidth).thumb}px`,
  transform: `translateX(${getThumbOffset('horizontal')}px)`,
}))

const getThumbOffset = (axis: 'vertical' | 'horizontal') => {
  const viewport = axis === 'vertical' ? scrollMetrics.clientHeight : scrollMetrics.clientWidth
  const content = axis === 'vertical' ? scrollMetrics.scrollHeight : scrollMetrics.scrollWidth
  const current = axis === 'vertical' ? scrollMetrics.scrollTop : scrollMetrics.scrollLeft
  const { travel, maxScroll } = thumbGeometry(viewport, content)
  return (current / maxScroll) * travel
}

const scrollVertical = (event: WheelEvent) => {
  event.preventDefault()
  event.stopPropagation()
  const scroll = scrollRef.value
  if (!scroll) return
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1
  scroll.scrollTop += event.deltaY * unit
}

const scrollHorizontal = (event: WheelEvent) => {
  event.preventDefault()
  event.stopPropagation()
  const scroll = scrollRef.value
  if (!scroll) return
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientWidth : 1
  scroll.scrollLeft += (event.deltaX || event.deltaY) * unit
}

const startVerticalScrollbar = (event: PointerEvent) => {
  if ((event.target as HTMLElement).classList.contains('custom-scrollbar-thumb')) return
  const scroll = scrollRef.value
  if (!scroll) return
  const track = event.currentTarget as HTMLElement
  // BCR 与 thumb 偏移是布局坐标、event.clientY 是视觉坐标，所以统一换算到视觉空间再比
  const thumbEnd = layoutToViewportY(track, track.getBoundingClientRect().top) +
    layoutToViewportSize(track, getThumbOffset('vertical'))
  scroll.scrollTop += (event.clientY < thumbEnd ? -1 : 1) * scroll.clientHeight
}

const startHorizontalScrollbar = (event: PointerEvent) => {
  if ((event.target as HTMLElement).classList.contains('custom-scrollbar-thumb')) return
  const scroll = scrollRef.value
  if (!scroll) return
  const track = event.currentTarget as HTMLElement
  const thumbEnd = layoutToViewportX(track, track.getBoundingClientRect().left) +
    layoutToViewportSize(track, getThumbOffset('horizontal'))
  scroll.scrollLeft += (event.clientX < thumbEnd ? -1 : 1) * scroll.clientWidth
}

let scrollbarDrag: { axis: 'vertical' | 'horizontal'; start: number; scroll: number } | null = null
const startVerticalThumb = (event: PointerEvent) => startScrollbarDrag('vertical', event)
const startHorizontalThumb = (event: PointerEvent) => startScrollbarDrag('horizontal', event)
// 块内事件需块 uuid，逐层上溯到 wrapper 的 data-uuid
const blockUuid = (): string | null => {
  let el: HTMLElement | null = wrapperRef.value ?? null
  while (el && !el.classList.contains('drag-wrapper')) el = el.parentElement
  return el?.getAttribute('data-uuid') ?? null
}
// 拖拽滚动条时指针会滑出块行、原生 hover 扩展反复清/置 hover 致 popup 与滚动条闪烁，所以通知本块收起 popup
const notifyScrollbarDrag = (active: boolean) => {
  const uuid = blockUuid()
  if (uuid) window.dispatchEvent(new CustomEvent('Mindrizzle:scrollbar-drag', { detail: { active, uuid } }))
}

const startScrollbarDrag = (axis: 'vertical' | 'horizontal', event: PointerEvent) => {
  const scroll = scrollRef.value
  if (!scroll) return
  // scroll 事件异步、scrollMetrics 可能滞后，所以基准取实时 scrollTop/scrollLeft
  scrollbarDrag = {
    axis,
    start: axis === 'vertical' ? event.clientY : event.clientX,
    scroll: axis === 'vertical' ? scroll.scrollTop : scroll.scrollLeft,
  }
  // hover 自解析会 stopPropagation，所以用捕获阶段
  window.addEventListener('pointermove', moveScrollbarDrag, true)
  window.addEventListener('pointerup', stopScrollbarDrag, { once: true })
  notifyScrollbarDrag(true)
  event.preventDefault()
}
const moveScrollbarDrag = (event: PointerEvent) => {
  const session = scrollbarDrag
  const scroll = scrollRef.value
  if (!session || !scroll) return
  const vertical = session.axis === 'vertical'
  const viewport = vertical ? scroll.clientHeight : scroll.clientWidth
  const content = vertical ? scroll.scrollHeight : scroll.scrollWidth
  const { travel, maxScroll } = thumbGeometry(viewport, content)
  // 鼠标位移是视觉像素、而 scrollTop 是布局像素，所以先折回布局空间再按 thumb 可移动距离反解
  const moved = viewportToLayout(scroll, (vertical ? event.clientY : event.clientX) - session.start)
  const next = session.scroll + (travel > 0 ? (moved * maxScroll) / travel : 0)
  if (vertical) scroll.scrollTop = next
  else scroll.scrollLeft = next
}
const stopScrollbarDrag = () => {
  if (scrollbarDrag) notifyScrollbarDrag(false)
  scrollbarDrag = null
  window.removeEventListener('pointermove', moveScrollbarDrag, true)
}

// posAtCoords/coordsAtPos 混用 BCR 与鼠标坐标、zoom 下必然偏移，所以改用 posAtDOM（只做 DOM↔文档映射）
function resolveDropAtElement(el: HTMLElement | null, preferBefore: boolean): number | null {
  const view = editor.view
  if (!view || !el || !view.dom.contains(el)) return null
  let block: HTMLElement = el
  while (block.parentElement && block.parentElement !== view.dom) block = block.parentElement
  if (block.parentElement !== view.dom) return preferBefore ? 0 : view.state.doc.content.size
  const at = view.posAtDOM(block, 0)
  const $pos = view.state.doc.resolve(at)
  // 原子块对应文档级位置，所以需按节点自身取前后
  if ($pos.depth === 0) {
    const node = view.state.doc.nodeAt(at)
    return node && !preferBefore ? at + node.nodeSize : at
  }
  return preferBefore ? $pos.before($pos.depth) : $pos.after($pos.depth)
}

// 画布拖拽贴边时滚动块内内容
function scrollContent(deltaY: number) {
  if (scrollRef.value) scrollRef.value.scrollTop += deltaY
}

// 再加上 .content-area 上下 padding(8) 与 border(2)，共 10
const AUTO_HEIGHT_EXTRA = 10
// auto-height 类解除了 height:100% 钳制，所以 offsetHeight 即内容自然高度
const syncAutoHeight = () => {
  if (!autoHeight.value) return
  const scrollEl = wrapperRef.value?.querySelector('.editor-scroll') as HTMLElement | null
  if (!scrollEl) return
  const height = Math.ceil(scrollEl.offsetHeight + AUTO_HEIGHT_EXTRA)
  baseRef.value?.controller.resizeTo({ height })
  followCursor(cursorVisualY(height))
}

// 光标行在块内的 y（视觉像素），供输入时跟随滚动
const cursorVisualY = (height: number): number => {
  const head = editor.view?.state.selection.head
  const wrapperRect = wrapperRef.value?.getBoundingClientRect()
  if (head == null || !wrapperRect) return height
  const coords = editor.view!.coordsAtPos(head)
  const cursorY = coords ? Math.min(Math.max(coords.bottom - wrapperRect.top, 0), height) : height
  return wrapperRef.value ? layoutToViewportSize(wrapperRef.value, cursorY) : cursorY
}

const CURSOR_VISIBLE_MARGIN = 24
// 光标贴近视口底部时上移画布，否则输入行会被裁
const followCursor = (cursorY: number) => {
  const canvas = baseRef.value?.canvasController
  const view = canvas?.getViewData()
  if (!view?.viewport || view.isPanning) return
  // 屏幕 y = 容器顶 + content*zoom + origin + pan，与画布侧几何同公式
  const cursorBottom = view.viewport.top + view.block.y * view.zoom + view.origin.y + view.pan.y + cursorY
  const over = cursorBottom - (view.viewport.bottom - CURSOR_VISIBLE_MARGIN)
  if (over > 0) canvas?.panBy(0, -Math.round(over))
}

// 组件 width/height 走 attr、改 attr 未必改变容器盒子，所以 doc change 后补测（rAF 合并同帧事务）
let metricsFrame = 0
const scheduleScrollMetrics = () => {
  if (metricsFrame) return
  metricsFrame = requestAnimationFrame(() => {
    metricsFrame = 0
    updateScrollMetrics()
  })
}

// 程序化 setContent 后 RO 通知要等一次渲染时机、滚动条会滞后到用户滚动才出现，所以此处同步补测（内容入口低频，不需 rAF 合并）
const applyContent = (json: NodeJSON) => {
  editor.setContent(json)
  updateScrollMetrics()
}

// 编辑时实时跟随块高
useDocChange(() => {
  syncAutoHeight()
  scheduleScrollMetrics()
}, { editor })

let contentResizeFrame = 0
// 内容容器尺寸变化需重测度量；autoHeight 时还须重报块高，否则只测到占位高度、块高停在旧值
const onContentResize = () => {
  updateScrollMetrics()
  if (!autoHeight.value || contentResizeFrame) return
  // RO 回调里同步改块高会触发循环告警，所以延后一帧
  contentResizeFrame = requestAnimationFrame(() => {
    contentResizeFrame = 0
    syncAutoHeight()
  })
}

// 仅 zoom 变化会重排内容、pan 纯平移每帧测量会卡顿，所以仅 zoom 变化时重测
let lastTransformZoom: number | null = null
const onCanvasTransform = (e: Event) => {
  const z = (e as CustomEvent<{ zoom?: number }>).detail?.zoom
  if (z == null || z === lastTransformZoom) return
  lastTransformZoom = z
  requestAnimationFrame(() => syncAutoHeight())
}

onMounted(() => {
  // 插入组件只撑大内容容器、不改 .editor-scroll 自身盒子，所以须一并观测 editorMount
  const observer = new ResizeObserver(onContentResize)
  if (scrollRef.value) observer.observe(scrollRef.value)
  if (editorMount.value) {
    editor.mount(editorMount.value)
    editorMounted = true
    syncReadOnly(readOnly.value)
    observer.observe(editorMount.value)
    if (isMobile.value) {
      // 默认聚焦滚动会滚动画布容器，所以用 preventScroll 聚焦根 DOM
      setTimeout(() => (editor.view?.dom as HTMLElement | undefined)?.focus({ preventScroll: true }), 100)
    }
    if (richTextConfig.value.content) {
      applyContent(richTextConfig.value.content)
    }
    // 等 mount/setContent 完成后才能量，所以 rAF 后测一次
    requestAnimationFrame(() => {
      updateScrollMetrics()
      syncAutoHeight()
    })
  }
  window.addEventListener('Mindrizzle:canvas-transform', onCanvasTransform)
  onUnmounted(() => observer.disconnect())
})

onUnmounted(() => {
  editorMounted = false
  if (metricsFrame) cancelAnimationFrame(metricsFrame)
  metricsFrame = 0
  if (contentResizeFrame) cancelAnimationFrame(contentResizeFrame)
  contentResizeFrame = 0
  stopScrollbarDrag()
  editor.unmount()
  window.removeEventListener('Mindrizzle:canvas-transform', onCanvasTransform)
})

// 开启瞬间按当前内容测一次
watch(autoHeight, (v) => {
  if (v) requestAnimationFrame(() => syncAutoHeight())
})

function importJSON(json: NodeJSON) {
  applyContent(json)
}

watch(() => richTextConfig.value.content, (v) => {
  if (v) applyContent(v as NodeJSON)
})

defineExpose({
  commands: editor.commands,
  doc: editor.state.doc,
  importJSON,
  resolveDropAtElement,
  scrollContent,
  getDocJSON() {
    return editor.state.doc.toJSON()
  },
  // 供父组件统一调用保存/加载，不按组件类型特判
  saveConfig() {
    return { content: editor.state.doc.toJSON() }
  },
  loadConfig(config: { content?: NodeJSON | null }) {
    if (config?.content) applyContent(config.content as NodeJSON)
  },
})
</script>

<style scoped>
/* 快照是克隆的组件 DOM，用 display:contents 让它像原来一样直接充当 .content-area 的 flex 子项 */
.virtual-snapshot {
  display: contents;
}

/* 克隆里残留的 pointer-events:auto 会把指针事件吞进死 DOM，所以整棵子树穿透 */
.virtual-snapshot :deep(*) {
  pointer-events: none !important;
}

.editor-wrapper {
  position: relative;
  border: 1px solid transparent;
  border-radius: 4px;
  margin: 0px;
  /* 要为 popup 预留左右 gutter，所以用负边距扩展、overflow:visible 不触发滚动条 */
  margin-left: -64px;
  margin-right: -80px;
  padding-left: 64px;
  padding-right: 80px;
  width: 100%;
  box-sizing: content-box;
  
  height: 100%;
  overflow: visible;
  transition: border-color 0.15s ease;
  /* 要保证触摸滚动正常 */
  touch-action: auto;
  /* gutter 仅为视觉留白、保留命中会拦截画布框选，所以整体穿透，内容区单独恢复 */
  pointer-events: none;
}

/* 零宽滚动条：原生滚动条占位会与自定义轨道叠成两条，所以只保留滚动能力 */
.editor-scroll {
  grid-column: 1;
  grid-row: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
  box-sizing: border-box;
  pointer-events: auto;
}
.editor-scroll::-webkit-scrollbar {
  display: none;
}

.editor-scroll-shell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 10px;
  grid-template-rows: minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.editor-wrapper.auto-height .editor-scroll-shell {
  height: auto;
}

/* 常显：不做“hover 才亮”的隐式提示，缩放下也能一眼看到可滚 */
.custom-scrollbar {
  position: relative;
  z-index: 6;
  pointer-events: auto;
  background: rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  touch-action: none;
}

.custom-scrollbar:hover,
.custom-scrollbar.force-hover {
  background: rgba(var(--v-theme-on-surface), 0.2);
}

/* 两端各留 2px 与 thumbGeometry 的 viewport - 4 对应 */
.custom-scrollbar-vertical {
  grid-column: 2;
  grid-row: 1;
  justify-self: center;
  width: 8px;
  margin: 2px 0;
}

.custom-scrollbar-horizontal {
  grid-column: 1;
  grid-row: 2;
  height: 8px;
  margin: 2px 0;
}

.custom-scrollbar-thumb {
  position: absolute;
  pointer-events: auto;
  background: rgba(var(--v-theme-on-surface), 0.5);
  border-radius: 4px;
  cursor: grab;
}

.custom-scrollbar-thumb:active {
  cursor: grabbing;
  background: rgba(var(--v-theme-on-surface), 0.62);
}

.custom-scrollbar-vertical .custom-scrollbar-thumb {
  top: 0;
  right: 0;
  left: 0;
}

.custom-scrollbar-horizontal .custom-scrollbar-thumb {
  top: 0;
  bottom: 0;
  left: 0;
}

/* height:100% 会把容器钳制到块高致缩短时测不到，所以解除钳制让容器随内容撑开 */
.editor-wrapper.auto-height .editor-scroll {
  height: auto;
}

.editor-wrapper.compact {
  margin-left: 0;
  margin-right: 0;
  margin-top: -44px;
  width: 100%;
  padding: 44px 0 0 0;
  box-sizing: border-box;
  /* 首行 popup 需 44px 空间才不被裁剪，所以顶部留白 */
}

.editor-mount {
  outline: none;
  /* 固定 100% 高度会使末行弹不出 popup，所以高度随内容增长 */
  min-height: 100%;
  width: 100%;
  pointer-events: auto;
}

.editor-mount:focus-within {
  border-color: rgb(var(--v-theme-primary));
}

/* editor.mount 把 ProseMirror 挂在 .editor-mount 同一元素上（后代选择器恒不命中），所以改用同元素选择器；
   且不设 height:100%（固定高度会使末行弹不出 popup），min-height 沿用 .editor-mount 的 100% */
.editor-mount.ProseMirror {
  padding: 0;
  outline: none;
  pointer-events: auto;
  touch-action: auto;
  /* 只读下仍需可选中并复制文本 */
  user-select: text;
}

/* 移动端/紧凑模式也要生效，所以绑定 compact 类而非媒体查询 */
.editor-wrapper.compact :deep(.block-handle-popup) {
  transform: translateY(var(--block-handle-shift, 0px)) scale(1.1);
  transform-origin: center bottom;
}
/* bottom 放置向下展开，缩放原点改为顶部 */
.editor-wrapper.compact :deep(.block-handle-positioner.placement-bottom .block-handle-popup) {
  transform-origin: center top;
}

/* 放大仅针对移动端 compact，所以桌面端退化放置只应用垂直裁剪补偿 */
.editor-wrapper:not(.compact) :deep(.block-handle-positioner.placement-top .block-handle-popup),
.editor-wrapper:not(.compact) :deep(.block-handle-positioner.placement-bottom .block-handle-popup) {
  transform: translateY(var(--block-handle-shift, 0px));
}
.editor-wrapper.compact :deep(.block-handle-btn) {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
}
.editor-wrapper.compact :deep(.block-handle-btn svg) {
  width: 22px;
  height: 22px;
}
</style>