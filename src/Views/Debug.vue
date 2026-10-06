<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { isTauri } from '@tauri-apps/api/core';

import { getErrorMessage } from '../utils/getErrorMessage';
import { clearLocalNotes, clearTestNotes, createTestNotes } from '../utils/localNoteStore';
import { invalidateNoteSetEntries, lastNoteSetLoad, loadNoteSetEntries } from '../utils/noteSetStore';
import { isDebugLoadingEnabled } from '../utils/routeTransition';

const MAX_TEST_NOTE_COUNT = 500
const DEFAULT_TEST_NOTE_COUNT = 200

const router = useRouter()
const path = ref("")
const isCleared = ref(false)

const isWebEnv = !isTauri()
const testNoteCount = ref(DEFAULT_TEST_NOTE_COUNT)
const isPerfBusy = ref(false)
const noteHint = ref('')
const perfHint = ref('')

const clearWebStorage = () => {
  clearLocalNotes()
  invalidateNoteSetEntries()
  isCleared.value = true
}

// 批量造样本只为压列表渲染与逐条取元信息的开销，只允许在浏览器端跑
function generateTestNotes() {
  const count = Math.min(Math.max(Math.floor(testNoteCount.value) || 1, 1), MAX_TEST_NOTE_COUNT)
  createTestNotes(count)
  invalidateNoteSetEntries()
  noteHint.value = `已生成 ${count} 个测试便签`
}

function removeTestNotes() {
  const removed = clearTestNotes()
  invalidateNoteSetEntries()
  noteHint.value = `已清除 ${removed} 个测试便签`
}

async function measureNoteSetLoad(force: boolean) {
  isPerfBusy.value = true
  try {
    await loadNoteSetEntries(force)
    perfHint.value = ''
  } catch (error) {
    perfHint.value = `测量失败：${getErrorMessage(error)}`
  } finally {
    isPerfBusy.value = false
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
        <v-expansion-panel-title>储存</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row>
            <v-btn @click="clearWebStorage">清除浏览器测试用的网页储存</v-btn>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel>
        <v-expansion-panel-title>便签集渲染性能测试</v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row class="align-center">
            <v-col cols="6">
              <v-text-field v-model.number="testNoteCount" type="number" :max="MAX_TEST_NOTE_COUNT" label="测试便签数量"
                hide-details />
            </v-col>
            <v-col cols="auto">
              <v-btn :disabled="!isWebEnv" @click="generateTestNotes">生成测试便签</v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn :disabled="!isWebEnv" @click="removeTestNotes">清除测试便签</v-btn>
            </v-col>
            <v-col v-if="!isWebEnv" cols="auto" class="text-caption">桌面端禁用以免污染真实笔记目录</v-col>
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
              <v-btn :disabled="isPerfBusy" @click="measureNoteSetLoad(false)">测量列表加载（走缓存）</v-btn>
            </v-col>
            <v-col cols="auto">
              <v-btn :disabled="isPerfBusy" @click="measureNoteSetLoad(true)">测量列表加载（强制重取）</v-btn>
            </v-col>
          </v-row>
          <v-row v-if="lastNoteSetLoad">
            <v-col class="text-body-2">
              最近一次：{{ lastNoteSetLoad.fromCache ? '缓存命中' : '重新拉取' }}，
              {{ lastNoteSetLoad.entryCount }} 条，{{ lastNoteSetLoad.durationMs.toFixed(1) }} ms
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
  </v-container>
</template>