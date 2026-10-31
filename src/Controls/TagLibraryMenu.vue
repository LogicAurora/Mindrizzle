<script setup lang="ts">
import { computed, ref } from 'vue'
import { mdiCheck, mdiClose, mdiMagnify, mdiPencilOutline, mdiTagMultipleOutline, mdiTrashCanOutline } from '@mdi/js'

import { getErrorMessage } from '../utils/getErrorMessage'
import { removeTagFromNotes, renameTagInNotes } from '../utils/noteSetStore'
import {
  forgetTag,
  rememberTags,
  renameTag,
  setTagColor,
  TAG_COLORS,
  TAG_NAME_MAX_LEN,
  tagLibrary,
  type TagEntry,
  type TagLibraryChange,
} from '../utils/tagStore'

const emit = defineEmits<{
  changed: [change: TagLibraryChange]
}>()

// 每行都是重组件时，几百个标签一展开就是一次卡顿；超出部分交给搜索
const MAX_VISIBLE_ROWS = 100

const draftName = ref('')
const editingName = ref('')
const editingDraft = ref('')
const expandedColorName = ref('')
const hint = ref('')
const isBusy = ref(false)
const isMenuOpen = ref(false)
const searchKeyword = ref('')

const tagCount = computed(() => tagLibrary.value.length)

// 库里标签一多就靠搜索兜底，否则得在长列表里翻
const visibleEntries = computed(() => {
  const search = searchKeyword.value.trim().toLowerCase()
  if (!search) return tagLibrary.value
  return tagLibrary.value.filter((entry) => entry.name.toLowerCase().includes(search))
})

// 每行三个交互元素，几百个标签全量渲染会卡住打开动画
const renderedEntries = computed(() => visibleEntries.value.slice(0, MAX_VISIBLE_ROWS))

const hiddenCount = computed(() => visibleEntries.value.length - renderedEntries.value.length)

function clearEditing() {
  editingName.value = ''
  editingDraft.value = ''
}

function togglePalette(name: string) {
  expandedColorName.value = expandedColorName.value === name ? '' : name
}

function startRename(name: string) {
  expandedColorName.value = ''
  editingName.value = name
  editingDraft.value = name
  hint.value = ''
}

async function addTag() {
  const name = draftName.value.trim()
  if (!name) return
  const countBefore = tagLibrary.value.length
  try {
    await rememberTags([name])
  } catch (error) {
    hint.value = `添加失败：${getErrorMessage(error)}`
    return
  }
  if (tagLibrary.value.length === countBefore) {
    hint.value = '标签已存在'
    return
  }
  draftName.value = ''
  hint.value = ''
}

async function submitRename() {
  const oldName = editingName.value
  const nextName = editingDraft.value.trim()
  if (!oldName || nextName === oldName) {
    clearEditing()
    return
  }
  isBusy.value = true
  try {
    if (!(await renameTag(oldName, nextName))) {
      hint.value = '新名字为空或已被占用'
      return
    }
    const count = await renameTagInNotes(oldName, nextName)
    hint.value = count ? `已同步 ${count} 条便签` : ''
    // 回写成功才通知列表就地换名，失败时保持旧卡片让用户重试
    emit('changed', { kind: 'rename', name: oldName, nextName })
    clearEditing()
  } catch (error) {
    hint.value = `重命名失败：${getErrorMessage(error)}`
  } finally {
    isBusy.value = false
  }
}

async function removeTag(entry: TagEntry) {
  isBusy.value = true
  try {
    const count = await removeTagFromNotes(entry.name)
    await forgetTag(entry.name)
    if (editingName.value === entry.name) clearEditing()
    hint.value = count ? `已从 ${count} 条便签移除` : ''
    emit('changed', { kind: 'remove', name: entry.name })
  } catch (error) {
    hint.value = `删除失败：${getErrorMessage(error)}`
  } finally {
    isBusy.value = false
  }
}

async function applyTagColor(entry: TagEntry, color: string) {
  try {
    await setTagColor(entry.name, color)
  } catch (error) {
    hint.value = `改色失败：${getErrorMessage(error)}`
  }
}

function pickColor(entry: TagEntry, color: string) {
  expandedColorName.value = ''
  void applyTagColor(entry, color)
}

// 取色器关掉才回写一次，拖选过程中不刷设置
function onCustomColor(entry: TagEntry, event: Event) {
  void applyTagColor(entry, (event.target as HTMLInputElement).value)
}
</script>

<template>
  <v-menu v-model="isMenuOpen" location="bottom end" offset="4" :close-on-content-click="false">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        aria-label="标签库"
        :icon="mdiTagMultipleOutline"
        class="text-white"
        variant="text"
      />
    </template>
    <v-card width="340">
      <v-card-title class="text-subtitle-1 d-flex align-center">
        标签库
        <v-spacer />
        <span class="text-caption text-medium-emphasis">{{ tagCount }} 个</span>
      </v-card-title>
      <v-divider />
      <div class="px-3 pt-2">
        <v-text-field
          v-model="searchKeyword"
          density="compact"
          hide-details
          placeholder="搜索标签"
          :prepend-inner-icon="mdiMagnify"
          variant="outlined"
        />
      </div>
      <div class="tag-library__list pa-2">
        <p v-if="!visibleEntries.length" class="text-caption text-medium-emphasis px-2 py-1">
          {{ tagCount ? '没有匹配的标签' : '还没有标签' }}
        </p>
        <div v-for="entry in renderedEntries" :key="entry.name">
          <div class="tag-library__row">
            <button
              :aria-label="`修改 ${entry.name} 的颜色`"
              class="tag-library__swatch"
              :style="{ background: entry.color }"
              type="button"
              @click="togglePalette(entry.name)"
            />
            <template v-if="editingName === entry.name">
              <v-text-field
                v-model="editingDraft"
                autofocus
                class="tag-library__editor"
                density="compact"
                hide-details
                :maxlength="TAG_NAME_MAX_LEN"
                :disabled="isBusy"
                @keyup.enter="submitRename"
                @keyup.esc="clearEditing"
              />
              <button
                :disabled="isBusy"
                aria-label="确认重命名"
                class="tag-library__action"
                type="button"
                @click="submitRename"
              >
                <svg class="tag-library__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path :d="mdiCheck" />
                </svg>
              </button>
              <button
                aria-label="取消重命名"
                class="tag-library__action"
                type="button"
                @click="clearEditing"
              >
                <svg class="tag-library__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path :d="mdiClose" />
                </svg>
              </button>
            </template>
            <template v-else>
              <span class="tag-library__name">{{ entry.name }}</span>
              <button
                :aria-label="`重命名 ${entry.name}`"
                class="tag-library__action"
                type="button"
                @click="startRename(entry.name)"
              >
                <svg class="tag-library__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path :d="mdiPencilOutline" />
                </svg>
              </button>
              <button
                :aria-label="`删除 ${entry.name}`"
                class="tag-library__action"
                type="button"
                @click="removeTag(entry)"
              >
                <svg class="tag-library__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path :d="mdiTrashCanOutline" />
                </svg>
              </button>
            </template>
          </div>
          <div v-if="expandedColorName === entry.name" class="tag-library__palette">
            <button
              v-for="color in TAG_COLORS"
              :key="color"
              :aria-label="color"
              class="tag-library__swatch tag-library__swatch--option"
              :style="{ background: color }"
              type="button"
              @click="pickColor(entry, color)"
            />
            <label class="tag-library__swatch tag-library__swatch--option tag-library__swatch--custom" title="自定义颜色">
              <input
                aria-label="自定义颜色"
                class="tag-library__color-input"
                type="color"
                :value="entry.color"
                @change="onCustomColor(entry, $event)"
              />
            </label>
          </div>
        </div>
        <p v-if="hiddenCount" class="text-caption text-medium-emphasis px-2 py-1">
          还有 {{ hiddenCount }} 个，输入关键字筛选
        </p>
      </div>
      <v-divider />
      <div class="d-flex align-center pa-2">
        <v-text-field
          v-model="draftName"
          class="tag-library__editor"
          density="compact"
          hide-details
          :maxlength="TAG_NAME_MAX_LEN"
          placeholder="新标签名称"
          @keyup.enter="addTag"
        />
        <v-btn class="ms-2" color="primary" variant="text" @click="addTag">添加</v-btn>
      </div>
      <p v-if="hint" class="text-caption text-medium-emphasis px-3 pb-2">{{ hint }}</p>
    </v-card>
  </v-menu>
</template>

<style scoped>
/* 标签可能很多，菜单高度得自己收住，否则在桌面端会顶出窗口 */
.tag-library__list {
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.tag-library__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
}

.tag-library__swatch {
  flex: none;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.tag-library__swatch--option {
  width: 24px;
  height: 24px;
}

.tag-library__palette {
  display: grid;
  grid-template-columns: repeat(6, auto);
  gap: 8px;
  padding: 4px 8px 8px 30px;
}

.tag-library__swatch--custom {
  position: relative;
  overflow: hidden;
  /* 彩虹环本身就是「任意颜色」的提示 */
  background: conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935);
}

.tag-library__color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  opacity: 0;
  cursor: pointer;
}

.tag-library__name {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 行内操作改用原生按钮：几百行时 VBtn 的组件开销是展开卡顿的主因 */
.tag-library__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.tag-library__action:hover {
  color: rgba(var(--v-theme-on-surface), 0.87);
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.tag-library__action:disabled {
  opacity: 0.4;
  cursor: default;
}

.tag-library__icon {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.tag-library__editor {
  flex: 1;
}
</style>
