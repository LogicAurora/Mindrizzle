<template>
  <BlockShell>
    <TableGrid
      :rows="rows"
      :header="header"
      :stripe="stripe"
      :show-index="showIndex"
      :merges="merges"
      v-model:selection="selection"
      :read-only="ctx.readOnly"
      @update:rows="onRowsUpdate"
      @content-height="onContentHeight"
    />
    <TableToolbar
      :visible="ctx.isActive && !ctx.readOnly"
      :header="header"
      :show-index="showIndex"
      :stripe="stripe"
      :can-add-row="rows.length < MAX_TABLE_ROWS"
      :can-add-column="columnCount < MAX_TABLE_COLUMNS"
      :can-remove-row="rows.length > MIN_TABLE_ROWS"
      :can-remove-column="columnCount > MIN_TABLE_COLUMNS"
      :can-merge="canMerge"
      :can-unmerge="canUnmerge"
      @add-row="addRow"
      @add-column="addColumn"
      @remove-row="removeRow"
      @remove-column="removeColumn"
      @toggle-header="toggleHeader"
      @toggle-index="toggleIndex"
      @toggle-stripe="toggleStripe"
      @merge="mergeSelection"
      @unmerge="unmergeSelection"
      @clear="clearRows"
    />

    <template #settings>
      <TableHeightSettings
        :fit-height="fitHeight"
        :read-only="ctx.readOnly"
        @update="onSettingsUpdate"
      />
    </template>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import type { TableBlockConfig } from "../Registry/canvasComponents.ts";
import BlockShell from "../Sdk/BlockShell.vue";
import { useBlockContext } from "../Sdk/blockContext.ts";
import TableGrid from "./TableBlock/TableGrid.vue";
import TableHeightSettings from "./TableBlock/TableHeightSettings.vue";
import TableToolbar from "./TableBlock/TableToolbar.vue";
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
  normalizeTableRows,
  removeMergesInSelection,
  type TableSelection,
} from "./TableBlock/tableRows.ts";

// 实测：vxe 行高 30px 加单元格边框后 34px，表格框内再加 .table-grid 的 8px 内边距
const AUTO_ROW_HEIGHT = 34;
// TableGrid 上报的是自己的 border-box 高；块高还要加上 .block-container 的 1px 边框与 .content-area 的 4px 内边距
const AUTO_FRAME_HEIGHT = 8;
const BLOCK_CHROME_HEIGHT = 10;

const ctx = useBlockContext<TableBlockConfig>();

const rows = ref<string[][]>(normalizeTableRows(ctx.config.rows));
const header = computed(() => ctx.config.header !== false);
const stripe = computed(() => ctx.config.stripe === true);
const showIndex = computed(() => ctx.config.showIndex === true);
const fitHeight = computed(() => ctx.config.fitHeight === true);
const selection = ref<TableSelection | null>(null);
const contentHeight = ref(0);
const columnCount = computed(() => columnCountOf(rows.value));
const merges = computed(() =>
  normalizeTableMerges(
    ctx.config.merges,
    bodyRowCountOf(rows.value, header.value),
    columnCount.value,
  ),
);

// 载入新文档会整体换 config，自己 commit 时写的是同一个数组引用，据此避免回灌覆盖输入
watch(
  () => ctx.config.rows,
  (next) => {
    if (next !== rows.value) rows.value = normalizeTableRows(next);
  },
);

const canMerge = computed(
  () =>
    !!selection.value &&
    !!mergeOfSelection(
      selection.value,
      bodyRowCountOf(rows.value, header.value),
      columnCount.value,
      header.value,
    ),
);
const canUnmerge = computed(
  () =>
    !!selection.value &&
    merges.value.some((merge) =>
      mergeIntersectsSelection(merge, selection.value!, header.value),
    ),
);

const syncAutoHeight = () => {
  if (!fitHeight.value) return;
  const lineCount =
    bodyRowCountOf(rows.value, header.value) + (header.value ? 1 : 0);
  const gridHeight =
    contentHeight.value || AUTO_FRAME_HEIGHT + lineCount * AUTO_ROW_HEIGHT;
  ctx.resizeTo({ h: gridHeight + BLOCK_CHROME_HEIGHT });
};

const onContentHeight = (height: number) => {
  contentHeight.value = height;
};

watch([rows, header, fitHeight], syncAutoHeight);
watch(contentHeight, syncAutoHeight);
onMounted(syncAutoHeight);

const commit = () => {
  ctx.setConfig({ rows: rows.value, merges: merges.value });
};

const onRowsUpdate = (next: string[][]) => {
  rows.value = next;
  commit();
};

const onSettingsUpdate = (patch: Record<string, unknown>) => {
  ctx.setConfig(patch);
};

const addRow = () =>
  onRowsUpdate([
    ...rows.value,
    Array.from({ length: columnCount.value }, () => ""),
  ]);
const addColumn = () => onRowsUpdate(rows.value.map((row) => [...row, ""]));
const removeRow = () => onRowsUpdate(rows.value.slice(0, -1));
const removeColumn = () =>
  onRowsUpdate(rows.value.map((row) => row.slice(0, -1)));
const clearRows = () =>
  onRowsUpdate(rows.value.map((row) => row.map(() => "")));

const toggleHeader = () => {
  const nextHeader = !header.value;
  // 表头占一行，切换后表体行数会变，超出范围的合并要一起丢掉
  ctx.setConfig({
    header: nextHeader,
    merges: normalizeTableMerges(
      ctx.config.merges,
      bodyRowCountOf(rows.value, nextHeader),
      columnCount.value,
    ),
  });
};
const toggleIndex = () => ctx.setConfig({ showIndex: !showIndex.value });
const toggleStripe = () => ctx.setConfig({ stripe: !stripe.value });

const mergeSelection = () => {
  const range = selection.value;
  const bodyRowCount = bodyRowCountOf(rows.value, header.value);
  const merge =
    range &&
    mergeOfSelection(range, bodyRowCount, columnCount.value, header.value);
  if (!range || !merge) return;
  const rest = removeMergesInSelection(merges.value, range, header.value);
  ctx.setConfig({
    merges: normalizeTableMerges(
      [...rest, merge],
      bodyRowCount,
      columnCount.value,
    ),
  });
};

const unmergeSelection = () => {
  if (!selection.value) return;
  ctx.setConfig({
    merges: removeMergesInSelection(
      merges.value,
      selection.value,
      header.value,
    ),
  });
};
</script>
