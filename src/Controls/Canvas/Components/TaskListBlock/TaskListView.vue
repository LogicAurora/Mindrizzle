<template>
  <div ref="rootRef" class="task-view">
    <textarea
      class="task-field task-title"
      :value="title"
      rows="1"
      placeholder="清单标题"
      :readonly="readOnly"
      @input="onTitleInput"
      @keydown.enter.prevent="onTitleEnter"
      @blur="onTitleBlur"
    />

    <div class="task-list">
      <div
        v-for="(task, index) in tasks"
        :key="task.id"
        class="task-row"
        :class="{ 'is-done': task.done }"
      >
        <input
          class="task-check"
          type="checkbox"
          :checked="task.done"
          :disabled="readOnly"
          @change="onToggle(task, $event)"
        />
        <textarea
          class="task-field task-text"
          :value="task.text"
          :readonly="readOnly"
          :data-task="task.id"
          rows="1"
          :placeholder="index === 0 ? '要做什么？' : ''"
          @input="onTextInput(task, $event)"
          @keydown="onTextKeydown($event, task)"
        />
        <button
          v-if="!readOnly"
          class="task-remove"
          type="button"
          title="删除任务"
          @click="removeTask(task.id)"
        >
          <v-icon :icon="mdiClose" size="14" />
        </button>
      </div>
      <div v-if="tasks.length === 0" class="task-empty">还没有任务，按下方按钮添加</div>
    </div>

    <div class="task-footer">
      <button v-if="!readOnly" class="task-add" type="button" @click="addTask(true)">
        <v-icon :icon="mdiPlus" size="14" />
        添加任务
      </button>
      <span class="task-progress">{{ doneCount }} / {{ tasks.length }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { mdiClose, mdiPlus } from '@mdi/js';

import type { TaskItem } from '../../Registry/canvasComponents.ts';
import { createTaskId } from './taskItems.ts';

const props = defineProps<{
  title: string;
  tasks: TaskItem[];
  readOnly: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:title', title: string): void;
  (e: 'update:tasks', tasks: TaskItem[]): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const draftTitle = ref(props.title);
const doneCount = computed(() => props.tasks.filter((task) => task.done).length);

// textarea 不随内容长高，所以每次改文本/换行宽都先归零再读 scrollHeight 重算
const fitField = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};
const fitAllFields = () => {
  rootRef.value?.querySelectorAll<HTMLTextAreaElement>('.task-field').forEach((el) => fitField(el));
};

// 块宽变化会改变折行行数，所以要跟着重量
const fieldResizeObserver = new ResizeObserver(() => fitAllFields());
onMounted(() => {
  if (rootRef.value) fieldResizeObserver.observe(rootRef.value);
  fitAllFields();
});
onUnmounted(() => fieldResizeObserver.disconnect());

watch(
  () => props.tasks,
  () => void nextTick(fitAllFields),
);

watch(
  () => props.title,
  (next) => {
    draftTitle.value = next;
    void nextTick(fitAllFields);
  },
);

const focusTask = async (id: string) => {
  await nextTick();
  rootRef.value?.querySelector<HTMLTextAreaElement>(`[data-task="${CSS.escape(id)}"]`)?.focus();
};

const addTask = (shouldFocus = true) => {
  const task: TaskItem = { id: createTaskId(), text: '', done: false };
  emit('update:tasks', [...props.tasks, task]);
  if (shouldFocus) void focusTask(task.id);
};

const removeTask = (id: string) => {
  emit(
    'update:tasks',
    props.tasks.filter((task) => task.id !== id),
  );
};

// 每键更新走受控 value：Vue 对相同值写入不会移动光标，所以不必攒到 blur
const onTextInput = (task: TaskItem, event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  fitField(target);
  emit(
    'update:tasks',
    props.tasks.map((item) => (item.id === task.id ? { ...item, text: target.value } : item)),
  );
};

// Enter 续写下一行，空文本再按 Enter 收尾，连续录入不用离开键盘
const onTextKeydown = (event: KeyboardEvent, task: TaskItem) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (task.text.trim() === '') {
    (event.target as HTMLTextAreaElement).blur();
    return;
  }
  addTask();
};

const onToggle = (task: TaskItem, event: Event) => {
  const done = (event.target as HTMLInputElement).checked;
  emit(
    'update:tasks',
    props.tasks.map((item) => (item.id === task.id ? { ...item, done } : item)),
  );
};

const onTitleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  fitField(target);
  draftTitle.value = target.value;
};

const onTitleEnter = (event: KeyboardEvent) => {
  (event.target as HTMLTextAreaElement).blur();
};

const onTitleBlur = () => {
  emit('update:title', draftTitle.value.trim());
};
</script>

<style scoped>
.task-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 10px 12px;
  box-sizing: border-box;
  gap: 6px;
}

.task-field {
  display: block;
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
  user-select: text;
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}

.task-title {
  flex: 0 0 auto;
  width: 100%;
  box-sizing: border-box;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}

.task-title::placeholder {
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.task-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow: auto;
}

.task-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 4px;
  padding: 1px 2px;
}

.task-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.task-check {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-top: 4px;
  accent-color: rgb(var(--v-theme-primary));
  cursor: pointer;
}

.task-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.45;
}

.task-text::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.35);
}

.task-row.is-done .task-text {
  text-decoration: line-through;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.task-remove {
  flex: 0 0 auto;
  margin-top: 1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.45);
  cursor: pointer;
  opacity: 0;
}

.task-row:hover .task-remove {
  opacity: 1;
}

.task-remove:hover {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}

.task-empty {
  padding: 8px 2px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.task-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.task-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: rgba(var(--v-theme-primary), 1);
  cursor: pointer;
}

.task-add:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.task-progress {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
</style>
