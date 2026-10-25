<template>
  <ResizeBox ref="resizeBoxRef" :uuid="uuid" :x="x" :y="y" :w="width" :h="height" :min-width="minWidth"
    :min-height="minHeight" :max-width="maxWidth" :max-height="maxHeight" :handles="effectiveHandles"
    :disabled="!draggable || readOnly" :active="active" :dragging="dragging" :z-index="zIndex" :zoom="zoom"
    class="drag-wrapper mdr-canvas-component" :class="{
      selected: active,
      'popup-open': popupOpen,
      'drag-passthrough': dragging,
    }" :data-uuid="uuid"
    @resizestart="(handle: string) => emit('resizestart', handle)"
    @resizing="(rx: number, ry: number, rw: number, rh: number) => emit('resizing', rx, ry, rw, rh)"
    @resizestop="(rx: number, ry: number, rw: number, rh: number) => emit('resizestop', rx, ry, rw, rh)">
    <v-sheet class="block-container" color="surface" elevation="0" rounded :style="cornerStyle">
      <!-- 只盖接触段、露出段保留边框，所以按段渲染同色遮罩 -->
      <div v-for="mask in masks" :key="`${mask.side}-${mask.start}`" class="edge-mask" :style="maskStyleOf(mask)" />
      <div class="content-area">
        <!-- 未传 virtualized 是 raw 旧写法，快照由块自己渲染 -->
        <slot v-if="virtualized === undefined" />
        <div v-else-if="virtualized" class="virtual-snapshot inner-component" v-html="snapshot" />
        <div v-else ref="contentEl" class="inner-component"><slot /></div>
      </div>
    </v-sheet>

    <!-- 浮层需压过邻块且与手柄同处 content 坐标空间，所以 Teleport 到 .canvas -->
    <Teleport :to="canvasEl" :disabled="!canvasEl">
      <Transition name="pop-up">
        <div v-if="showFloatingHandle" class="floating-handle drag-handle"
          :class="{ 'handle-bottom': placement === 'bottom' }" :data-uuid="uuid" :style="handleStyle"
          @mousedown="onHandleDown">
          <v-icon size="16" color="on-surface-variant" :icon="icon" class="mr-1" />
          <span class="text-caption text-medium-emphasis user-select-none">{{ title }}</span>
        </div>
      </Transition>

      <Transition name="pop-up">
        <div v-if="showFloatingSettings" class="side-settings"
          :class="{ 'handle-bottom': placement === 'bottom' }" :data-uuid="uuid" :style="settingsStyle">
          <v-btn size="x-small" variant="tonal" color="grey" icon title="块设置" @mousedown.stop
            @click.stop="onSettingsToggle">
            <v-icon :icon="mdiCogOutline" size="13" />
          </v-btn>
        </div>
      </Transition>
    </Teleport>

    <!-- 菜单挂在 body、按视觉坐标定位：v-menu 读 zoom 内的布局矩形会整体错位 -->
    <Teleport to="body">
      <Transition name="settings-menu">
        <div v-if="settingsOpen" ref="settingsMenuEl" class="component-settings-menu" :style="settingsMenuStyle"
          @mousedown.stop @click.stop>
          <v-card class="auto-height-menu" elevation="4">
            <slot name="settings" />
          </v-card>
        </div>
      </Transition>
    </Teleport>
  </ResizeBox>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, useSlots, watch, type CSSProperties } from 'vue'
import { mdiCogOutline } from '@mdi/js'
import ResizeBox from './ResizeBox.vue'
import { handleBarStyleOf, maskStyleOf, sideSettingsStyleOf } from './blockFloatGeometry.ts'
import { layoutToViewportX, layoutToViewportY } from '../Components/RichEditor/extensions/blockHandleUtils.ts'
import { Z_LAYER } from './zIndex.ts'
import type { MdrCanvasComponentBaseProps } from './MdrCanvasComponentBase.types.ts'
import {
  CANVAS_CONTROLLER_KEY,
  COMPONENT_CONTROLLER_KEY,
  type BlockCanvasController,
  type BlockComponentController,
  type SizeChangeable,
} from './canvasComponentControllers.ts'

const props = withDefaults(defineProps<MdrCanvasComponentBaseProps>(), {
  minWidth: 0,
  minHeight: 0,
  maxWidth: null,
  maxHeight: null,
  widthChangable: true,
  heightChangable: true,
  draggable: true,
  readOnly: false,
  compact: false,
  active: false,
  dragging: false,
  showHandle: false,
  showSettings: false,
  settingsAvailable: true,
  handles: () => ['tl', 'tm', 'tr', 'ml', 'mr', 'bl', 'bm', 'br'],
  zIndex: 0,
  zoom: 1,
  placement: 'top',
  popupOpen: false,
  cornerStyle: () => ({}),
  masks: () => [],
})

const emit = defineEmits<{
  (e: 'resizestart', handle: string): void
  (e: 'resizing', x: number, y: number, w: number, h: number): void
  (e: 'resizestop', x: number, y: number, w: number, h: number): void
  (e: 'dragstart', event: MouseEvent): void
}>()

const resizeBoxRef = ref<{ rootEl: HTMLElement | null } | null>(null)
const canvasEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)
onMounted(() => {
  canvasEl.value = resizeBoxRef.value?.rootEl?.closest('.canvas') ?? null
})

const roundToPx = (value: number) => Math.round(value * props.zoom) / props.zoom
const geometry = computed(() => ({
  layout: { x: props.x, y: props.y, w: props.width, h: props.height },
  placement: props.placement,
  round: roundToPx,
}))
const handleStyle = computed(() => handleBarStyleOf(geometry.value))
const settingsStyle = computed(() => sideSettingsStyleOf(geometry.value))

// 该轴不可变时联结不得改它，手柄同步收掉；两轴都锁时不留手柄，否则只剩单轴手柄
const effectiveHandles = computed<string[]>(() => {
  if (!props.heightChangable && !props.widthChangable) return []
  if (!props.heightChangable) return props.handles.filter((handle) => handle === 'ml' || handle === 'mr')
  if (!props.widthChangable) return props.handles.filter((handle) => handle === 'tm' || handle === 'bm')
  return props.handles
})

const showFloatingHandle = computed(() =>
  props.showHandle && props.active && props.draggable && !props.readOnly)

// 无设置插槽的块不该出现空按钮，所以显隐由插槽实际存在与否兜底
const slots = useSlots()
const showFloatingSettings = computed(() =>
  props.showSettings && props.active && props.draggable && !props.readOnly &&
  props.settingsAvailable && !!slots.settings)

// 菜单挂在 body，须与按钮同处视觉坐标；`.canvas` 的 zoom 会让 BCR 变成布局坐标，所以经工具换算
const SETTINGS_MENU_WIDTH = 240
const SETTINGS_MENU_GAP = 6
const SETTINGS_MENU_MARGIN = 8

const settingsOpen = ref(false)
const settingsMenuEl = ref<HTMLElement | null>(null)
const settingsAnchorEl = ref<HTMLElement | null>(null)
const settingsMenuStyle = ref<CSSProperties>({})

const settingsMenuPosition = (anchor: HTMLElement): CSSProperties => {
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(SETTINGS_MENU_WIDTH, window.innerWidth - SETTINGS_MENU_MARGIN * 2)
  const left = layoutToViewportX(anchor, rect.left)
  const right = layoutToViewportX(anchor, rect.right)
  const bottom = layoutToViewportY(anchor, rect.bottom)
  // 优先与按钮右缘对齐，放不下再左对齐，最后夹进视口
  const preferred = right - width
  const fitted = preferred >= SETTINGS_MENU_MARGIN
    ? preferred
    : (left + width <= window.innerWidth - SETTINGS_MENU_MARGIN ? left : right - width)
  return {
    position: 'fixed',
    left: `${Math.max(SETTINGS_MENU_MARGIN, Math.min(fitted, window.innerWidth - width - SETTINGS_MENU_MARGIN))}px`,
    top: `${bottom + SETTINGS_MENU_GAP}px`,
    width: `${width}px`,
    zIndex: Z_LAYER.settingsMenu,
  }
}

// 菜单渲染后才能量到高度，底部放不下时翻到按钮上方
const fitSettingsMenuVertically = () => {
  const menu = settingsMenuEl.value
  const anchor = settingsAnchorEl.value
  if (!menu || !anchor) return
  const menuRect = menu.getBoundingClientRect()
  if (menuRect.bottom <= window.innerHeight - SETTINGS_MENU_MARGIN) return
  const anchorTop = layoutToViewportY(anchor, anchor.getBoundingClientRect().top)
  const top = Math.max(SETTINGS_MENU_MARGIN, anchorTop - menuRect.height - SETTINGS_MENU_GAP)
  settingsMenuStyle.value = { ...settingsMenuStyle.value, top: `${top}px` }
}

const onSettingsToggle = async (event: MouseEvent) => {
  const anchor = event.currentTarget as HTMLElement
  if (settingsOpen.value) {
    settingsOpen.value = false
    return
  }
  settingsAnchorEl.value = anchor
  settingsMenuStyle.value = settingsMenuPosition(anchor)
  settingsOpen.value = true
  // 入场首帧 opacity 仍为 0，此时改 top 不会被看到
  await nextTick()
  fitSettingsMenuVertically()
}

// 设置项里的下拉菜单/浮层挂在 body 的 overlay 容器，不能当成「点了外面」
const isInsideSettingsUi = (target: EventTarget | null): boolean => {
  const element = target instanceof Element ? target : null
  return !!settingsMenuEl.value?.contains(element) ||
    !!settingsAnchorEl.value?.contains(element) ||
    !!element?.closest('.v-overlay-container')
}

const closeSettings = () => {
  settingsOpen.value = false
}

const onDocumentPointerDown = (event: MouseEvent) => {
  if (isInsideSettingsUi(event.target)) return
  closeSettings()
}

// 下拉菜单内部滚动（选项滚动/scrollIntoView）不应关掉设置面板
const onDocumentScroll = (event: Event) => {
  if (isInsideSettingsUi(event.target)) return
  closeSettings()
}

const onDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeSettings()
}

const bindSettingsDismiss = (open: boolean) => {
  if (open) {
    window.addEventListener('mousedown', onDocumentPointerDown, true)
    window.addEventListener('keydown', onDocumentKeydown, true)
    window.addEventListener('scroll', onDocumentScroll, true)
    window.addEventListener('resize', closeSettings)
    window.addEventListener('Mindrizzle:canvas-transform', closeSettings)
    return
  }
  window.removeEventListener('mousedown', onDocumentPointerDown, true)
  window.removeEventListener('keydown', onDocumentKeydown, true)
  window.removeEventListener('scroll', onDocumentScroll, true)
  window.removeEventListener('resize', closeSettings)
  window.removeEventListener('Mindrizzle:canvas-transform', closeSettings)
}

watch(settingsOpen, bindSettingsDismiss)
watch([() => props.active, () => props.showSettings], ([active, show]) => {
  if (!active || !show) closeSettings()
})
onUnmounted(() => bindSettingsDismiss(false))

const sizeChangeable = computed<SizeChangeable>(() => ({
  width: props.widthChangable,
  height: props.heightChangable,
}))

const componentController: BlockComponentController = {
  moveBy: (dx, dy) => props.handlers.moveBy(dx, dy),
  resizeTo: (size) => props.handlers.resizeTo(size),
  getSize: () => ({ width: props.width, height: props.height }),
  getChangeable: () => ({ ...sizeChangeable.value }),
}

const canvasController: BlockCanvasController = {
  panBy: (dx, dy) => props.handlers.panCanvas(dx, dy),
  zoomTo: (zoom) => props.handlers.zoomCanvas(zoom),
  getViewData: () => props.handlers.getCanvasView(),
}

provide(COMPONENT_CONTROLLER_KEY, componentController)
provide(CANVAS_CONTROLLER_KEY, canvasController)

// provide 只对后代生效，而块组件是 base 的父级，所以同时 expose 给块组件直接调用
defineExpose({ controller: componentController, canvasController, getContentEl: () => contentEl.value })

const onHandleDown = (event: MouseEvent) => {
  if (event.button !== 0) return
  emit('dragstart', event)
  event.preventDefault()
}
</script>

<style scoped>
/* 菜单挂在 body、位置与宽度由内联样式（视觉坐标）给出，所以只需固定定位 */
.component-settings-menu {
  position: fixed;
  transform-origin: top right;
}

/* 80ms 足够利落，再长就显得拖沓 */
.settings-menu-enter-active,
.settings-menu-leave-active {
  transition: opacity 80ms ease-out, transform 80ms ease-out;
}

.settings-menu-enter-from,
.settings-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

/* 块内（编辑器输入/滚动/RO 改高）的布局变化不该向上传播到 .canvas 重排整画布，所以隔离布局与样式作用域；
   刻意不含 paint：会裁剪 RichTextEditor 用负边距外扩 64/80px 的左右 gutter（hover 命中与 popup 参考依赖它） */
.mdr-canvas-component {
  contain: layout style;
}

/* 拖拽中的块会盖住落点处的编辑器，所以让其命中穿透 */
.mdr-canvas-component.drag-passthrough {
  pointer-events: none;
}

/* VDR 用内联 display 控制手柄，所以需 !important 覆盖 */
.mdr-canvas-component.popup-open :deep(.handle-tm) {
  display: none !important;
}

.block-container {
  height: 100%;
  width: 100%;
  position: relative;
  overflow: visible;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /* outline 画在盒外会越界叠到邻块，所以用盒内 border */
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
}

/* 描边环已负责外框，所以 border 置透明（保留占位避免内容跳动） */
.mdr-canvas-component.selected .block-container {
  border-color: transparent;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 4px;
  box-sizing: border-box;
  background-color: transparent;
  /* 要盖住块内滑出的手柄又不挡缩放手柄，所以取 15 */
  position: relative;
  z-index: 15;
}

/* 块组件内容统一铺满 content-area，具体组件无需重复声明 */
.content-area :deep(.inner-component) {
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
}

/* 快照是克隆的组件 DOM，用 display:contents 让它直接充当 content-area 的 flex 子项 */
.content-area :deep(.inner-component.virtual-snapshot) {
  display: contents;
}

/* 克隆里残留的 pointer-events:auto 会吞掉指针事件，所以整棵子树穿透 */
.content-area :deep(.virtual-snapshot *) {
  pointer-events: none !important;
}

.floating-handle {
  position: absolute;
  bottom: auto;
  /* 块重叠时拖拽栏不被盖住，所以置 Z_LAYER.dragHandle */
  z-index: 1001;
}

/* 未完成的滑出动画 transform 会把 handle 顶离固定位，所以拖拽期间禁用动画并归位 */
:global(body.block-handle-dragging) .floating-handle {
  transition: none !important;
  transform: none !important;
}

.drag-handle {
  position: absolute;
  height: 28px;
  display: flex;
  align-items: center;
  cursor: grab;
  /* 要实底不透明，所以用 surface 纯色 */
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  z-index: 16;
  padding: 0 10px;
  white-space: nowrap;
  box-sizing: border-box;
  user-select: none;
  transition: background 0.2s;
  /* 贴边微调由内联 --handle-y 提供 */
  transform: translateY(var(--handle-y, -1px));
}

.drag-handle.handle-bottom {
  border-top: 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 0 0 4px 4px;
}

.drag-handle:hover {
  /* surface-variant 混色难看，所以仅以主题色描边提示 */
  background: rgb(var(--v-theme-surface));
  border-color: rgb(var(--v-theme-primary));
}

.side-settings {
  position: absolute;
  height: 28px;
  display: flex;
  align-items: center;
  cursor: grab;
  /* 要实底不透明，所以用 surface 纯色 */
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  z-index: 16;
  padding: 0 4px;
  white-space: nowrap;
  box-sizing: border-box;
  user-select: none;
  transition: background 0.2s;
  /* 贴边微调由内联 --handle-y 提供 */
  transform: translateY(var(--handle-y, -1px));
}

.side-settings.handle-bottom {
  border-top: 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 0 0 4px 4px;
}

.side-settings:hover {
  /* surface-variant 混色难看，所以仅以主题色描边提示 */
  background: rgb(var(--v-theme-surface));
  border-color: rgb(var(--v-theme-primary));
}

.side-settings :deep(.v-btn) {
  height: 18px;
  width: 18px;
  min-width: 18px;
}

/* v-list-item__content 默认 overflow:hidden 会裁掉 switch 阴影，所以放开裁剪 */
:global(.auto-height-menu .v-list-item__content) {
  overflow: visible;
}

.pop-up-enter-active,
.pop-up-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 滑出方向由 handleBarStyleOf 的 --handle-slide 驱动 */
.pop-up-enter-from {
  opacity: 0;
  transform: translateY(calc(var(--handle-y, 0px) + var(--handle-slide, 28px)));
}

.pop-up-enter-to {
  opacity: 1;
  transform: translateY(var(--handle-y, 0px));
}

.pop-up-leave-from {
  opacity: 1;
  transform: translateY(var(--handle-y, 0px));
}

.pop-up-leave-to {
  opacity: 0;
  transform: translateY(calc(var(--handle-y, 0px) + var(--handle-slide, 28px)));
}
</style>
