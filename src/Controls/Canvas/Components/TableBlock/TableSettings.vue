<template>
  <v-list density="compact">
    <v-list-item class="px-3">
      <v-switch
        :model-value="header"
        color="primary"
        label="首行作为表头"
        hide-details
        :disabled="readOnly"
        @update:model-value="(value) => emitUpdate({ header: value === true })"
      />
    </v-list-item>
    <v-list-item class="px-3">
      <v-switch
        :model-value="showIndex"
        color="primary"
        label="显示行号"
        hide-details
        :disabled="readOnly"
        @update:model-value="
          (value) => emitUpdate({ showIndex: value === true })
        "
      />
    </v-list-item>
    <v-list-item class="px-3">
      <v-switch
        :model-value="stripe"
        color="primary"
        label="斑马纹"
        hide-details
        :disabled="readOnly"
        @update:model-value="(value) => emitUpdate({ stripe: value === true })"
      />
    </v-list-item>
    <v-list-item class="d-flex flex-wrap ga-2 px-3">
      <v-btn
        size="small"
        variant="tonal"
        :disabled="readOnly || !canMerge"
        @click="mergeSelection"
        >合并选中</v-btn
      >
      <v-btn
        size="small"
        variant="tonal"
        :disabled="readOnly || !canUnmerge"
        @click="unmergeSelection"
      >
        取消合并
      </v-btn>
    </v-list-item>
    <v-list-item v-if="!selection" class="px-3">
      <span class="text-caption text-medium-emphasis"
        >在表格里拖选单元格后可合并</span
      >
    </v-list-item>
    <v-list-item class="d-flex flex-wrap ga-2 px-3">
      <v-btn
        size="small"
        variant="tonal"
        :disabled="readOnly || rows.length >= MAX_TABLE_ROWS"
        @click="addRow"
      >
        加行
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        :disabled="readOnly || columnCount >= MAX_TABLE_COLUMNS"
        @click="addColumn"
      >
        加列
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        :disabled="readOnly || rows.length <= MIN_TABLE_ROWS"
        @click="removeRow"
      >
        删行
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        :disabled="readOnly || columnCount <= MIN_TABLE_COLUMNS"
        @click="removeColumn"
      >
        删列
      </v-btn>
    </v-list-item>
    <v-list-item class="d-flex justify-end px-3">
      <v-btn
        size="small"
        variant="text"
        color="error"
        :disabled="readOnly"
        @click="clearTable"
        >清空内容</v-btn
      >
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
import { computed } from "vue";

import {
  bodyRowCountOf,
  columnCountOf,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  mergeIntersectsSelection,
  mergeOfSelection,
  MIN_TABLE_COLUMNS,
  MIN_TABLE_ROWS,
  normalizeTableMerges,
  removeMergesInSelection,
  type TableMerge,
  type TableSelection,
} from "./tableRows.ts";

const props = defineProps<{
  rows: string[][];
  header: boolean;
  stripe: boolean;
  showIndex: boolean;
  merges: TableMerge[];
  selection: TableSelection | null;
  readOnly: boolean;
}>();

const emit = defineEmits<{
  (e: "update", patch: Record<string, unknown>): void;
}>();

const columnCount = computed(() => columnCountOf(props.rows));
const bodyRowCount = computed(() => bodyRowCountOf(props.rows, props.header));
const emitUpdate = (patch: Record<string, unknown>) => emit("update", patch);

const canMerge = computed(
  () =>
    !!props.selection &&
    !!mergeOfSelection(
      props.selection,
      bodyRowCount.value,
      columnCount.value,
      props.header,
    ),
);
const canUnmerge = computed(
  () =>
    !!props.selection &&
    props.merges.some((merge) =>
      mergeIntersectsSelection(merge, props.selection!, props.header),
    ),
);

const mergeSelection = () => {
  const selection = props.selection;
  const merge =
    selection &&
    mergeOfSelection(
      selection,
      bodyRowCount.value,
      columnCount.value,
      props.header,
    );
  if (!selection || !merge) return;
  const rest = removeMergesInSelection(props.merges, selection, props.header);
  emitUpdate({
    merges: normalizeTableMerges(
      [...rest, merge],
      bodyRowCount.value,
      columnCount.value,
    ),
  });
};

const unmergeSelection = () => {
  if (!props.selection) return;
  emitUpdate({
    merges: removeMergesInSelection(
      props.merges,
      props.selection,
      props.header,
    ),
  });
};

const addRow = () =>
  emitUpdate({
    rows: [...props.rows, Array.from({ length: columnCount.value }, () => "")],
  });
const addColumn = () =>
  emitUpdate({ rows: props.rows.map((row) => [...row, ""]) });
const removeRow = () => emitUpdate({ rows: props.rows.slice(0, -1) });
const removeColumn = () =>
  emitUpdate({ rows: props.rows.map((row) => row.slice(0, -1)) });
const clearTable = () =>
  emitUpdate({ rows: props.rows.map((row) => row.map(() => "")) });
</script>
