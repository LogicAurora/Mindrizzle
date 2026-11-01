<template>
  <div
    ref="rootRef"
    class="table-grid"
    @mousedown="onCellMouseDown"
    @mouseover="onCellMouseOver"
    @copy="onCopy"
    @paste="onPaste"
    @keydown="onKeyDown"
  >
    <vxe-table
      :data="bodyRows"
      :show-header="header"
      height="100%"
      border
      :stripe="stripe"
      :merge-cells="mergeCells"
      :cell-class-name="cellClassOf"
      :header-cell-class-name="headerCellClassOf"
      :column-config="columnConfig"
      :row-config="{ isHover: true, keyField: 'rowIndex' }"
      :scroll-y="{ enabled: false }"
      :scroll-x="{ enabled: false }"
      class="grid"
    >
      <vxe-column
        v-if="showIndex"
        width="44"
        title="#"
        align="center"
        header-align="center"
        :resizable="false"
      >
        <template #default="{ row }">{{
          row.rowIndex - (header ? 1 : 0) + 1
        }}</template>
      </vxe-column>
      <vxe-column
        v-for="colIndex in columns"
        :key="colIndex"
        :field="`c${colIndex}`"
        :min-width="COLUMN_MIN_WIDTH"
      >
        <template #header>
          <input
            class="cell-input"
            :value="rows[0]?.[colIndex] ?? ''"
            :readonly="readOnly"
            :data-cell="`0-${colIndex}`"
            @input="onCellInput(0, colIndex, $event)"
            @keydown="onCellKeydown($event, 0, colIndex)"
          />
        </template>
        <template #default="{ row }">
          <input
            class="cell-input"
            :value="row.cells[colIndex]"
            :readonly="readOnly"
            :data-cell="`${row.rowIndex}-${colIndex}`"
            @input="onCellInput(row.rowIndex, colIndex, $event)"
            @keydown="onCellKeydown($event, row.rowIndex, colIndex)"
          />
        </template>
      </vxe-column>
    </vxe-table>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
} from "vue";
import { useTheme } from "vuetify";
import { VxeUI } from "@vxe-ui/core";
import { VxeColumn, VxeTable } from "vxe-table/es/components";
import "vxe-table/lib/style.css";

import {
  columnCountOf,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  type TableMerge,
  type TableSelection,
} from "./tableRows.ts";

const COLUMN_MIN_WIDTH = 90;

interface BodyRow {
  rowIndex: number;
  cells: string[];
}

interface CellPoint {
  row: number;
  col: number;
}

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
  (e: "update:rows", rows: string[][]): void;
  (e: "update:selection", selection: TableSelection | null): void;
  (e: "content-height", height: number): void;
}>();

// components 子入口自带默认配置与中文包；主题要跟 Vuetify 明暗走
const theme = useTheme();
watchEffect(() => {
  VxeUI.setTheme(theme.current.value.dark ? "dark" : "light");
});

const rootRef = ref<HTMLElement | null>(null);
const columns = computed(() =>
  Array.from({ length: columnCountOf(props.rows) }, (_, index) => index),
);
const columnConfig = computed(() => ({ resizable: !props.readOnly }));
// 表头也来自 rows 首行，所以首行要从表体里让出来
const bodyRows = computed<BodyRow[]>(() => {
  const start = props.header ? 1 : 0;
  return props.rows
    .slice(start)
    .map((cells, offset) => ({ rowIndex: offset + start, cells }));
});
// vxe 的列坐标包含行号列，合并与选中都要减掉这个偏移才是数据列
const seqOffset = computed(() => (props.showIndex ? 1 : 0));
const mergeCells = computed(() =>
  props.merges.map((merge) => ({ ...merge, col: merge.col + seqOffset.value })),
);

// .table-grid 上下各 4px 内边距
const GRID_FRAME_HEIGHT = 8;
// 行高被压到 30px 以下时说明还没渲染完，别把半成品高度报给宿主
const MIN_ROW_HEIGHT = 20;
let lastContentHeight = -1;

const measureContentHeight = (): number => {
  const root = rootRef.value;
  // 真正的滚动容器是 body-inner：它的 scrollHeight 永远等于全部行高，不受可视高度影响
  const scroller = root?.querySelector<HTMLElement>(
    ".vxe-table--body-inner-wrapper",
  );
  const bodyRowCount = props.rows.length - (props.header ? 1 : 0);
  // vxe 首屏是分批渲染的，行没铺满时 scrollHeight 还没长到应有高度
  if (
    !root ||
    !scroller ||
    scroller.scrollHeight < bodyRowCount * MIN_ROW_HEIGHT
  )
    return 0;
  const headerEl = root.querySelector<HTMLElement>(
    ".vxe-table--header-wrapper",
  );
  // vxe 会把横向滚动条的高度从表体里扣掉，所以自适应高度要把它补回来
  const xScrollEl = root.querySelector<HTMLElement>(
    ".vxe-table--scroll-x-wrapper",
  );
  const horizontalScrollbar =
    scroller.scrollWidth > scroller.clientWidth
      ? (xScrollEl?.offsetHeight ?? 0)
      : 0;
  return (
    GRID_FRAME_HEIGHT +
    (headerEl?.offsetHeight ?? 0) +
    scroller.scrollHeight +
    horizontalScrollbar
  );
};

// 高度自适应由宿主决定要不要用，这里只上报真实内容高
const reportContentHeight = () => {
  const height = measureContentHeight();
  if (height <= 0 || height === lastContentHeight) return;
  lastContentHeight = height;
  emit("content-height", height);
};

// vxe 自己的首屏行渲染比组件挂载晚一拍，横向滚动条也要等宽度确定后才出现，
// 所以分几拍复测；每次只有数值变了才上报
const REPORT_DELAYS = [0, 80, 240];

const scheduleReport = () => {
  void nextTick(() => {
    reportContentHeight();
    REPORT_DELAYS.forEach((delay) =>
      window.setTimeout(reportContentHeight, delay),
    );
  });
};

watch(
  () => [props.rows, props.header, props.showIndex, props.merges],
  scheduleReport,
);

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  scheduleReport();
  // 宽度变化会让横向滚动条出现或消失，内容高度跟着变
  resizeObserver = new ResizeObserver(scheduleReport);
  if (rootRef.value) resizeObserver.observe(rootRef.value);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const rangeOf = (first: CellPoint, second: CellPoint): TableSelection => ({
  top: Math.min(first.row, second.row),
  bottom: Math.max(first.row, second.row),
  left: Math.min(first.col, second.col),
  right: Math.max(first.col, second.col),
});
const isMultiCell = (range: TableSelection) =>
  range.top !== range.bottom || range.left !== range.right;
const isSelectedCell = (row: number, col: number): boolean => {
  const range = props.selection;
  return (
    !!range &&
    row >= range.top &&
    row <= range.bottom &&
    col >= range.left &&
    col <= range.right
  );
};

const cellClassOf = ({
  row,
  rowIndex = 0,
  columnIndex = 0,
}: {
  row?: BodyRow;
  rowIndex?: number;
  columnIndex?: number;
}) => {
  const absoluteRow = row?.rowIndex ?? rowIndex + (props.header ? 1 : 0);
  return isSelectedCell(absoluteRow, columnIndex - seqOffset.value)
    ? "is-selected"
    : "";
};
const headerCellClassOf = ({ columnIndex = 0 }: { columnIndex?: number }) =>
  isSelectedCell(0, columnIndex - seqOffset.value) ? "is-selected" : "";

let anchorCell: CellPoint | null = null;
let isSelecting = false;

const cellPointOf = (event: Event): CellPoint | null => {
  const element =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-cell]")
      : null;
  if (!element || !rootRef.value?.contains(element)) return null;
  const [row, col] = (element.dataset.cell ?? "").split("-").map(Number);
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
};

const onCellMouseDown = (event: MouseEvent) => {
  const cell = cellPointOf(event);
  if (!cell) return;
  isSelecting = true;
  if (event.shiftKey && anchorCell) {
    emit("update:selection", rangeOf(anchorCell, cell));
    return;
  }
  anchorCell = cell;
  emit("update:selection", rangeOf(cell, cell));
};

const onCellMouseOver = (event: MouseEvent) => {
  if (!isSelecting || !anchorCell) return;
  const cell = cellPointOf(event);
  if (!cell) return;
  const next = rangeOf(anchorCell, cell);
  const current = props.selection;
  if (
    current &&
    current.top === next.top &&
    current.bottom === next.bottom &&
    current.left === next.left &&
    current.right === next.right
  )
    return;
  emit("update:selection", next);
};

const stopSelecting = () => {
  isSelecting = false;
};
// 拖选跨单元格，必须在捕获阶段收 mouseup，否则会被块内其他处理器吞掉
onMounted(() => window.addEventListener("mouseup", stopSelecting, true));
onBeforeUnmount(() =>
  window.removeEventListener("mouseup", stopSelecting, true),
);

const selectedMatrix = (range: TableSelection): string[][] =>
  props.rows
    .slice(range.top, range.bottom + 1)
    .map((row) => row.slice(range.left, range.right + 1));

const onCopy = (event: ClipboardEvent) => {
  const range = props.selection;
  if (!range || !isMultiCell(range) || !event.clipboardData) return;
  event.preventDefault();
  const tsv = selectedMatrix(range)
    .map((row) => row.join("\t"))
    .join("\n");
  event.clipboardData.setData("text/plain", tsv);
};

const clipboardMatrix = (text: string): string[][] =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t"));

const ensureShape = (
  next: string[][],
  rowCount: number,
  columnCount: number,
) => {
  while (next.length < rowCount) next.push([]);
  next.forEach((row) => {
    while (row.length < columnCount) row.push("");
  });
};

const writeBlock = (top: number, left: number, block: string[][]) => {
  const next = props.rows.map((row) => [...row]);
  const rowCount = Math.min(MAX_TABLE_ROWS, top + block.length);
  const columnCount = Math.min(
    MAX_TABLE_COLUMNS,
    left + Math.max(...block.map((row) => row.length)),
  );
  ensureShape(next, rowCount, columnCount);
  block.forEach((cells, rowOffset) => {
    const target = next[top + rowOffset];
    if (!target) return;
    cells.forEach((value, colOffset) => {
      if (left + colOffset < target.length) target[left + colOffset] = value;
    });
  });
  emit("update:rows", next);
};

const onPaste = (event: ClipboardEvent) => {
  const range = props.selection;
  const text = event.clipboardData?.getData("text/plain") ?? "";
  if (
    props.readOnly ||
    !range ||
    (!text.includes("\t") && !text.includes("\n"))
  )
    return;
  event.preventDefault();
  writeBlock(range.top, range.left, clipboardMatrix(text));
};

// 删除/回退只在多单元格选中时清空，单格仍交给输入框删字符
const onKeyDown = (event: KeyboardEvent) => {
  const range = props.selection;
  if (!range || props.readOnly || !isMultiCell(range)) return;
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  event.preventDefault();
  const blank = Array.from({ length: range.bottom - range.top + 1 }, () =>
    Array.from({ length: range.right - range.left + 1 }, () => ""),
  );
  writeBlock(range.top, range.left, blank);
};

// 每次输入都换新数组，与 config 的"嵌套结构换引用"约定一致
const onCellInput = (rowIndex: number, colIndex: number, event: Event) => {
  const next = props.rows.map((row) => [...row]);
  if (!next[rowIndex]) return;
  next[rowIndex][colIndex] = (event.target as HTMLInputElement).value;
  emit("update:rows", next);
};

const focusCell = (rowIndex: number, colIndex: number) => {
  rootRef.value
    ?.querySelector<HTMLInputElement>(`[data-cell="${rowIndex}-${colIndex}"]`)
    ?.focus();
};

// Enter 沿列往下走，走到末行补一行，表格式录入不必动鼠标
const onCellKeydown = (
  event: KeyboardEvent,
  rowIndex: number,
  colIndex: number,
) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (rowIndex + 1 < props.rows.length) {
    focusCell(rowIndex + 1, colIndex);
    return;
  }
  const width = columnCountOf(props.rows);
  emit("update:rows", [...props.rows, Array.from({ length: width }, () => "")]);
  void nextTick(() => focusCell(props.rows.length, colIndex));
};
</script>

<style scoped>
.table-grid {
  width: 100%;
  height: 100%;
  padding: 4px;
  box-sizing: border-box;
  overflow: hidden;
}

/* vxe 自带浅色皮肤，这里把它拉到 Vuetify 主题变量上，明暗切换不用另建皮肤 */
.grid {
  --vxe-ui-font-size-default: 12px;
  --vxe-ui-font-color: rgb(var(--v-theme-on-surface));
  --vxe-ui-font-primary-color: rgb(var(--v-theme-primary));
  --vxe-ui-layout-background-color: transparent;
  --vxe-ui-table-border-color: rgba(var(--v-theme-on-surface), 0.16);
  --vxe-ui-table-header-background-color: rgba(var(--v-theme-on-surface), 0.05);
  --vxe-ui-table-row-hover-background-color: rgba(var(--v-theme-primary), 0.06);
  --vxe-ui-table-row-hover-current-background-color: rgba(
    var(--v-theme-primary),
    0.06
  );
  --vxe-ui-table-cell-padding-default: 0px;
  --vxe-ui-table-row-height-default: 30px;
}

/* 多选高亮压在单元格底色上，但不盖住输入框自身 */
.grid :deep(.vxe-body--column.is-selected),
.grid :deep(.vxe-header--column.is-selected) {
  background: rgba(var(--v-theme-primary), 0.14);
}

.cell-input {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: inherit;
  user-select: text;
}

.grid :deep(.vxe-header--column) .cell-input {
  font-weight: 600;
}

.cell-input:focus {
  background: rgba(var(--v-theme-primary), 0.08);
}
</style>
