<template>
  <Teleport to=".canvas-container" defer>
    <v-sheet
      v-if="visible"
      class="side-toolbar"
      border
      rounded="lg"
      :style="{ zIndex: Z_LAYER.formatModePicker }"
      @mousedown.stop
      @pointerdown.stop
      @click.stop
    >
      <slot />
    </v-sheet>
  </Teleport>
</template>

<script setup lang="ts">
import { Z_LAYER } from "./zIndex.ts";

defineProps<{ visible: boolean }>();
</script>

<style scoped>
/* 画布右侧中部是 AddBlockPicker（WheelSwitch 锚点）的槽位，浮层工具条在同一位置接管这一列 */
.side-toolbar {
  position: absolute;
  top: 50%;
  right: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: rgb(var(--v-theme-surface));
  transform: translateY(-50%);
  pointer-events: auto;
}

@media (max-width: 599px) {
  .side-toolbar {
    top: auto;
    right: 50%;
    /* 让开底部居中的画布工具栏 */
    bottom: 60px;
    flex-direction: row;
    transform: translateX(50%);
  }
}
</style>
