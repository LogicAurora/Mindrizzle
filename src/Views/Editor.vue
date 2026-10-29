<template>
  <v-sheet class="editor-wrapper">
    <Teleport to="#toolbar-actions" defer>
      <v-btn :loading="isSaving" :icon="mdiContentSave" variant="text" @click="save" />
    </Teleport>
    <Teleport to="#title-left-actions" defer>
      <v-btn :icon="mdiExitToApp" variant="text" @click="$router.push('/set')" />
    </Teleport>
    <v-container class="toolbar" style="height: 133px;">
      <!-- <v-btn @click="save">保存</v-btn> -->
      <!-- <v-btn @click="load">加载</v-btn> -->
      <v-btn @click="toggleEditMode">
        {{ MdrCRef?.isEditMode ? '切换到只读' : '切换到编辑' }}
      </v-btn>
      <v-btn @click="toggleMobileSim">
        {{ mobileButtonLabel }}
      </v-btn>
      <v-btn color="error" data-test="delete-selected" @click="deleteSelected"
        :disabled="!MdrCRef?.isEditMode || MdrCRef?.state.selectedIds.size === 0">
        删除
      </v-btn>
      <v-select
        class="zoom-select"
        :model-value="MdrCRef?.zoom ?? 1"
        :items="ZOOM_OPTIONS"
        label="缩放"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        :disabled="MdrCRef?.mobileMode"
        @update:model-value="setZoom"
      />
    </v-container>
    
    <MdrCanvas class="editor-wrapper" ref="MdrCRef"/>

    <AddBlockPicker v-if="!hasSelection && MdrCRef?.isEditMode" :options="ADD_OPTIONS"
      :model-value="addIdx" :visible="true" @update:model-value="onSelectAdd" />

    <v-snackbar :prepend-icon="mdiCheck" color="success" location="top" v-model="saved" timeout="1500">
      保存成功
    </v-snackbar>
  </v-sheet>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, inject } from 'vue'
import { mdiContentSave, mdiExitToApp, mdiCheck } from '@mdi/js'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { error as logError } from '@tauri-apps/plugin-log'
import MdrCanvas, { type ComponentController } from '../Controls/Canvas/Core/MdrCanvas.vue'
import AddBlockPicker from '../Controls/Canvas/AddBlockPicker.vue'
import { CANVAS_COMPONENTS } from '../Controls/Canvas/Registry/canvasComponents.ts'
import { screenToContent } from '../utils/canvasCoords'
import { useRoute } from 'vue-router'
import { invokeCommand } from '../utils/invoke'
import { getErrorMessage } from '../utils/getErrorMessage.ts'
import { takePendingEditorBody } from '../utils/editorRoute'
import { touchNoteSetUpdatedAt } from '../utils/noteSetStore'
import { setCurrentNote } from '../utils/noteContext'
import { isDebugLoadingEnabled, noteLoadControllerKey } from '../utils/routeTransition'

const noteLoadController = inject(noteLoadControllerKey)

const MdrCRef = ref<InstanceType<typeof MdrCanvas> | null>()

const getComponentRefs = (): Record<string, ComponentController | undefined> =>
  MdrCRef.value!.componentRefs as unknown as Record<string, ComponentController | undefined>

// 添加类型单源
const ADD_OPTIONS = CANVAS_COMPONENTS.map(({ key, title, description, icon, addId }) =>
  ({ key, label: title, description, icon, addId }))
const hasSelection = computed(() => (MdrCRef.value?.state.selectedIds.size ?? 0) > 0)
// 添加类型单选索引
const addIdx = ref(0)
const onSelectAdd = (index: number | null) => {
  if (index == null) return
  addIdx.value = index
}

// 添加预览随当前类型/选中/编辑态同步
watch(
  [addIdx, hasSelection, () => MdrCRef.value?.isEditMode],
  () => {
    const ojc = MdrCRef.value
    if (!ojc) return
    ojc.setAddPreview(hasSelection.value || !ojc.isEditMode ? null : ADD_OPTIONS[addIdx.value]?.key ?? null)
  },
  { immediate: true },
)

// 把视口鼠标坐标换算为画布 content 坐标
const canvasPointFromMouse = (e: MouseEvent): { x: number; y: number } | null => {
  const cont = document.querySelector<HTMLElement>('.canvas-container')
  const ojc = MdrCRef.value
  if (!cont || !ojc) return null
  return screenToContent(
    { zoom: ojc.zoom, origin: ojc.origin, pan: ojc.pan },
    cont.getBoundingClientRect(),
    e.clientX,
    e.clientY,
  )
}

// 记录按下位置以区分简单点击与拖动框选
const CLICK_DRAG_THRESHOLD = 4
let mouseDownX = 0
let mouseDownY = 0
// 已有选中时本次点击语义为取消选中，添加逻辑须跳过
let isDeselectClick = false
// 点击已有块时选中集可能为空，所以记录按下是否落在块/浮层内，落在其上走选中而非添加
let isBlockPress = false
const trackMouseDown = (e: MouseEvent) => {
  mouseDownX = e.clientX
  mouseDownY = e.clientY
  isDeselectClick = hasSelection.value
  // 画布拖拽结束后 mouseup 可能落在文档节点上，所以先确认目标元素存在
  const target = e.target instanceof Element ? e.target : null
  isBlockPress = !!target?.closest?.('.drag-wrapper, .floating-handle, .side-settings, .handle, .block-handle-popup')
}

const onMouseUp = (e: MouseEvent) => {
  // 无选中块：处于"添加块"状态，画布内左键在鼠标位置直接添加当前滚轮选中的类型（工具栏点击/只读态不触发）
  if (hasSelection.value) return
  // 取消多选的点击已在 mouseup 前清空选中，所以此处拦截避免误入添加分支
  if (isDeselectClick || isBlockPress) return
  if (!MdrCRef.value?.isEditMode || e.button !== 0) return
  const target = e.target instanceof Element ? e.target : null
  if (!target?.closest('.canvas-container')) return
  // 仅位移小于阈值的简单点击才添加
  if (Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY) > CLICK_DRAG_THRESHOLD) return
  const key = ADD_OPTIONS[addIdx.value]?.key
  if (key) MdrCRef.value?.addComponent(key, canvasPointFromMouse(e) ?? undefined)
}

const mobileButtonLabel = computed(() => {
  if (MdrCRef.value?.forceMobile === null) return '模拟移动端'
  return MdrCRef.value?.forceMobile ? '强制桌面' : '恢复自动布局'
})

const toggleMobileSim = () => {
  // 模式切换会重挂载组件，先同步组件数据
  MdrCRef.value!.syncComponentData()
  // 布局刷新由 watch(mobileMode) 统一处理，此处仅切换标志
  MdrCRef.value!.forceMobile = MdrCRef.value!.nextForceMobile()
}

const toggleEditMode = () => {
  MdrCRef.value!.isEditMode = !MdrCRef.value!.isEditMode
}

const ZOOM_OPTIONS = [
  { title: '50%', value: 0.5 },
  { title: '100%', value: 1 },
  { title: '200%', value: 2 },
  { title: '300%', value: 3 },
] as const

// 中转一次，避免模板里写嵌套 ref 赋值
const setZoom = (v: number | null) => {
  if (typeof v !== 'number' || v <= 0) return
  MdrCRef.value!.zoom = v
}

const route = useRoute()
// route.params 可能是数组，所以统一取首项
const fileName = Array.isArray(route.params.fileName) ? route.params.fileName[0] : route.params.fileName
const dir = typeof route.query.dir === 'string' ? route.query.dir : undefined
const filePath = typeof route.query.path === 'string' ? route.query.path : undefined
const noteRef = { fileName: String(fileName ?? ''), dir, filePath }
// 组件数据 store 拿不到路由参数，进编辑页先把笔记位置写进上下文
setCurrentNote(noteRef)
const pendingEditorBody = takePendingEditorBody(noteRef)

const isSaving = ref(false)
const saved = ref(false)
const save = async () => {
  isSaving.value = true
  try {
    await invokeCommand("set_mdr_file_body", { ...noteRef, content: MdrCRef.value?.save() ?? '' })
    touchNoteSetUpdatedAt(noteRef.fileName, dir)
  } catch (error) {
    logError(getErrorMessage(error))
  }
  finally {
    isSaving.value = false
    saved.value = true
  }
}

const load = async () => {
  const raw = pendingEditorBody
    ? await pendingEditorBody
    : await invokeCommand<{ content: string }>("get_mdr_file_body", {
        ...noteRef,
        debugProgress: isDebugLoadingEnabled.value,
      })
  if ('error' in raw) throw raw.error
  await MdrCRef.value?.load(raw.content ?? '')
}

const deleteSelected = () => {
  if (!MdrCRef.value?.isEditMode || MdrCRef.value.state.selectedIds.size === 0) return
  const ids = Array.from(MdrCRef.value!.state.selectedIds)
  MdrCRef.value!.state.items = MdrCRef.value!.state.items.filter((it) => !ids.includes(it.uuid))
  MdrCRef.value!.state.selectedIds = new Set()
  const refs = getComponentRefs()
  ids.forEach(id => { delete refs[id] })
}

const initializeEditor = async () => {
  let unlisten: (() => void) | undefined
  noteLoadController?.setName(String(fileName ?? ''))
  try {
    if (isTauri() && !pendingEditorBody) {
      unlisten = await listen<number>('file-load-progress', (event) => {
        noteLoadController?.setProgress(event.payload)
      })
    }
    noteLoadController?.setProgress(2)
    await load()
    noteLoadController?.setProgress(100)
  } catch (error) {
    if (isTauri()) logError(getErrorMessage(error))
  } finally {
    unlisten?.()
    noteLoadController?.finish()
  }
}

onMounted(() => {
  void initializeEditor()
  // 选字可能跨出编辑器，所以挂 window 级 mouseup
  window.addEventListener('mouseup', onMouseUp)
  // 挂 window 级 mousedown 记录按下位置
  window.addEventListener('mousedown', trackMouseDown)
})

onUnmounted(() => {
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('mousedown', trackMouseDown)
})
</script>

<style scoped>
.editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 小窗口下 500px 最小高会顶出 v-main 滚动条，所以只保证不塌陷 */
  min-height: 0;
}

.toolbar {
  flex-shrink: 0;
  padding: 8px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.zoom-select {
  width: 110px;
  margin: 0 8px;
}

/* 未选中按钮背景与工具栏同色、看不出边界，所以补半透明底色 */
.v-btn-toggle :deep(.v-btn:not(.v-btn--selected)) {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
</style>