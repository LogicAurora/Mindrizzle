<script setup lang="ts">
import { isTauri } from '@tauri-apps/api/core';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import packageInfo from '../../package.json';
import { clearLocalNotes, clearTestNotes, createTestNotes } from '../fileOperations';
import { previewUpdate, resetUpdateState } from '../lib/updateStore';
import { readUpdateChannel, saveUpdateChannel, type UpdateChannel } from '../lib/updater';
import { clearClipboardEntries } from '../utils/blockClipboard';
import { formatBytes } from '../utils/formatBytes';
import { getErrorMessage } from '../utils/getErrorMessage';
import { clearHomeRecords } from '../utils/homeActivity';
import {
  invalidateNoteSetEntries,
  lastNoteSetLoad,
  loadNoteSetEntries,
} from '../utils/noteSetStore';
import { isDebugLoadingEnabled } from '../utils/routeTransition';
import { removeSetting } from '../utils/settingsStore';

const MAX_TEST_NOTE_COUNT = 500;
const DEFAULT_TEST_NOTE_COUNT = 200;
const UPDATE_MANIFEST_ROOT =
  'https://raw.githubusercontent.com/LogicAurora/Mindrizzle/main/channel';
const CHANNEL_OPTIONS: UpdateChannel[] = ['stable', 'beta', 'alpha'];
const TOUR_SETTING_KEYS = ['tour-home-done', 'tour-notesets-done'];

const SAMPLE_NOTES = `### ✨ 新功能

- 调试页可预览更新弹窗，浏览器里也能调样式
- 支持 **粗体**、\`行内代码\` 与 [链接](https://github.com/LogicAurora/Mindrizzle)

### 🐛 问题修复

- 长清单滚动与字号表现

## 🙏 贡献者

- Mindrizzle`;

const router = useRouter();
const path = ref('');
const isCleared = ref(false);

const isWebEnv = !isTauri();
const appVersion = packageInfo.version;
const gitCommit = import.meta.env.VITE_GIT_HASH || '未知';
const environment = isWebEnv ? '浏览器预览' : 'Tauri 桌面应用';
const storageUsage = ref('');

const testNoteCount = ref(DEFAULT_TEST_NOTE_COUNT);
const isPerfBusy = ref(false);
const noteHint = ref('');
const perfHint = ref('');
const storeHint = ref('');

const updateChannel = ref(readUpdateChannel());
const isManifestBusy = ref(false);
const updateHint = ref('');
const isWipeDialogOpen = ref(false);

onMounted(measureStorage);

async function measureStorage() {
  if (!navigator.storage?.estimate) return;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    storageUsage.value = `${formatBytes(usage)} / ${formatBytes(quota)}`;
  } catch (error) {
    storageUsage.value = `读取失败：${getErrorMessage(error)}`;
  }
}

function selectChannel(value: unknown) {
  const matched = CHANNEL_OPTIONS.find((channel) => channel === value);
  if (!matched) return;
  updateChannel.value = matched;
  saveUpdateChannel(matched);
}

async function previewManifestUpdate() {
  isManifestBusy.value = true;
  try {
    const manifest = await fetchManifest(updateChannel.value);
    previewUpdate({
      version: manifest.version,
      currentVersion: `${appVersion}（${environment}）`,
      notes: manifest.notes,
    });
    updateHint.value = `已载入 ${updateChannel.value} 通道 ${manifest.version}`;
  } catch (error) {
    updateHint.value = `读取通道清单失败：${getErrorMessage(error)}`;
  } finally {
    isManifestBusy.value = false;
  }
}

async function fetchManifest(channel: UpdateChannel) {
  const response = await fetch(`${UPDATE_MANIFEST_ROOT}/${channel}-latest.json`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const manifest = (await response.json()) as { version?: unknown; notes?: unknown };
  if (typeof manifest.version !== 'string') throw new Error('清单缺少 version 字段');
  return {
    version: manifest.version,
    notes: typeof manifest.notes === 'string' ? manifest.notes : null,
  };
}

function previewSampleUpdate() {
  previewUpdate({
    version: '9.9.9-preview.1',
    currentVersion: `${appVersion}（调试）`,
    notes: SAMPLE_NOTES,
  });
  updateHint.value = '已载入示例日志';
}

function resetUpdatePreview() {
  resetUpdateState();
  updateHint.value = '';
}

const clearWebNotes = async () => {
  await clearLocalNotes();
  invalidateNoteSetEntries();
  isCleared.value = true;
};

// 笔记存档在 IndexedDB、设置与记录在 localStorage，两边都要清，清完刷新避免旧内存状态残留
async function wipeWebData() {
  localStorage.clear();
  await clearLocalNotes();
  invalidateNoteSetEntries();
  window.location.reload();
}

async function resetTours() {
  await Promise.all(TOUR_SETTING_KEYS.map((key) => removeSetting(key)));
  storeHint.value = '已重置新手引导';
}

function clearClipboard() {
  clearClipboardEntries();
  storeHint.value = '已清空画布剪贴板';
}

function clearHomeData() {
  clearHomeRecords();
  storeHint.value = '已清空首页活动与最近打开';
}

// 批量造样本只为压列表渲染与逐条取元信息的开销，只允许在浏览器端跑
async function generateTestNotes() {
  const count = Math.min(Math.max(Math.floor(testNoteCount.value) || 1, 1), MAX_TEST_NOTE_COUNT);
  await createTestNotes(count);
  invalidateNoteSetEntries();
  noteHint.value = `已生成 ${count} 个测试便签`;
}

async function removeTestNotes() {
  const removed = await clearTestNotes();
  invalidateNoteSetEntries();
  noteHint.value = `已清除 ${removed} 个测试便签`;
}

async function measureNoteSetLoad(force: boolean) {
  isPerfBusy.value = true;
  try {
    await loadNoteSetEntries(undefined, force);
    perfHint.value = '';
  } catch (error) {
    perfHint.value = `测量失败：${getErrorMessage(error)}`;
  } finally {
    isPerfBusy.value = false;
  }
}
</script>
<template>
  <v-container>
    <v-expansion-panels>
      <v-expansion-panel>
        <v-expansion-panel-title>路由</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row>
            <v-col>
              <v-text-field v-model="path" label="路由" />
            </v-col>
            <v-col cols="auto">
              <v-btn @click="router.push(path)">跳转</v-btn>
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel>
        <v-expansion-panel-title>环境与存储</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row>
            <v-col cols="12" sm="6">版本 {{ appVersion }}</v-col>
            <v-col cols="12" sm="6">提交 {{ gitCommit }}</v-col>
            <v-col cols="12" sm="6">环境 {{ environment }}</v-col>
            <v-col cols="12" sm="6">存储占用 {{ storageUsage || '读取中…' }}</v-col>
          </v-row>
          <v-row>
            <v-col cols="auto">
              <v-btn variant="tonal" @click="measureStorage">刷新存储占用</v-btn>
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel>
        <v-expansion-panel-title>更新</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row class="align-center">
            <v-col cols="12" sm="4">
              <v-select
                :model-value="updateChannel"
                :items="CHANNEL_OPTIONS"
                label="通道"
                hide-details
                @update:model-value="selectChannel"
              />
            </v-col>
            <v-col cols="auto">
              <v-btn :loading="isManifestBusy" @click="previewManifestUpdate"
                >读取通道清单并预览</v-btn
              >
            </v-col>
            <v-col cols="auto">
              <v-btn variant="tonal" @click="previewSampleUpdate">用示例日志预览</v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn variant="text" @click="resetUpdatePreview">重置更新状态</v-btn>
            </v-col>
          </v-row>
          <v-row v-if="updateHint">
            <v-col class="text-body-2">{{ updateHint }}</v-col>
          </v-row>
          <v-row>
            <v-col class="text-caption text-medium-emphasis">
              网页端没有 updater 后端，这里只验证清单解析与弹窗渲染，不会真正下载安装。
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel>
        <v-expansion-panel-title>储存与重置</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row class="align-center">
            <v-col cols="auto">
              <v-btn @click="clearWebNotes">清除网页端笔记存档</v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn
                color="error"
                variant="tonal"
                :disabled="!isWebEnv"
                @click="isWipeDialogOpen = true"
                >清除全部网页数据</v-btn
              >
            </v-col>
          </v-row>
          <v-row class="align-center">
            <v-col cols="auto">
              <v-btn variant="text" @click="resetTours">重置新手引导</v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn variant="text" @click="clearClipboard">清空画布剪贴板</v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn variant="text" @click="clearHomeData">清空首页记录</v-btn>
            </v-col>
          </v-row>
          <v-row v-if="!isWebEnv">
            <v-col class="text-caption">桌面端笔记在本地目录，整库清除只对浏览器预览开放</v-col>
          </v-row>
          <v-row v-if="storeHint">
            <v-col class="text-body-2">{{ storeHint }}</v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel>
        <v-expansion-panel-title>便签集渲染性能测试</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row class="align-center">
            <v-col cols="6">
              <v-text-field
                v-model.number="testNoteCount"
                type="number"
                :max="MAX_TEST_NOTE_COUNT"
                label="测试便签数量"
                hide-details
              />
            </v-col>
            <v-col cols="auto">
              <v-btn :disabled="!isWebEnv" @click="generateTestNotes">生成测试便签</v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn :disabled="!isWebEnv" @click="removeTestNotes">清除测试便签</v-btn>
            </v-col>
            <v-col v-if="!isWebEnv" cols="auto" class="text-caption"
              >桌面端禁用以免污染真实笔记目录</v-col
            >
          </v-row>
          <v-row v-if="noteHint">
            <v-col class="text-body-2">{{ noteHint }}</v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel>
        <v-expansion-panel-title>便签集列表拉取性能测试</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row>
            <v-col cols="auto">
              <v-btn :disabled="isPerfBusy" @click="measureNoteSetLoad(false)"
                >测量列表加载（走缓存）</v-btn
              >
            </v-col>
            <v-col cols="auto">
              <v-btn :disabled="isPerfBusy" @click="measureNoteSetLoad(true)"
                >测量列表加载（强制重取）</v-btn
              >
            </v-col>
          </v-row>
          <v-row v-if="lastNoteSetLoad">
            <v-col class="text-body-2">
              最近一次：{{ lastNoteSetLoad.fromCache ? '缓存命中' : '重新拉取' }}，
              {{ lastNoteSetLoad.entryCount }} 条，{{ lastNoteSetLoad.durationMs.toFixed(1) }}
              ms
            </v-col>
          </v-row>
          <v-row v-if="perfHint">
            <v-col class="text-body-2">{{ perfHint }}</v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel>
        <v-expansion-panel-title>编辑笔记过渡动画测试</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row>
            <v-col>
              <v-switch v-model="isDebugLoadingEnabled" label="模拟后端慢速加载进度" hide-details />
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-snackbar v-model="isCleared" timeout="1500">已清除网页端笔记存档</v-snackbar>
    <v-dialog v-model="isWipeDialogOpen" max-width="420">
      <v-card>
        <v-card-title>清除全部网页数据？</v-card-title>
        <v-card-text>
          会删除浏览器里的所有笔记存档、设置、引导标记与剪贴板记录，随后刷新页面。
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="isWipeDialogOpen = false">取消</v-btn>
          <v-btn color="error" @click="wipeWebData">确认清除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
