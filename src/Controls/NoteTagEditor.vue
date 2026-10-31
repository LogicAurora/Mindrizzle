<script setup lang="ts">
import { computed, ref } from 'vue'
import { mdiPlus } from '@mdi/js'

import { resolveTagColor, TAG_NAME_MAX_LEN, tagLibrary } from '../utils/tagStore'

// 中文输入法里逗号常打成全角，两种都当分隔符
const TAG_DELIMITERS = /[,，]/
const KEYWORD_MAX_LEN = 100
// 标签库动辄几百个，一次性铺开既卡又难扫，超出交给搜索
const MAX_VISIBLE_OPTIONS = 60

const props = defineProps<{ modelValue: string[] }>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const keyword = ref('')
const fieldRef = ref<{ focus: () => void } | null>(null)

const availableTags = computed(() =>
  tagLibrary.value.filter((entry) => !props.modelValue.includes(entry.name)),
)

// 输入框兼作搜索，只有名字命中的标签留在候选里
const matchedTags = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  if (!search) return availableTags.value
  return availableTags.value.filter((entry) => entry.name.toLowerCase().includes(search))
})

const createName = computed(() => keyword.value.trim().slice(0, TAG_NAME_MAX_LEN))

const isCreateHintVisible = computed(
  () =>
    !!createName.value &&
    !props.modelValue.includes(createName.value) &&
    !matchedTags.value.length,
)

const isOptionsVisible = computed(() => !!matchedTags.value.length || isCreateHintVisible.value)

const visibleTags = computed(() => matchedTags.value.slice(0, MAX_VISIBLE_OPTIONS))

const hiddenCount = computed(() => matchedTags.value.length - visibleTags.value.length)

function focusInput() {
  fieldRef.value?.focus()
}

// 输入框空着时退格删最后一个标签，chips 输入框的习惯用法
function handleBackspace() {
  if (keyword.value) return
  const lastTag = props.modelValue[props.modelValue.length - 1]
  if (lastTag) removeTag(lastTag)
}

function addTag(name: string) {
  keyword.value = ''
  if (props.modelValue.includes(name)) return
  emit('update:modelValue', [...props.modelValue, name])
}

function removeTag(name: string) {
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => item !== name),
  )
}

// 新标签只落在当前便签上，保存时由详情弹窗统一并入标签库
function commitKeyword() {
  const names = keyword.value
    .split(TAG_DELIMITERS)
    .map((item) => item.trim().slice(0, TAG_NAME_MAX_LEN))
  const additions = names.filter((name) => name && !props.modelValue.includes(name))
  keyword.value = ''
  if (!additions.length) return
  emit('update:modelValue', [...props.modelValue, ...additions])
}
</script>

<template>
  <div class="tag-editor">
    <v-text-field
      ref="fieldRef"
      v-model="keyword"
      class="tag-editor__field"
      dirty
      hide-details
      label="标签"
      :maxlength="KEYWORD_MAX_LEN"
      placeholder="搜索或新建标签"
      @click="focusInput"
      @keydown.backspace="handleBackspace"
      @keydown.delete="handleBackspace"
      @keydown.enter.prevent="commitKeyword"
    >
      <div v-if="modelValue.length" class="tag-editor__chips">
        <v-chip
          v-for="tag in modelValue"
          :key="tag"
          :color="resolveTagColor(tag)"
          closable
          size="small"
          variant="flat"
          @click:close="removeTag(tag)"
        >
          {{ tag }}
        </v-chip>
      </div>
    </v-text-field>
    <div v-if="isOptionsVisible" class="tag-editor__options">
      <v-chip
        v-for="entry in visibleTags"
        :key="entry.name"
        :color="entry.color"
        class="tag-editor__chip"
        size="small"
        variant="tonal"
        @click="addTag(entry.name)"
      >
        <v-icon :icon="mdiPlus" size="x-small" start />
        {{ entry.name }}
      </v-chip>
      <span v-if="hiddenCount" class="text-caption text-medium-emphasis">
        还有 {{ hiddenCount }} 个，输入关键字筛选
      </span>
      <span v-if="isCreateHintVisible" class="tag-editor__create text-caption">
        回车新建「{{ createName }}」
      </span>
    </div>
  </div>
</template>

<style scoped>
.tag-editor__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 标签多时字段自己滚，不能把弹窗顶长 */
.tag-editor__field :deep(.v-field__input) {
  align-content: center;
  column-gap: 8px;
  row-gap: 6px;
  max-height: 160px;
  overflow-y: auto;
  scrollbar-width: thin;
}

/* chips 之后的输入框吃掉剩余宽度，换行时独占一行 */
.tag-editor__field :deep(input) {
  flex: 1 1 120px;
  min-width: 120px;
}

.tag-editor__options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  max-height: 88px;
  margin-top: 8px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.tag-editor__chip {
  cursor: pointer;
}

.tag-editor__create {
  color: rgb(var(--v-theme-primary));
}
</style>
