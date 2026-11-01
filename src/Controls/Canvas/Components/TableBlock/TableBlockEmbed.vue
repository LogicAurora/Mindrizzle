<template>
  <TableGrid
    :rows="rows"
    :header="header"
    :stripe="stripe"
    :show-index="showIndex"
    :merges="merges"
    v-model:selection="selection"
    :read-only="readOnly === true"
    @update:rows="onRowsUpdate"
  />
  <Teleport v-if="settingsHost" :to="settingsHost">
    <TableSettings
      :rows="rows"
      :header="header"
      :stripe="stripe"
      :show-index="showIndex"
      :merges="merges"
      :selection="selection"
      :read-only="readOnly === true"
      @update="onSettingsUpdate"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, inject, ref, watch } from "vue";

// 根是「内容 + Teleport」的 fragment，透传 attrs 无处可落

defineOptions({ inheritAttrs: false });

import { EMBED_SETTINGS_HOST_KEY } from "../../Sdk/embedSettingsHost.ts";
import TableSettings from "./TableSettings.vue";
import {
  bodyRowCountOf,
  columnCountOf,
  normalizeTableMerges,
  normalizeTableRows,
  type TableSelection,
} from "./tableRows.ts";

// 块定义是同步注册的，vxe-table 体积不能跟着进首屏包
const TableGrid = defineAsyncComponent(() => import("./TableGrid.vue"));

const props = defineProps<{
  rows?: unknown;
  header?: boolean;
  stripe?: boolean;
  showIndex?: boolean;
  merges?: unknown;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  (e: "update-props", patch: Record<string, unknown>): void;
}>();

const settingsHost = inject(EMBED_SETTINGS_HOST_KEY, ref(null));
const rows = ref<string[][]>(normalizeTableRows(props.rows));
const header = computed(() => props.header !== false);
const stripe = computed(() => props.stripe === true);
const showIndex = computed(() => props.showIndex === true);
const selection = ref<TableSelection | null>(null);
const merges = computed(() =>
  normalizeTableMerges(
    props.merges,
    bodyRowCountOf(rows.value, header.value),
    columnCountOf(rows.value),
  ),
);

// 节点 attrs 换了（撤销/重做）就回灌，自己写回的是同一引用，据此避免覆盖输入
watch(
  () => props.rows,
  (next) => {
    if (next !== rows.value) rows.value = normalizeTableRows(next);
  },
);

const onRowsUpdate = (next: string[][]) => {
  rows.value = next;
  emit("update-props", { rows: next });
};

const onSettingsUpdate = (patch: Record<string, unknown>) => {
  if (Array.isArray(patch.rows)) rows.value = patch.rows as string[][];
  emit("update-props", patch);
};
</script>
