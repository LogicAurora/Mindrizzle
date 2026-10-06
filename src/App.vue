<script setup lang="ts">
import {
  mdiBug,
  mdiWindowMinimize,
  mdiWindowMaximize,
  mdiWindowClose,
  mdiFormatListBulleted,
  mdiCalendarBlankOutline,
  mdiCogOutline
} from '@mdi/js'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';

import { attachConsole } from '@tauri-apps/plugin-log';
import { useDisplay } from 'vuetify'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router';
import { error as logError } from '@tauri-apps/plugin-log';

import { getErrorMessage } from  "./utils/getErrorMessage"

if (isTauri()) {
  attachConsole();
}

let appWindow: ReturnType<typeof getCurrentWindow> | undefined;
if (isTauri()) {
  appWindow = getCurrentWindow();
}

const router = useRouter();

onMounted(async () => {
  await router.isReady()

  // 非 Tauri 环境无 IPC、plugin-log 内部 invoke 会抛错，所以提前返回
  if (!isTauri()) return

  try {
    const win = getCurrentWindow();
    await win.show();
  } catch (error) {
    logError(getErrorMessage(error))
  }
});

import { isDebugLoadingEnabled, noteLoadControllerKey, routeTransition, startEditorTransitionKey } from './utils/routeTransition'
import { loadTitleRollDirection, titleRollDirection } from './utils/uiPreference'
import { Z_LAYER } from './Controls/zIndex'
const transitionClassMap = {
  VSlideXTransition: 'slide-x-transition',
  VSlideXReverseTransition: 'slide-x-reverse-transition',
  VFadeTransition: 'fade-transition',
} as const

const resolveTransitionName = () => transitionClassMap[routeTransition.value]

function hideLeavingRoute(element: Element) {
  (element as HTMLElement).style.setProperty('display', 'none', 'important')
}

const CURTAIN_DURATION = 560
const CURTAIN_STAGGER = 110
const LOADING_THRESHOLD = 300
const MIN_LOADING_DURATION = 520
const MAX_PROGRESS = 100
const PROGRESS_RING_SIZE = 72
const PROGRESS_RING_WIDTH = 5
const curtainState = ref<'idle' | 'covering' | 'covered' | 'revealing'>('idle')
const progress = ref(0)
const loadingName = ref('')
const loadingStage = computed(() => {
  if (progress.value <= 2) return '正在校验笔记文件'
  if (progress.value <= 5) return '正在识别归档格式'
  if (progress.value <= 8) return '正在准备本地缓存'
  if (progress.value <= 12) return '正在准备解包内容'
  if (progress.value <= 70) return '正在解包笔记内容'
  if (progress.value <= 75) return '正在读取笔记正文'
  if (progress.value <= 85) return '正在解析笔记正文'
  if (progress.value <= 90) return '正在完成笔记读取'
  return '正在载入画布'
})
const curtainStyle = {
  '--curtain-duration': `${CURTAIN_DURATION}ms`,
  '--curtain-stagger': `${CURTAIN_STAGGER}ms`,
  '--loading-curtain-z-index': Z_LAYER.appLoadingCurtain,
}

let resolveFinish: (() => void) | null = null
let curtainCoveredAt: number | null = null
let isEditorNavigationPending = false

const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration))

function createFinishPromise() {
  let resolveCurrentFinish: () => void = () => undefined
  const finishPromise = new Promise<void>((resolve) => {
    resolveCurrentFinish = resolve
  })
  resolveFinish = resolveCurrentFinish
  return finishPromise
}

provide(noteLoadControllerKey, {
  setProgress(value) {
    if (!Number.isFinite(value)) return
    progress.value = Math.max(progress.value, Math.min(MAX_PROGRESS, value))
  },
  setName(name) {
    loadingName.value = name
  },
  finish() {
    resolveFinish?.()
    resolveFinish = null
  },
})

async function coverCurtain() {
  curtainState.value = 'covering'
  await wait(CURTAIN_DURATION + CURTAIN_STAGGER)
  curtainState.value = 'covered'
  await nextTick()
  curtainCoveredAt = performance.now()
}

async function runEditorTransition(
  target: RouteLocationRaw,
  prepare: () => Promise<void>,
  finishPromise: Promise<void>,
) {
  const preparation = prepare()
  const shouldCover = isDebugLoadingEnabled.value || await Promise.race([
    preparation.then(() => false),
    wait(LOADING_THRESHOLD).then(() => true),
  ])
  if (shouldCover) await coverCurtain()
  await preparation
  await router.push(target)
  await nextTick()
  await finishPromise
}

async function waitForMinimumCurtainDuration() {
  if (curtainCoveredAt === null) return
  const elapsed = performance.now() - curtainCoveredAt
  const remaining = MIN_LOADING_DURATION - elapsed
  if (remaining > 0) await wait(remaining)
}

async function resetEditorTransition() {
  resolveFinish?.()
  resolveFinish = null
  if (curtainState.value !== 'idle') {
    await waitForMinimumCurtainDuration()
    curtainState.value = 'revealing'
    await wait(CURTAIN_DURATION + CURTAIN_STAGGER)
    curtainState.value = 'idle'
  }
  curtainCoveredAt = null
  progress.value = 0
  loadingName.value = ''
}

async function startEditorTransition(target: RouteLocationRaw, prepare: () => Promise<void>) {
  if (isEditorNavigationPending || curtainState.value !== 'idle') return
  isEditorNavigationPending = true
  progress.value = 0
  loadingName.value = ''
  const finishPromise = createFinishPromise()
  try {
    await runEditorTransition(target, prepare, finishPromise)
  } finally {
    await resetEditorTransition()
    isEditorNavigationPending = false
  }
}

provide(startEditorTransitionKey, startEditorTransition)

const isDev = computed(() => import.meta.env.DEV);

const menuRef = shallowRef(false)
type ResizeDirection = 'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West'

const resizeEdges: Array<{ direction: ResizeDirection; cursor: string }> = [
  { direction: 'NorthWest', cursor: 'nwse-resize' },
  { direction: 'North', cursor: 'ns-resize' },
  { direction: 'NorthEast', cursor: 'nesw-resize' },
  { direction: 'West', cursor: 'ew-resize' },
  { direction: 'East', cursor: 'ew-resize' },
  { direction: 'SouthWest', cursor: 'nesw-resize' },
  { direction: 'South', cursor: 'ns-resize' },
  { direction: 'SouthEast', cursor: 'nwse-resize' },
]

const startResize = (direction: ResizeDirection) => {
  if (isTauri()) {
    void getCurrentWindow().startResizeDragging(direction)
  }
}

const APP_TITLE_FALLBACK = 'Mindrizzle'
const BOOT_TITLE_DURATION = 3_000
const DRAWER_SETTLE_DURATION = 260

const currentRoute = useRoute()
const { mobile: isMobileLayout } = useDisplay()
const isBootTitleVisible = ref(true)
let bootTitleTimer: number | undefined

onMounted(() => {
  bootTitleTimer = window.setTimeout(() => { isBootTitleVisible.value = false }, BOOT_TITLE_DURATION)
  void loadTitleRollDirection().catch((error: unknown) => {
    // 浏览器调试环境无 IPC，上报前守卫
    if (isTauri()) logError(getErrorMessage(error))
  })
})

onBeforeUnmount(() => {
  if (bootTitleTimer !== undefined) clearTimeout(bootTitleTimer)
  clearTimeout(titleSwitchTimer)
})

const titleRollName = computed(() => titleRollDirection.value === 'top-down' ? 'title-roll-down' : 'title-roll-up')

// 启动瞬间先立住品牌名，随后交给路由 meta；编辑页要显示具体文件名
const appTitle = computed(() => {
  if (isBootTitleVisible.value) return APP_TITLE_FALLBACK
  if (currentRoute.name === 'editor') return String(currentRoute.params.fileName ?? APP_TITLE_FALLBACK)
  const title = currentRoute.meta.title
  return typeof title === 'string' ? title : APP_TITLE_FALLBACK
})

const displayedTitle = ref(appTitle.value)
let titleSwitchTimer: number | undefined
let drawerClosedAt = 0

// 抽屉退场还没走完就切字，两个动画会叠在一起糊成一团
watch(appTitle, (nextTitle) => {
  clearTimeout(titleSwitchTimer)
  const settleDelay = Math.max(0, DRAWER_SETTLE_DURATION - (performance.now() - drawerClosedAt))
  titleSwitchTimer = window.setTimeout(() => { displayedTitle.value = nextTitle }, settleDelay)
})

// 菜单点击要先同步关抽屉，否则路由已经变了才知道要等，退场时刻就晚了
function navigateFromMenu(path: string) {
  menuRef.value = false
  // 侧栏在底部时不跟标题争位置，等它退完反而显得拖
  drawerClosedAt = isMobileLayout.value ? 0 : performance.now()
  // 重复导航只是没跳，不需要打扰用户
  router.push(path).catch(() => undefined)
}
</script>

<template>
  <v-app class="container">
    <div class="window-outline" />
    <div
      v-if="isTauri()"
      v-for="edge in resizeEdges"
      :key="edge.direction"
      class="window-resize-edge"
      :class="`window-resize-${edge.direction.toLowerCase()}`"
      :style="{ cursor: edge.cursor }"
      @mousedown.prevent="startResize(edge.direction)"
    />
    <v-toolbar color="primary" density="compact" style="padding: 0;">
      <div data-tauri-drag-region style="
          display: flex; 
          align-items: center; 
          width: 100%; 
          height: 100%;
          margin-left: 5px;
          margin-right: 5px;
        ">
        <div id="title-left-actions" class="toolbar-actions" />
        <v-app-bar-nav-icon @click.stop="menuRef = !menuRef" />
        <div id="title-right-actions" class="toolbar-actions" />
        <span data-tauri-drag-region class="text-white app-title-wrap">
          <Transition :name="titleRollName">
            <span :key="displayedTitle" class="app-title">{{ displayedTitle }}</span>
          </Transition>
        </span>
        <!-- 路由页面用 <Teleport to="#toolbar-actions" defer> 往这里塞自己的按钮；
             VToolbar 的 VBtn 默认值走组件树，teleport 进来的按钮拿不到，需自己写 variant="text" -->
        <div id="toolbar-actions" class="toolbar-actions" />
      </div>
    </v-toolbar>


    <v-navigation-drawer v-model="menuRef" :location="$vuetify.display.mobile ? 'bottom' : undefined" temporary>
      <v-list :lines="false" density="compact" nav>
        <v-list-item :prepend-icon="mdiFormatListBulleted" title="便签集" @click="navigateFromMenu('/set')" />
        <v-list-item :prepend-icon="mdiCalendarBlankOutline" title="记事板" @click="navigateFromMenu('/board')" />
        <v-list-item :prepend-icon="mdiCogOutline" title="设置" @click="navigateFromMenu('/settings/introduce')" />
      </v-list>
      <v-divider v-if="isDev" />
      <v-list v-if="isDev" :lines="false" density="compact" nav>
        <v-list-item :prepend-icon="mdiBug" title="调试页面" @click="navigateFromMenu('/debug')" />
      </v-list>
      <v-divider v-if="isTauri()" />
      <v-list v-if="isTauri()" :lines="false" density="compact" nav>
        <v-list-item :prepend-icon="mdiWindowMinimize" title="最小化" @click="appWindow?.minimize()" />
        <v-list-item :prepend-icon="mdiWindowMaximize" title="最大化" @click="appWindow?.toggleMaximize()" />
        <v-list-item :prepend-icon="mdiWindowClose" title="关闭" @click="appWindow?.close()" />
      </v-list>
    </v-navigation-drawer>

    <v-main class="no-scrollbar">
      <router-view style="height: 100%;" v-slot="{ Component, route }">
        <Transition :name="resolveTransitionName()" @before-leave="hideLeavingRoute">
          <component :is="Component" :key="route.path" />
        </Transition>
      </router-view>
    </v-main>
    <div
      class="loading-curtain"
      :class="`is-${curtainState}`"
      :style="curtainStyle"
      :aria-hidden="curtainState === 'idle'"
      aria-live="polite"
    >
      <div class="loading-curtain__layer loading-curtain__layer--back" />
      <div class="loading-curtain__layer loading-curtain__layer--front">
        <div class="loading-curtain__loader" role="status">
          <v-progress-circular
            :model-value="progress"
            :size="PROGRESS_RING_SIZE"
            :width="PROGRESS_RING_WIDTH"
            color="secondary"
            bg-color="rgba(255,255,255,0.10)"
          >
            <span class="text-h6 font-weight-bold">{{ Math.round(progress) }}%</span>
          </v-progress-circular>
          <div class="loading-curtain__stage">{{ loadingStage }}</div>
          <div class="loading-curtain__filename">{{ loadingName || '正在打开笔记' }}</div>
          <v-progress-linear
            :model-value="progress"
            color="secondary"
            bg-color="rgba(255,255,255,0.12)"
            height="4"
            rounded
          />
        </div>
      </div>
    </div>
  </v-app>
</template>
<style>
* {
  -webkit-tap-highlight-color: transparent !important;

}

html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body,
.titlebar,
[data-tauri-drag-region] {
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  user-select: none !important;
}

/* 文件名可能很长，截断而不是把右侧按钮挤出工具栏 */
.app-title-wrap {
  position: relative;
  display: block;
  flex: 1;
  /* 两个标题叠在同一个位置滚动，所以高度得钉住 */
  height: 1.5em;
  margin-left: 5px;
  font-size: 1.25rem;
  line-height: 1.5em;
  overflow: hidden;
  white-space: nowrap;
}

.app-title {
  position: absolute;
  inset: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  /* drag-region 判定看的是事件 target，文字不吃事件才拖得动窗口 */
  pointer-events: none;
}

/* 标题切换滚动：down = 新字自上方落入，up = 自下方升起 */
.title-roll-down-enter-active,
.title-roll-down-leave-active,
.title-roll-up-enter-active,
.title-roll-up-leave-active {
  transition: transform 240ms ease, opacity 240ms ease;
}

.title-roll-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.title-roll-down-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.title-roll-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.title-roll-up-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

input,
textarea {
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  user-select: text !important;
}

.no-scrollbar {
  overflow-y: auto;
  height: calc(100vh - 48px);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.container {
  box-sizing: border-box;
  position: relative;
}

.toolbar-actions {
  display: flex;
  align-items: center;
}

/* border 会撑高 2px 被 #app 裁掉、outline 会被定位子元素盖住，所以用最高层级绝对定位覆盖层画描边 */
.window-outline {
  position: absolute;
  inset: 0;
  /* 要压在窗口缩放边缘之上 */
  z-index: 10001;
  pointer-events: none;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
}

.window-resize-edge {
  position: fixed;
  z-index: 10000;
}

.window-resize-north,
.window-resize-south {
  right: 4px;
  left: 4px;
  height: 4px;
}

.window-resize-north {
  top: 0;
}

.window-resize-south {
  bottom: 0;
}

.window-resize-west,
.window-resize-east {
  top: 4px;
  bottom: 4px;
  width: 4px;
}

.window-resize-west {
  left: 0;
}

.window-resize-east {
  right: 0;
}

.window-resize-northwest,
.window-resize-northeast,
.window-resize-southwest,
.window-resize-southeast {
  width: 8px;
  height: 8px;
}

.window-resize-northwest {
  top: 0;
  left: 0;
}

.window-resize-northeast {
  top: 0;
  right: 0;
}

.window-resize-southwest {
  bottom: 0;
  left: 0;
}

.window-resize-southeast {
  right: 0;
  bottom: 0;
}

.loading-curtain {
  position: fixed;
  inset: 0;
  z-index: var(--loading-curtain-z-index);
  overflow: hidden;
  pointer-events: none;
}

.loading-curtain:not(.is-idle) {
  pointer-events: auto;
  cursor: wait;
}

.loading-curtain__layer {
  position: absolute;
  inset: 0;
  transform: translate3d(101%, 0, 0);
  transition: transform var(--curtain-duration) cubic-bezier(0.76, 0, 0.24, 1);
  will-change: transform;
}

.is-idle .loading-curtain__layer {
  transition: none;
}

.is-covering .loading-curtain__layer,
.is-covered .loading-curtain__layer {
  transform: translate3d(0, 0, 0);
}

.is-revealing .loading-curtain__layer {
  transform: translate3d(-101%, 0, 0);
}

.is-covering .loading-curtain__layer--front,
.is-revealing .loading-curtain__layer--back {
  transition-delay: var(--curtain-stagger);
}

.loading-curtain__layer--back {
  background: linear-gradient(115deg, rgb(var(--v-theme-primary)) 0%, rgba(var(--v-theme-primary), 0.84) 55%, rgba(var(--v-theme-primary), 0.68) 100%);
}

.loading-curtain__layer--front {
  display: grid;
  place-items: center;
  background: rgb(var(--v-theme-background));
}

.loading-curtain__loader {
  display: flex;
  width: min(320px, calc(100vw - 48px));
  flex-direction: column;
  align-items: center;
  gap: 20px;
  opacity: 0;
  transform: translateY(12px) scale(0.95);
  transition: opacity 300ms ease, transform 340ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.is-covered .loading-curtain__loader {
  opacity: 1;
  transform: none;
}

.is-revealing .loading-curtain__loader {
  opacity: 0;
  transition-duration: 180ms;
}

.loading-curtain__filename {
  max-width: 100%;
  overflow: hidden;
  color: rgb(var(--v-theme-on-background));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-curtain__stage {
  color: rgb(var(--v-theme-on-background));
  font-weight: 600;
}

.loading-curtain__loader .v-progress-circular__content {
  color: white;
}
</style>
