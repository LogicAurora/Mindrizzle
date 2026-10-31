<script setup lang="ts">
import { ref, watch } from 'vue'

import NoteTagEditor from './NoteTagEditor.vue'
import { getErrorMessage } from '../utils/getErrorMessage'
import { invokeCommand } from '../utils/invoke'
import { loadTagLibrary, rememberTags, sanitizeTags } from '../utils/tagStore'

export interface NoteDetailTarget {
  fileName: string
  dir?: string
  filePath?: string
  name: string
  description: string
  tag: string[]
}

export interface NoteWorkspaceTarget {
  id: string
  name: string
  dir?: string
}

const DEFAULT_WORKSPACE_ID = 'default'
const TITLE_MAX_LEN = 30
const DESCRIPTION_MAX_LEN = 1000

const props = defineProps<{
  isOpen: boolean
  note: NoteDetailTarget | null
  workspaceTargets: NoteWorkspaceTarget[]
  isMovable: boolean
}>()

const emit = defineEmits<{
  'update:close': [value: { status: boolean }]
  saved: [value: { note: NoteDetailTarget; isMoved: boolean }]
}>()

const dialog = ref(false)
const fileName = ref('')
const title = ref('')
const description = ref('')
const tags = ref<string[]>([])
const workspaceId = ref(DEFAULT_WORKSPACE_ID)
const hint = ref('')
const isSaving = ref(false)
const formRef = ref()

const titleRules = [
  (value: string) => !!value.trim() || '不可为空',
  (value: string) => value.length <= TITLE_MAX_LEN || '太长了',
]
const descriptionRules = [
  (value: string) => value.length <= DESCRIPTION_MAX_LEN || '太长了',
]

function resetDraft(note: NoteDetailTarget | null) {
  fileName.value = note?.fileName ?? ''
  title.value = note?.name ?? ''
  description.value = note?.description ?? ''
  tags.value = [...(note?.tag ?? [])]
  const currentTarget = props.workspaceTargets.find((target) => target.dir === note?.dir)
  workspaceId.value = currentTarget?.id ?? DEFAULT_WORKSPACE_ID
  hint.value = ''
  isSaving.value = false
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (!isOpen) {
      dialog.value = false
      return
    }
    resetDraft(props.note)
    dialog.value = true
    await loadTagLibrary()
  },
  { immediate: true },
)

watch(dialog, (isOpen) => {
  if (!isOpen) emit('update:close', { status: false })
})

const resolveTargetDir = (note: NoteDetailTarget): string | undefined =>
  props.isMovable
    ? props.workspaceTargets.find((target) => target.id === workspaceId.value)?.dir
    : note.dir

async function persistNote(note: NoteDetailTarget) {
  const meta = {
    title: title.value.trim(),
    description: description.value.trim(),
    tag: sanitizeTags(tags.value),
  }
  await invokeCommand('set_mdr_file_meta', {
    fileName: note.fileName,
    mdrFileInfo: meta,
    dir: note.dir,
    filePath: note.filePath,
  })
  await rememberTags(meta.tag)
  const targetDir = resolveTargetDir(note)
  const isMoved = props.isMovable && targetDir !== note.dir
  if (isMoved) {
    await invokeCommand('move_mdr_file', { fileName: note.fileName, dir: note.dir, targetDir })
  }
  emit('saved', { note: { ...note, ...meta, dir: targetDir }, isMoved })
  dialog.value = false
}

async function submit() {
  const note = props.note
  if (!note) return
  const { valid } = await formRef.value.validate()
  if (!valid) return
  isSaving.value = true
  try {
    await persistNote(note)
  } catch (error) {
    hint.value = `保存失败：${getErrorMessage(error)}`
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="560">
    <v-card>
      <v-card-title>便签详情 : 「{{ fileName + ".mdrf" }}」</v-card-title>
      <v-card-text>
        <v-form ref="formRef">
          <v-text-field v-model="title" :counter="TITLE_MAX_LEN" :rules="titleRules" label="标题" />
          <v-textarea
            v-model="description"
            :counter="DESCRIPTION_MAX_LEN"
            :rules="descriptionRules"
            label="描述"
            auto-grow
          />
          <NoteTagEditor v-model="tags" />
          <v-select
            v-if="isMovable"
            v-model="workspaceId"
            :items="workspaceTargets"
            item-title="name"
            item-value="id"
            label="所属工作区"
          />
        </v-form>
        <p v-if="hint" class="text-error text-caption mt-2">{{ hint }}</p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="error" variant="text" @click="dialog = false">取消</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="text" :loading="isSaving" @click="submit">保存</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
