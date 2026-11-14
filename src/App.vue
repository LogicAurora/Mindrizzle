<script setup lang="ts">
import {
  mdiBug,
  mdiClose,
  mdiWindowMinimize,
  mdiWindowMaximize,
  mdiWindowClose,
  mdiFormatListBulleted,
  mdiCalendarBlankOutline,
  mdiCogOutline,
  mdiHomeOutline,
} from '@mdi/js';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';

import { attachConsole } from '@tauri-apps/plugin-log';
import { useDisplay } from 'vuetify';
import { isNavigationFailure, useRoute, useRouter, type RouteLocationRaw } from 'vue-router';
import { error as logError } from '@tauri-apps/plugin-log';

import QuickOpenPalette from './Controls/QuickOpenPalette.vue';
import { getErrorMessage } from './utils/getErrorMessage';
import { toolbarSelectionKey } from './utils/toolbarSelection';

if (isTauri()) {
  attachConsole();
}

let appWindow: ReturnType<typeof getCurrentWindow> | undefined;
if (isTauri()) {
  appWindow = getCurrentWindow();
}

const router = useRouter();

onMounted(async () => {
  await router.isReady();

  // 非 Tauri 环境无 IPC、plugin-log 内部 invoke 会抛错，所以提前返回
  if (!isTauri()) return;

  try {
    const win = getCurrentWindow();
    await win.show();
  } catch (error) {
    logError(getErrorMessage(error));
  }
});

import {
  isDebugLoadingEnabled,
  noteLoadControllerKey,
  routeTransition,
  startEditorTransitionKey,
} from './utils/routeTransition';
import { loadTitleRollDirection, titleRollDirection } from './utils/uiPreference';
import { activeEasterEggEffect, attachSecretKeyboard, playEasterEgg } from './utils/easterEggs';
import { isDeveloperMode } from './utils/developerMode';
import { Z_LAYER } from './Controls/Canvas/Core/zIndex';
const transitionClassMap = {
  VSlideXTransition: 'slide-x-transition',
  VSlideXReverseTransition: 'slide-x-reverse-transition',
  VFadeTransition: 'fade-transition',
} as const;

const resolveTransitionName = () => transitionClassMap[routeTransition.value];

function hideLeavingRoute(element: Element) {
  (element as HTMLElement).style.setProperty('display', 'none', 'important');
}

const CURTAIN_DURATION = 560;
const CURTAIN_STAGGER = 110;
const LOADING_THRESHOLD = 300;
const MIN_LOADING_DURATION = 520;
const MAX_PROGRESS = 100;
const curtainState = ref<'idle' | 'covering' | 'covered' | 'revealing'>('idle');
const progress = ref(0);
const loadingName = ref('');
const loadingStage = computed(() => {
  if (progress.value <= 2) return '正在校验笔记文件';
  if (progress.value <= 5) return '正在识别归档格式';
  if (progress.value <= 8) return '正在准备本地缓存';
  if (progress.value <= 12) return '正在准备解包内容';
  if (progress.value <= 70) return '正在解包笔记内容';
  if (progress.value <= 75) return '正在读取笔记正文';
  if (progress.value <= 85) return '正在解析笔记正文';
  if (progress.value <= 90) return '正在完成笔记读取';
  return '正在载入画布';
});
const curtainStyle = {
  '--curtain-duration': `${CURTAIN_DURATION}ms`,
  '--curtain-stagger': `${CURTAIN_STAGGER}ms`,
  '--loading-curtain-z-index': Z_LAYER.appLoadingCurtain,
};

let resolveFinish: (() => void) | null = null;
let curtainCoveredAt: number | null = null;
let isEditorNavigationPending = false;

const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));

function createFinishPromise() {
  let resolveCurrentFinish: () => void = () => undefined;
  const finishPromise = new Promise<void>((resolve) => {
    resolveCurrentFinish = resolve;
  });
  resolveFinish = resolveCurrentFinish;
  return finishPromise;
}

provide(noteLoadControllerKey, {
  setProgress(value) {
    if (!Number.isFinite(value)) return;
    progress.value = Math.max(progress.value, Math.min(MAX_PROGRESS, value));
  },
  setName(name) {
    loadingName.value = name;
  },
  finish() {
    resolveFinish?.();
    resolveFinish = null;
  },
});

async function coverCurtain() {
  curtainState.value = 'covering';
  await wait(CURTAIN_DURATION + CURTAIN_STAGGER);
  curtainState.value = 'covered';
  await nextTick();
  curtainCoveredAt = performance.now();
}

async function runEditorTransition(
  target: RouteLocationRaw,
  prepare: () => Promise<void>,
  finishPromise: Promise<void>,
): Promise<boolean> {
  const preparation = prepare();
  const shouldCover =
    isDebugLoadingEnabled.value ||
    (await Promise.race([preparation.then(() => false), wait(LOADING_THRESHOLD).then(() => true)]));
  if (shouldCover) await coverCurtain();
  await preparation;
  const navigationFailure = await router.push(target);
  if (isNavigationFailure(navigationFailure)) return false;
  await nextTick();
  await finishPromise;
  return true;
}

async function waitForMinimumCurtainDuration() {
  if (curtainCoveredAt === null) return;
  const elapsed = performance.now() - curtainCoveredAt;
  const remaining = MIN_LOADING_DURATION - elapsed;
  if (remaining > 0) await wait(remaining);
}

async function resetEditorTransition() {
  resolveFinish?.();
  resolveFinish = null;
  if (curtainState.value !== 'idle') {
    await waitForMinimumCurtainDuration();
    curtainState.value = 'revealing';
    await wait(CURTAIN_DURATION + CURTAIN_STAGGER);
    curtainState.value = 'idle';
  }
  curtainCoveredAt = null;
  progress.value = 0;
  loadingName.value = '';
}

async function startEditorTransition(
  target: RouteLocationRaw,
  prepare: () => Promise<void>,
): Promise<boolean> {
  if (isEditorNavigationPending || curtainState.value !== 'idle') return false;
  isEditorNavigationPending = true;
  progress.value = 0;
  loadingName.value = '';
  const finishPromise = createFinishPromise();
  try {
    return await runEditorTransition(target, prepare, finishPromise);
  } finally {
    await resetEditorTransition();
    isEditorNavigationPending = false;
  }
}

provide(startEditorTransitionKey, startEditorTransition);

const isSelectionMode = ref(false);
const selectionCount = ref(0);
let exitSelectionHandler: (() => void) | null = null;

function clearToolbarSelection() {
  if (!isSelectionMode.value) return;
  isSelectionMode.value = false;
  selectionCount.value = 0;
  exitSelectionHandler = null;
}

// 页面只负责报数量和退出回调，工具栏的配色/标题/关闭按钮统一由这里渲染
provide(toolbarSelectionKey, {
  setSelection(count: number, onExit: () => void) {
    isSelectionMode.value = true;
    selectionCount.value = count;
    exitSelectionHandler = onExit;
  },
  clearSelection: clearToolbarSelection,
});

function exitSelectionMode() {
  exitSelectionHandler?.();
  clearToolbarSelection();
}

const RAIN_DROP_COUNT = 48;
const RAIN_DELAY_RANGE = 1_200;
const RAIN_MIN_DURATION = 900;
const RAIN_DURATION_RANGE = 900;

// 雨滴位置/节奏每次随机，固定写死会在重复触发时显得一模一样
const rainDrops = computed(() => {
  if (activeEasterEggEffect.value !== 'rain') return [];
  return Array.from({ length: RAIN_DROP_COUNT }, (_, index) => ({
    id: index,
    style: {
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * RAIN_DELAY_RANGE}ms`,
      animationDuration: `${RAIN_MIN_DURATION + Math.random() * RAIN_DURATION_RANGE}ms`,
    },
  }));
});

const isRainbowTitle = computed(() => activeEasterEggEffect.value === 'rainbow');

const menuRef = shallowRef(false);
type ResizeDirection =
  'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West';

const resizeEdges: Array<{ direction: ResizeDirection; cursor: string }> = [
  { direction: 'NorthWest', cursor: 'nwse-resize' },
  { direction: 'North', cursor: 'ns-resize' },
  { direction: 'NorthEast', cursor: 'nesw-resize' },
  { direction: 'West', cursor: 'ew-resize' },
  { direction: 'East', cursor: 'ew-resize' },
  { direction: 'SouthWest', cursor: 'nesw-resize' },
  { direction: 'South', cursor: 'ns-resize' },
  { direction: 'SouthEast', cursor: 'nwse-resize' },
];

const startResize = (direction: ResizeDirection) => {
  if (isTauri()) {
    void getCurrentWindow().startResizeDragging(direction);
  }
};

const APP_TITLE_FALLBACK = 'Mindrizzle';
const BOOT_TITLE_DURATION = 3_000;
const DRAWER_SETTLE_DURATION = 260;
// 工具栏主行 compact 密度下的实际高度（height 64 - 16）
const TOOLBAR_ROW_HEIGHT = 48;
const TOOLBAR_TABS_HEIGHT = 36;
// 设置页页头的固定高度，与 Settings.vue 的 .settings-page-heading 保持一致；高度恒定才能让切 tab 只动文字不动布局
const TOOLBAR_PAGE_HEADER_HEIGHT = 32;
// extensionHeight 会被 compact 密度减 8，补回来才能得到 36px 的 tab 行
const TOOLBAR_EXTENSION_HEIGHT = TOOLBAR_TABS_HEIGHT + 8;

const currentRoute = useRoute();
const { mobile: isMobileLayout } = useDisplay();
const isBootTitleVisible = ref(true);
let bootTitleTimer: number | undefined;
let detachSecretKeyboard: (() => void) | undefined;

onMounted(() => {
  bootTitleTimer = window.setTimeout(() => {
    isBootTitleVisible.value = false;
  }, BOOT_TITLE_DURATION);
  void loadTitleRollDirection().catch((error: unknown) => {
    // 浏览器调试环境无 IPC，上报前守卫
    if (isTauri()) logError(getErrorMessage(error));
  });
  detachSecretKeyboard = attachSecretKeyboard({
    onKonami: () => playEasterEgg('rainbow'),
    onDrizzle: () => playEasterEgg('rain'),
  });
});

onBeforeUnmount(() => {
  if (bootTitleTimer !== undefined) clearTimeout(bootTitleTimer);
  clearTimeout(titleSwitchTimer);
  detachSecretKeyboard?.();
});

const titleRollName = computed(() =>
  titleRollDirection.value === 'top-down' ? 'title-roll-down' : 'title-roll-up',
);

// 页面把页头与 tab 行 teleport 进工具栏后工具栏会变高，页面高度得按同一个值算
const hasToolbarTabs = computed(() => currentRoute.meta.toolbarTabs === true);
const toolbarExtensionHeight = computed(
  () => TOOLBAR_EXTENSION_HEIGHT + (hasToolbarTabs.value ? TOOLBAR_PAGE_HEADER_HEIGHT : 0),
);
const toolbarHeight = computed(
  () =>
    `${TOOLBAR_ROW_HEIGHT + (hasToolbarTabs.value ? TOOLBAR_TABS_HEIGHT + TOOLBAR_PAGE_HEADER_HEIGHT : 0)}px`,
);

// 启动瞬间先立住品牌名，随后交给路由 meta；编辑页要显示具体文件名
const appTitle = computed(() => {
  if (isSelectionMode.value) return `已选 ${selectionCount.value} 份`;
  if (isBootTitleVisible.value) return APP_TITLE_FALLBACK;
  if (currentRoute.name === 'editor')
    return String(currentRoute.params.fileName ?? APP_TITLE_FALLBACK);
  const title = currentRoute.meta.title;
  return typeof title === 'string' ? title : APP_TITLE_FALLBACK;
});

const displayedTitle = ref(appTitle.value);
let titleSwitchTimer: number | undefined;
let drawerClosedAt = 0;

// 抽屉退场还没走完就切字，两个动画会叠在一起糊成一团
watch(appTitle, (nextTitle) => {
  clearTimeout(titleSwitchTimer);
  const settleDelay = Math.max(0, DRAWER_SETTLE_DURATION - (performance.now() - drawerClosedAt));
  titleSwitchTimer = window.setTimeout(() => {
    displayedTitle.value = nextTitle;
  }, settleDelay);
});

function setDrawerOpen(open: boolean) {
  if (menuRef.value === open) return;
  menuRef.value = open;
  if (open) return;
  drawerClosedAt = isMobileLayout.value ? 0 : performance.now();
}

function navigateFromMenu(path: string) {
  setDrawerOpen(false);
  router.push(path).catch(() => undefined);
}
</script>

<template>
  <v-app class="container" :style="{ '--app-toolbar-height': toolbarHeight }">
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
    <v-toolbar
      :color="isSelectionMode ? 'surface-variant' : 'primary'"
      density="compact"
      :extended="hasToolbarTabs"
      :extension-height="toolbarExtensionHeight"
      style="padding: 0"
    >
      <div
        data-tauri-drag-region
        style="
          display: flex;
          align-items: center;
          width: 100%;
          height: 100%;
          margin-left: 5px;
          margin-right: 5px;
        "
      >
        <div id="title-left-actions" class="toolbar-actions" />
        <v-fade-transition hide-on-leave>
          <v-app-bar-nav-icon v-if="!isSelectionMode" key="menu" @click.stop="menuRef = !menuRef" />
          <v-btn
            v-else
            key="close"
            :icon="mdiClose"
            title="退出多选"
            variant="text"
            @click.stop="exitSelectionMode"
          />
        </v-fade-transition>
        <div id="title-right-actions" class="toolbar-actions" />
        <span
          data-tauri-drag-region
          class="app-title-wrap"
          :class="isSelectionMode ? 'text-high-emphasis' : 'text-white'"
        >
          <Transition :name="titleRollName">
            <span
              :key="displayedTitle"
              class="app-title"
              :class="{ 'is-rainbow': isRainbowTitle }"
              >{{ displayedTitle }}</span
            >
          </Transition>
        </span>
        <!-- 路由页面用 <Teleport to="#toolbar-actions" defer> 往这里塞自己的按钮；
             VToolbar 的 VBtn 默认值走组件树，teleport 进来的按钮拿不到，需自己写 variant="text" -->
        <div id="toolbar-actions" class="toolbar-actions" />
      </div>
      <!-- 设置页把页头与 tab 行 teleport 到这里：页头在上、tab 行在下，两行高度恒定 -->
      <template #extension>
        <div class="toolbar-extension">
          <div id="toolbar-page-header" class="toolbar-page-header" />
          <div id="toolbar-tabs" class="toolbar-tabs" />
        </div>
      </template>
    </v-toolbar>

    <v-navigation-drawer
      v-model="menuRef"
      :location="isMobileLayout ? 'bottom' : undefined"
      temporary
    >
      <v-list :lines="false" density="compact" nav>
        <v-list-item :prepend-icon="mdiHomeOutline" title="首页" @click="navigateFromMenu('/')" />
        <v-list-item
          :prepend-icon="mdiFormatListBulleted"
          title="便签集"
          @click="navigateFromMenu('/set')"
        />
        <v-list-item
          :prepend-icon="mdiCalendarBlankOutline"
          title="记事板"
          @click="navigateFromMenu('/board')"
        />
        <v-list-item
          :prepend-icon="mdiCogOutline"
          title="设置"
          @click="navigateFromMenu('/settings/about')"
        />
      </v-list>
      <v-divider v-if="isDeveloperMode" />
      <v-list v-if="isDeveloperMode" :lines="false" density="compact" nav>
        <v-list-item :prepend-icon="mdiBug" title="调试页面" @click="navigateFromMenu('/debug')" />
      </v-list>
      <v-divider v-if="isTauri()" />
      <v-list v-if="isTauri()" :lines="false" density="compact" nav>
        <v-list-item
          :prepend-icon="mdiWindowMinimize"
          title="最小化"
          @click="appWindow?.minimize()"
        />
        <v-list-item
          :prepend-icon="mdiWindowMaximize"
          title="最大化"
          @click="appWindow?.toggleMaximize()"
        />
        <v-list-item :prepend-icon="mdiWindowClose" title="关闭" @click="appWindow?.close()" />
      </v-list>
    </v-navigation-drawer>

    <v-main class="no-scrollbar">
      <router-view style="height: 100%" v-slot="{ Component, route }">
        <Transition :name="resolveTransitionName()" @before-leave="hideLeavingRoute">
          <component :is="Component" :key="route.path" />
        </Transition>
      </router-view>
    </v-main>
    <QuickOpenPalette />
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
          <!-- <v-progress-circular
            :model-value="progress"
            :size="PROGRESS_RING_SIZE"
            :width="PROGRESS_RING_WIDTH"
            color="secondary"
            bg-color="rgba(var(--v-theme-on-background), 0.12)"
          >
            <span class="text-h6 font-weight-bold"
              >{{ Math.round(progress) }}%</span
            >
          </v-progress-circular> -->
          <v-loading-indicator
            color="secondary"
            bg-color="rgba(var(--v-theme-on-background), 0.12)"
          >
            <span class="text-h6 font-weight-bold">{{ Math.round(progress) }}%</span>
          </v-loading-indicator>
          <div class="loading-curtain__stage">{{ loadingStage }}</div>
          <div class="loading-curtain__filename">
            {{ loadingName || '正在打开笔记' }}
          </div>
          <v-progress-linear
            :model-value="progress"
            color="secondary"
            bg-color="rgba(var(--v-theme-on-background), 0.14)"
            height="4"
            rounded
          />
        </div>
      </div>
    </div>
    <div v-if="rainDrops.length" class="egg-rain" aria-hidden="true">
      <span v-for="drop in rainDrops" :key="drop.id" class="egg-rain__drop" :style="drop.style" />
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

/* 彩蛋：流光彩虹标题，靠背景裁切到文字上 */
.app-title.is-rainbow {
  background-image: linear-gradient(90deg, #ff8a8a, #ffd166, #8ae9c1, #8ab6ff, #d08aff, #ff8a8a);
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: egg-rainbow-flow 1.6s linear infinite;
}

@keyframes egg-rainbow-flow {
  from {
    background-position: 0% 50%;
  }
  to {
    background-position: 300% 50%;
  }
}

/* 彩蛋：雨滴层不拦事件，只做装饰 */
.egg-rain {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: hidden;
  pointer-events: none;
}

.egg-rain__drop {
  position: absolute;
  top: -12vh;
  width: 1px;
  height: 12vh;
  background: linear-gradient(to bottom, transparent, rgba(138, 182, 255, 0.85));
  animation: egg-rain-fall 1.2s linear forwards;
}

@keyframes egg-rain-fall {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(120vh);
  }
}

/* 标题切换滚动：down = 新字自上方落入，up = 自下方升起 */
.title-roll-down-enter-active,
.title-roll-down-leave-active,
.title-roll-up-enter-active,
.title-roll-up-leave-active {
  transition:
    transform 240ms ease,
    opacity 240ms ease;
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
  height: calc(100vh - var(--app-toolbar-height, 48px));
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

.toolbar-extension {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.toolbar-page-header {
  flex: none;
  width: 100%;
  /* 与 TOOLBAR_PAGE_HEADER_HEIGHT 同步：高度恒定，切 tab 时只有文字在滚动 */
  height: 32px;
  overflow: hidden;
  display: grid;
}

/* 各 tab 的页头都 teleport 到这一格，进场/离场两份叠放，不会互相挤动 */
#toolbar-page-header > * {
  grid-area: 1 / 1;
}

.toolbar-tabs {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  align-items: center;
}

/* VToolbar 会把整个 extension 高度发给 VTabs，页头占的那 32px 得扣掉（与 TOOLBAR_TABS_HEIGHT 同步） */
#toolbar-tabs .v-tabs {
  height: 36px;
}

/* tab 行铺在 primary 底上，且 teleport 后拿不到工具栏的 VBtn 默认值，所以文字自己跟标题一样用白色 */
#toolbar-tabs .v-tab {
  color: #fff;
}

/* md3 蓝图给 VBtn 默认 primary 底色，切选中时背景走 0.28s 渐变而文字色瞬切，白字会短暂浮在浅底上闪一下 */
.v-btn-toggle .v-btn {
  transition-property: box-shadow, transform, opacity, border-radius;
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
  background: linear-gradient(
    115deg,
    rgb(var(--v-theme-primary)) 0%,
    rgba(var(--v-theme-primary), 0.84) 55%,
    rgba(var(--v-theme-primary), 0.68) 100%
  );
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
  transition:
    opacity 300ms ease,
    transform 340ms cubic-bezier(0.34, 1.4, 0.64, 1);
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
  color: rgb(var(--v-theme-on-background));
}
</style>
