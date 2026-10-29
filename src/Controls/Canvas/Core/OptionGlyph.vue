<template>
  <span class="option-glyph">
    <span v-if="color && !custom" class="option-glyph-solid" :style="{ background: color }" />
    <v-icon v-else-if="icon" :icon="icon" size="20" />
    <span v-if="custom" class="option-glyph-dot" :style="{ background: color }" />
  </span>
</template>

<script setup lang="ts">
// 自定义色用调色板图标 + 当前色小圆点：比彩虹环克制，也一眼能看出可点开取色器
defineProps<{
  icon?: string
  color?: string
  custom?: boolean
}>()
</script>

<style scoped>
.option-glyph {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
}

.option-glyph-solid {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
  box-sizing: border-box;
}

.option-glyph-dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid rgb(var(--v-theme-surface));
  box-sizing: border-box;
}
</style>
