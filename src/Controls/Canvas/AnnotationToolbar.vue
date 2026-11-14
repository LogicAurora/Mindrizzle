<template>
  <SideToolbar :visible="visible">
    <v-btn
      v-for="option in ANNOTATION_TOOLS"
      :key="option.value"
      v-tooltip:left="option.title"
      :color="tool === option.value ? 'primary' : undefined"
      :icon="option.icon"
      variant="text"
      size="small"
      @click="emit('set-tool', option.value)"
    />
    <v-divider class="my-1" />
    <v-btn
      v-tooltip:left="'清空批注'"
      :disabled="count === 0"
      :icon="mdiDeleteSweep"
      color="error"
      variant="text"
      size="small"
      @click="emit('clear')"
    />
    <v-divider class="my-1" />
    <v-btn
      v-tooltip:left="'退出批注'"
      :icon="mdiClose"
      variant="text"
      size="small"
      @click="emit('exit')"
    />
  </SideToolbar>
</template>

<script setup lang="ts">
import {
  mdiArrowTopRight,
  mdiClose,
  mdiDeleteSweep,
  mdiEraser,
  mdiFountainPen,
  mdiVectorCurve,
  mdiVectorLine,
} from '@mdi/js';

import SideToolbar from './Core/SideToolbar.vue';
import type { AnnotationTool } from './Core/annotationModel.ts';

defineProps<{
  visible: boolean;
  tool: AnnotationTool;
  count: number;
}>();

const emit = defineEmits<{
  'set-tool': [tool: AnnotationTool];
  clear: [];
  exit: [];
}>();

const ANNOTATION_TOOLS: {
  value: AnnotationTool;
  title: string;
  icon: string;
}[] = [
  { value: 'pen', title: '自由绘制', icon: mdiFountainPen },
  { value: 'line', title: '直线连接块', icon: mdiVectorLine },
  { value: 'arrow', title: '箭头连接块', icon: mdiArrowTopRight },
  { value: 'curve', title: '曲线连接块', icon: mdiVectorCurve },
  { value: 'eraser', title: '擦除批注', icon: mdiEraser },
];
</script>
