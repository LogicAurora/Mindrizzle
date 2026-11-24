<script setup lang="ts">
import { Tour } from '@vuetify/v0';
import type { TourKitReturn } from './useTourKit';

const props = defineProps<{
  tour: TourKitReturn;
  blocking?: boolean;
}>();

const tour = props.tour;
const state = props.tour.state;
const steps = props.tour._steps;
</script>

<template>
  <template v-if="state.isActive.value">
    <Tour.Highlight :blocking="blocking ?? false" :padding="8" />
    <Tour.Keyboard />

    <Tour.Root v-for="step in steps" :key="step.id" :step="step.id">
      <Tour.Content :placement="step.placement ?? 'bottom'">
        <div class="tour-kit-card">
          <h3 v-if="step.title" class="tour-kit-title">{{ step.title }}</h3>
          <p v-if="step.content" class="tour-kit-content">{{ step.content }}</p>

          <div v-if="step.isReady && !state.isReady.value" class="tour-kit-waiting">
            <span class="tour-kit-waiting-dot" />
            <span>{{ step.waitingText ?? '请按提示完成页面上的操作，完成后会自动继续' }}</span>
          </div>

          <div class="tour-kit-actions">
            <button
              v-if="!state.isFirst.value"
              class="tour-kit-btn tour-kit-btn-secondary"
              @click="tour.prev()"
            >
              上一步
            </button>
            <button
              class="tour-kit-btn tour-kit-btn-primary"
              :disabled="!state.isReady.value"
              @click="state.isLast.value ? tour.complete() : tour.next()"
            >
              {{ state.isLast.value ? '完成' : '下一步' }}
            </button>
          </div>

          <button class="tour-kit-skip" @click="tour.stop()">跳过引导</button>
        </div>
      </Tour.Content>
    </Tour.Root>
  </template>
</template>

<style>
.tour-kit-card {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  border: 1px solid rgba(var(--v-border-color), 0.12);
  border-radius: 12px;
  padding: 16px;
  max-width: 320px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
}

.tour-kit-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px;
}

.tour-kit-content {
  font-size: 13px;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.72);
  margin: 0 0 14px;
}

.tour-kit-waiting {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
  font-size: 12px;
  line-height: 1.45;
}

.tour-kit-waiting-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: tour-kit-pulse 1.2s ease-in-out infinite;
}

@keyframes tour-kit-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.7);
  }
}

.tour-target-blocked,
.tour-target-blocked * {
  cursor: not-allowed !important;
}

.tour-kit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.tour-kit-btn {
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}

.tour-kit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tour-kit-btn-primary {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.tour-kit-btn-secondary {
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  border: 1px solid rgba(var(--v-border-color), 0.24);
}

.tour-kit-skip {
  margin-top: 10px;
  background: none;
  border: none;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  cursor: pointer;
  padding: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tour-kit-waiting-dot {
    animation: none;
  }
}
</style>
