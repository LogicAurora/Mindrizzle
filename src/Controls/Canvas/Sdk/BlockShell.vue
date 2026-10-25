<template>
  <!-- 根直接是块壳：几何、手柄、拖拽栏、设置菜单、虚拟化都由它接管 -->
  <MdrCanvasComponentBase v-bind="shell.base" :icon="shell.icon" :title="shell.title"
    :width-changable="shell.widthChangable" :height-changable="shell.heightChangable"
    :settings-available="hasSettings" :virtualized="shell.virtualized" :snapshot="shell.snapshot">
    <slot />
    <template v-if="hasSettings" #settings>
      <slot name="settings" />
    </template>
  </MdrCanvasComponentBase>
</template>

<script setup lang="ts">
import { useSlots } from 'vue'

import MdrCanvasComponentBase from '../Core/MdrCanvasComponentBase.vue'

import { useBlockShell } from './blockContext.ts'

const shell = useBlockShell()
const slots = useSlots()
// 没有设置插槽时不该出现空按钮，同时告诉壳不要渲染设置入口
const hasSettings = !!slots.settings
</script>
