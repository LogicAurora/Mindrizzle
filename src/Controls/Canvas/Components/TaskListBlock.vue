<template>
  <BlockShell>
    <TaskListView :title="title" :tasks="tasks" :read-only="ctx.readOnly" @update:title="onTitleUpdate"
      @update:tasks="onTasksUpdate" />

    <template #settings>
      <TaskSettings :title="title" :tasks="tasks" :read-only="ctx.readOnly" @update="onSettingsUpdate" />
    </template>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { TaskItem, TaskListBlockConfig } from '../Registry/canvasComponents.ts'
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'
import TaskListView from './TaskListBlock/TaskListView.vue'
import TaskSettings from './TaskListBlock/TaskSettings.vue'
import { normalizeTasks } from './TaskListBlock/taskItems.ts'

const ctx = useBlockContext<TaskListBlockConfig>()

const tasks = ref<TaskItem[]>(normalizeTasks(ctx.config.tasks))
const title = computed(() => String(ctx.config.title ?? ''))

// 载入新文档会整体换 config，自己 commit 时写的是同一数组引用，据此避免回灌覆盖输入
watch(
  () => ctx.config.tasks,
  (next) => {
    if (next !== tasks.value) tasks.value = normalizeTasks(next)
  },
)

const onTasksUpdate = (next: TaskItem[]) => {
  tasks.value = next
  ctx.setConfig({ tasks: next })
}

const onTitleUpdate = (next: string) => {
  ctx.setConfig({ title: next })
}

// 设置面板改的是同一份 tasks，先同步本地再写回 config
const onSettingsUpdate = (patch: Record<string, unknown>) => {
  if (Array.isArray(patch.tasks)) tasks.value = patch.tasks as TaskItem[]
  ctx.setConfig(patch)
}
</script>
