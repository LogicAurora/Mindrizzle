<script setup lang="ts">
import { mdiSwapVertical } from "@mdi/js";
import { onMounted, ref } from "vue";

import MdrSettingsPageBase from "./MdrSettingsPageBase.vue";
import {
  commandPaletteShortcut,
  commandPaletteShortcutFromEvent,
  DEFAULT_COMMAND_PALETTE_SHORTCUT,
  loadCommandPaletteShortcut,
  saveCommandPaletteShortcut,
} from "../../utils/commandPaletteShortcut";
import {
  isTitleRollDirection,
  loadTitleRollDirection,
  saveTitleRollDirection,
  titleRollDirection,
} from "../../utils/uiPreference";

const settingsError = ref("");
const isCapturingShortcut = ref(false);

function reportSettingsError(error: unknown) {
  settingsError.value = error instanceof Error ? error.message : String(error);
}

function selectTitleRollDirection(direction: unknown) {
  // 按钮组挂载时会带着当前值回调一次，相同值直接忽略，避免覆盖尚未读回的偏好
  if (
    !isTitleRollDirection(direction) ||
    direction === titleRollDirection.value
  )
    return;
  void saveTitleRollDirection(direction).catch(reportSettingsError);
}

function captureCommandPaletteShortcut(event: KeyboardEvent) {
  if (!isCapturingShortcut.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    isCapturingShortcut.value = false;
    return;
  }
  const shortcut = commandPaletteShortcutFromEvent(event);
  if (!shortcut) {
    settingsError.value = "请同时按下 Ctrl、Alt 或 Meta 与其他按键。";
    return;
  }
  void saveCommandPaletteShortcut(shortcut)
    .then(() => {
      isCapturingShortcut.value = false;
      settingsError.value = "";
    })
    .catch(reportSettingsError);
}

onMounted(() => {
  void Promise.all([
    loadTitleRollDirection(),
    loadCommandPaletteShortcut(),
  ]).catch(reportSettingsError);
});
</script>
<template>
  <MdrSettingsPageBase
    title="界面"
    subtitle="调整应用界面的交互细节。"
    :icon="mdiSwapVertical"
  >
    <section class="settings-section">
      <div class="settings-section-head">
        <div>
          <div class="settings-section-title">工具栏标题滚动方向</div>
          <div class="settings-section-caption">
            切换页面时标题的滚动动画方向，默认从上往下。
          </div>
        </div>
      </div>
      <v-btn-toggle
        :model-value="titleRollDirection"
        mandatory
        divided
        @update:model-value="selectTitleRollDirection"
      >
        <v-btn value="top-down">从上往下</v-btn>
        <v-btn value="bottom-up">从下往上</v-btn>
      </v-btn-toggle>
    </section>
    <section class="settings-section">
      <div class="settings-section-head">
        <div>
          <div class="settings-section-title">命令面板快捷键</div>
          <div class="settings-section-caption">
            在应用任意页面打开文件搜索。点击按钮后按下组合键，按 Esc 取消。
          </div>
        </div>
      </div>
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-btn
          variant="outlined"
          data-shortcut-capture
          @click="isCapturingShortcut = true"
          @keydown="captureCommandPaletteShortcut"
        >
          {{
            isCapturingShortcut
              ? "请按下快捷键…"
              : commandPaletteShortcut
          }}
        </v-btn>
        <v-btn
          v-if="commandPaletteShortcut !== DEFAULT_COMMAND_PALETTE_SHORTCUT"
          variant="text"
          @click="
            saveCommandPaletteShortcut(DEFAULT_COMMAND_PALETTE_SHORTCUT).catch(
              reportSettingsError,
            )
          "
        >
          恢复默认
        </v-btn>
      </div>
      <div v-if="settingsError" class="text-error text-caption mt-2">
        {{ settingsError }}
      </div>
    </section>
  </MdrSettingsPageBase>
</template>
