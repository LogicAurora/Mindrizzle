<template>
  <Teleport to=".canvas-container" defer>
    <div
      v-if="visible"
      class="add-block-picker"
      :class="{ 'is-popup-open': isPopupOpen }"
      :style="{ zIndex: Z_LAYER.formatModePicker }"
      @pointerenter="onPointerEnter"
      @pointerleave="onPointerLeave"
      @pointerdown.stop="onTouchPointerDown"
      @mousedown.stop
      @click.stop
    >
      <WheelSwitch
        :options="options"
        :model-value="modelValue"
        :expanded="isExpanded"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <ModeGrid
        :options="options"
        :model-value="modelValue"
        :expanded="isGridVisible"
        :instant-close="isExpanded"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <v-sheet class="add-block-anchor" rounded="lg" border>
        <v-icon v-if="!isExpanded" :icon="currentOption.icon" size="20" color="primary" />
      </v-sheet>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { Z_LAYER } from './Core/zIndex.ts';
import ModeGrid from './Core/ModeGrid.vue';
import WheelSwitch from './Core/WheelSwitch.vue';
import { wrapWheelIndex, type WheelOption } from './Core/wheelSwitch.ts';

const props = defineProps<{
  options: readonly WheelOption[];
  modelValue: number;
  visible: boolean;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', index: number): void }>();

// 停手后弹窗自动收起，避免一直挡住右侧画布
const HIDE_DELAY_MS = 900;
const TOUCH_STEP_SIZE = 32;
const isWheelActive = ref(false);
const isAnchorHovered = ref(false);
// 触屏没有 hover，长按/滑动又容易被画布手势吞掉，所以点一下锚点也能展开图标网格
const isTouchGridOpen = ref(false);
let hideTimer = 0;
let touchPointerId: number | null = null;
let touchStartX = 0;
let touchStartY = 0;
let touchLastY = 0;
let touchOffsetY = 0;
let touchDidSwitch = false;

const isExpanded = computed(() => props.visible && isWheelActive.value);
// 悬浮展开全部类型图标，点击切换；滚轮展开时与轮盘互斥
const isGridVisible = computed(
  () => props.visible && !isExpanded.value && (isAnchorHovered.value || isTouchGridOpen.value),
);
const isPopupOpen = computed(() => isExpanded.value || isGridVisible.value);
const currentOption = computed(() => props.options[props.modelValue] ?? props.options[0]);

// 点选网格项后收起，避免面板一直挡在画布右侧
watch(
  () => props.modelValue,
  () => {
    isTouchGridOpen.value = false;
  },
);

const scheduleHide = () => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    isWheelActive.value = false;
    hideTimer = 0;
  }, HIDE_DELAY_MS);
};

const onPointerEnter = (event: PointerEvent) => {
  if (event.pointerType !== 'touch') isAnchorHovered.value = true;
};

const onPointerLeave = (event: PointerEvent) => {
  if (event.pointerType !== 'touch') isAnchorHovered.value = false;
};

const onTouchPointerDown = (event: PointerEvent) => {
  if (event.pointerType !== 'touch') return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('.mode-wheel')) {
    scheduleHide();
    return;
  }
  if (isWheelActive.value) return;
  // 网格展开后锚点被网格内边距覆盖，点空白处也要能收起
  const isAnchorTap = !!target?.closest('.add-block-anchor');
  const isGridBlankTap =
    isTouchGridOpen.value && !!target?.closest('.mode-grid') && !target?.closest('.mode-grid-item');
  if (!isAnchorTap && !isGridBlankTap) return;
  touchPointerId = event.pointerId;
  touchStartX = event.clientX;
  touchStartY = event.clientY;
  touchLastY = event.clientY;
  touchOffsetY = 0;
  touchDidSwitch = false;
  attachTouchTracking();
};

// 指针捕获在画布缩放时不可靠，滑动跟踪改挂 window 捕获阶段，手指移出 36px 锚点也能继续累计
const attachTouchTracking = () => {
  window.addEventListener('pointermove', onTouchPointerMove, true);
  window.addEventListener('pointerup', onTouchPointerEnd, true);
  window.addEventListener('pointercancel', onTouchPointerEnd, true);
};

const detachTouchTracking = () => {
  window.removeEventListener('pointermove', onTouchPointerMove, true);
  window.removeEventListener('pointerup', onTouchPointerEnd, true);
  window.removeEventListener('pointercancel', onTouchPointerEnd, true);
};

const onTouchPointerMove = (event: PointerEvent) => {
  if (event.pointerType !== 'touch' || event.pointerId !== touchPointerId) return;
  if (Math.abs(event.clientX - touchStartX) > Math.abs(event.clientY - touchStartY)) return;
  event.preventDefault();
  touchOffsetY += touchLastY - event.clientY;
  touchLastY = event.clientY;
  const steps = Math.trunc(touchOffsetY / TOUCH_STEP_SIZE);
  if (!steps) return;
  touchOffsetY -= steps * TOUCH_STEP_SIZE;
  touchDidSwitch = true;
  scheduleHide();
  isWheelActive.value = true;
  const direction = steps > 0 ? 1 : -1;
  emit(
    'update:modelValue',
    wrapWheelIndex(props.modelValue + direction * Math.abs(steps), props.options.length),
  );
};

const onTouchPointerEnd = (event: PointerEvent) => {
  if (event.pointerId !== touchPointerId) return;
  // 没到一格就松手视为点按：展开/收起图标网格，给触屏一条不依赖滑动的手动切换路径
  const isTap =
    event.type !== 'pointercancel' &&
    !touchDidSwitch &&
    Math.abs(touchOffsetY) < TOUCH_STEP_SIZE / 2;
  touchPointerId = null;
  touchOffsetY = 0;
  touchDidSwitch = false;
  detachTouchTracking();
  if (isTap) isTouchGridOpen.value = !isTouchGridOpen.value;
};

// 块内滚动容器优先消费滚轮，避免把阅读内容误当成切换添加类型；已滚到边界时把滚轮交还轮盘
const canConsumeWheel = (target: EventTarget | null, deltaY: number): boolean => {
  let el = target instanceof HTMLElement ? target : null;
  while (el && !el.classList.contains('canvas-container')) {
    if (el.classList.contains('custom-scrollbar')) return true;
    const style = getComputedStyle(el);
    const canScrollY =
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight + 1;
    if (canScrollY) {
      const atEnd = el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
      const atStart = el.scrollTop <= 0;
      if (deltaY > 0 ? !atEnd : !atStart) return true;
    }
    const canScrollX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth + 1;
    if (canScrollX) return true;
    el = el.parentElement;
  }
  return false;
};

// 展开后的连续滚动交给 WheelSwitch；首次滚动由这里负责展开并切一格
const onWheel = (event: WheelEvent) => {
  if (!props.visible) return;
  if (!(event.target as HTMLElement | null)?.closest('.canvas-container')) return;
  if (canConsumeWheel(event.target, event.deltaY)) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  event.preventDefault();
  event.stopPropagation();
  isTouchGridOpen.value = false;
  scheduleHide();
  if (isWheelActive.value) return;
  isWheelActive.value = true;
  const direction = event.deltaY > 0 ? 1 : -1;
  emit('update:modelValue', wrapWheelIndex(props.modelValue + direction, props.options.length));
};

const onPointerDown = (event: PointerEvent) => {
  const target = event.target instanceof Element ? event.target : null;
  if (event.pointerType === 'touch' && target?.closest('.add-block-picker')) return;
  isWheelActive.value = false;
  isTouchGridOpen.value = false;
  touchPointerId = null;
  touchOffsetY = 0;
  touchDidSwitch = false;
  detachTouchTracking();
};

const onWindowBlur = () => {
  isWheelActive.value = false;
  isTouchGridOpen.value = false;
  detachTouchTracking();
};

onMounted(() => {
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
});

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = 0;
  detachTouchTracking();
  window.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('blur', onWindowBlur);
  window.removeEventListener('wheel', onWheel, true);
});
</script>

<style scoped>
/* 与富文本格式选择器统一固定在画布右侧中部 */
.add-block-picker {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  pointer-events: auto;
  touch-action: none;
}

.add-block-anchor {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  box-shadow: none;
  /* 延迟恢复底色和描边，避免锚点盖住收缩中的弹窗边缘 */
  transition:
    background-color 0s linear 0.18s,
    border-color 0s linear 0.18s;
}

/* 弹窗自带底色与描边，锚点此时透明，避免盖住弹窗右边框 */
.add-block-picker.is-popup-open .add-block-anchor {
  background: transparent;
  border-color: transparent;
  transition: none;
}
</style>
