<template>
  <Teleport to=".canvas-container" defer>
    <v-sheet
      v-if="visible"
      class="table-toolbar"
      border
      rounded="lg"
      :style="{ zIndex: Z_LAYER.formatModePicker }"
      @mousedown.stop
      @pointerdown.stop
      @click.stop
    >
      <v-btn
        v-tooltip:left="'加行'"
        :disabled="!canAddRow"
        :icon="mdiTableRowPlusAfter"
        variant="text"
        size="small"
        @click="emit('add-row')"
      />
      <v-btn
        v-tooltip:left="'加列'"
        :disabled="!canAddColumn"
        :icon="mdiTableColumnPlusAfter"
        variant="text"
        size="small"
        @click="emit('add-column')"
      />
      <v-btn
        v-tooltip:left="'删行'"
        :disabled="!canRemoveRow"
        :icon="mdiTableRowRemove"
        variant="text"
        size="small"
        @click="emit('remove-row')"
      />
      <v-btn
        v-tooltip:left="'删列'"
        :disabled="!canRemoveColumn"
        :icon="mdiTableColumnRemove"
        variant="text"
        size="small"
        @click="emit('remove-column')"
      />
      <v-divider class="my-1" />
      <v-btn
        v-tooltip:left="'首行作为表头'"
        :icon="mdiTableHeadersEye"
        :color="header ? 'primary' : undefined"
        variant="text"
        size="small"
        @click="emit('toggle-header')"
      />
      <v-btn
        v-tooltip:left="'显示行号'"
        :icon="mdiCounter"
        :color="showIndex ? 'primary' : undefined"
        variant="text"
        size="small"
        @click="emit('toggle-index')"
      />
      <v-btn
        v-tooltip:left="'斑马纹'"
        :icon="mdiViewSequentialOutline"
        :color="stripe ? 'primary' : undefined"
        variant="text"
        size="small"
        @click="emit('toggle-stripe')"
      />
      <v-divider class="my-1" />
      <v-btn
        v-tooltip:left="'合并选中单元格'"
        :disabled="!canMerge"
        :icon="mdiTableMergeCells"
        variant="text"
        size="small"
        @click="emit('merge')"
      />
      <v-btn
        v-tooltip:left="'取消合并'"
        :disabled="!canUnmerge"
        :icon="mdiTableSplitCell"
        variant="text"
        size="small"
        @click="emit('unmerge')"
      />
      <v-divider class="my-1" />
      <v-btn
        v-tooltip:left="'清空内容'"
        :icon="mdiTableRemove"
        color="error"
        variant="text"
        size="small"
        @click="emit('clear')"
      />
    </v-sheet>
  </Teleport>
</template>

<script setup lang="ts">
import {
  mdiCounter,
  mdiTableColumnPlusAfter,
  mdiTableColumnRemove,
  mdiTableHeadersEye,
  mdiTableMergeCells,
  mdiTableRemove,
  mdiTableRowPlusAfter,
  mdiTableRowRemove,
  mdiTableSplitCell,
  mdiViewSequentialOutline,
} from "@mdi/js";

import { Z_LAYER } from "../../Core/zIndex.ts";

defineProps<{
  visible: boolean;
  header: boolean;
  showIndex: boolean;
  stripe: boolean;
  canAddRow: boolean;
  canAddColumn: boolean;
  canRemoveRow: boolean;
  canRemoveColumn: boolean;
  canMerge: boolean;
  canUnmerge: boolean;
}>();

const emit = defineEmits<{
  (e: "add-row"): void;
  (e: "add-column"): void;
  (e: "remove-row"): void;
  (e: "remove-column"): void;
  (e: "toggle-header"): void;
  (e: "toggle-index"): void;
  (e: "toggle-stripe"): void;
  (e: "merge"): void;
  (e: "unmerge"): void;
  (e: "clear"): void;
}>();
</script>

<style scoped>
/* 与右侧添加块选择器同位：选中表格块时由它接管这一列按钮 */
.table-toolbar {
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
  .table-toolbar {
    top: auto;
    right: 50%;
    /* 让开底部居中的画布工具栏 */
    bottom: 60px;
    flex-direction: row;
    transform: translateX(50%);
  }
}
</style>
