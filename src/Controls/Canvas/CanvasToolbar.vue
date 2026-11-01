<template>
  <Teleport to=".canvas-container" defer>
    <v-sheet
      class="canvas-toolbar"
      :style="{ zIndex: Z_LAYER.formatModePicker }"
      border
      rounded="lg"
      @click.stop
      @mousedown.stop
      @pointerdown.stop
    >
      <v-btn
        v-tooltip:right="isEditMode ? '切换到只读' : '切换到编辑'"
        :icon="isEditMode ? mdiPencilOff : mdiPencil"
        variant="text"
        @click="emit('toggle-edit')"
      />
      <v-btn
        v-tooltip:right="'当前 : ' + mobileLabel"
        :icon="
          mobileLabel === '移动端'
            ? mdiCellphone
            : mobileLabel === '桌面端'
              ? mdiLaptop
              : mdiDevices
        "
        variant="text"
        @click="emit('toggle-mobile')"
      />
      <v-btn
        v-tooltip:right="'删除选中'"
        :disabled="!canDelete"
        :icon="mdiDeleteOutline"
        color="error"
        variant="text"
        @click="emit('delete')"
      />
      <v-btn
        v-tooltip:right="'复制选中'"
        :disabled="!canCopy"
        :icon="mdiContentCopy"
        variant="text"
        @click="emit('copy')"
      />
      <v-btn
        v-tooltip:right="'粘贴'"
        :disabled="!canPaste"
        :icon="mdiContentPaste"
        variant="text"
        @click="pasteLatest"
      />
      <v-menu location="right" offset="8" :disabled="!canPaste">
        <template #activator="{ props: historyProps }">
          <v-btn
            v-bind="historyProps"
            v-tooltip:right="'剪贴板历史'"
            :disabled="!canPaste"
            :icon="mdiHistory"
            variant="text"
          />
        </template>
        <v-list density="compact" max-height="320" min-width="240">
          <v-list-item
            v-for="entry in clipboard"
            :key="entry.id"
            @click="emit('paste', entry)"
          >
            <v-list-item-title>{{ entryTitle(entry) }}</v-list-item-title>
            <v-list-item-subtitle>{{
              formatTime(entry.createdAt)
            }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-menu location="right" offset="8">
        <template #activator="{ props: zoomProps }">
          <v-btn
            v-bind="zoomProps"
            v-tooltip:right="'缩放'"
            class="canvas-toolbar__zoom"
            variant="text"
          >
            {{ Math.round(zoom * 100) }}%
          </v-btn>
        </template>
        <v-list density="compact" min-width="120">
          <v-list-item
            v-for="option in ZOOM_OPTIONS"
            :key="option.value"
            :active="option.value === zoom"
            @click="emit('set-zoom', option.value)"
          >
            <v-list-item-title>{{ option.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-sheet>
  </Teleport>
</template>

<script setup lang="ts">
import {
  mdiCellphone,
  mdiContentCopy,
  mdiContentPaste,
  mdiDeleteOutline,
  mdiHistory,
  mdiPencil,
  mdiLaptop,
  mdiDevices,
  mdiPencilOff,
} from "@mdi/js";

import { Z_LAYER } from "./Core/zIndex.ts";
import { componentMetaOf } from "./Registry/canvasComponents.ts";
import type { ClipboardEntry } from "../../utils/blockClipboard.ts";

const props = defineProps<{
  isEditMode: boolean;
  mobileLabel: string;
  canDelete: boolean;
  canCopy: boolean;
  canPaste: boolean;
  clipboard: ClipboardEntry[];
  zoom: number;
}>();

const emit = defineEmits<{
  "toggle-edit": [];
  "toggle-mobile": [];
  delete: [];
  copy: [];
  paste: [entry: ClipboardEntry];
  "set-zoom": [value: number];
}>();

const ZOOM_OPTIONS = [
  { title: "50%", value: 0.5 },
  { title: "100%", value: 1 },
  { title: "200%", value: 2 },
  { title: "300%", value: 3 },
] as const;

// 历史只给出数量与类型摘要，缩略图级别就够用户辨认是哪一次复制
function entryTitle(entry: ClipboardEntry): string {
  const names = entry.blocks.map(
    (block) => componentMetaOf(block.component)?.title ?? block.component,
  );
  const unique = [...new Set(names)];
  const suffix = unique.length > 2 ? "…" : "";
  return `${entry.blocks.length} 个块 · ${unique.slice(0, 2).join("、")}${suffix}`;
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
};

const pasteLatest = () => {
  const [latest] = props.clipboard;
  if (latest) emit("paste", latest);
};
</script>

<style scoped>
/* 与右侧添加块选择器对称，固定在画布左侧中部 */
.canvas-toolbar {
  position: absolute;
  top: 50%;
  left: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: rgb(var(--v-theme-surface));
  transform: translateY(-50%);
  pointer-events: auto;
}

.canvas-toolbar__zoom {
  min-width: 40px;
  font-size: 0.6875rem;
  letter-spacing: 0;
}

/* 窄屏横排到底部，竖排会挡住本就紧张的内容宽度 */
@media (max-width: 599px) {
  .canvas-toolbar {
    top: auto;
    bottom: 12px;
    left: 50%;
    flex-direction: row;
    transform: translateX(-50%);
  }
}
</style>
