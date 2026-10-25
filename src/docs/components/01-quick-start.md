<!-- 最后验证: 2026-10-24 -->
# 01 快速上手

目标：一个能勾选的待办块。两个同名文件，注册表不用动。

## 1. 定义 `Components/TodoBlock.block.ts`

显示名、图标、默认尺寸、初始配置都在这里；文件名必须与组件同名。

```ts
import { mdiCheckboxMarkedOutline } from '@mdi/js'

import type { TodoConfig } from '../Registry/canvasComponents.ts'
import { defineBlock } from '../Sdk/defineBlock.ts'

export default defineBlock<TodoConfig>({
  key: 'TodoBlock',
  title: '待办',
  icon: mdiCheckboxMarkedOutline,
  addId: 'add-todo',
  order: 60,
  defaultConfig: () => ({ items: [] }),
  defaultSize: { w: 320, h: 260 },
})
```

字段含义见 [03 块定义](03-definition.md)。

## 2. 组件 `Components/TodoBlock.vue`

根节点就是 `BlockShell`，设置面板用它的 `#settings` 插槽。
状态就是同一个组件里的 `ref`，和写普通 Vue 组件一样。

```vue
<template>
  <BlockShell>
    <div class="todo-block">
      <label v-for="(item, index) in config.items" :key="index" class="todo-item">
        <input type="checkbox" :checked="item.done" :disabled="ctx.readOnly" @change="toggle(index)" />
        <span :class="{ done: item.done }">{{ item.text }}</span>
      </label>
      <p v-if="!config.items.length" class="todo-empty">还没有条目</p>
    </div>

    <template #settings>
      <v-list density="compact">
        <v-list-item>
          <v-text-field v-model="draft" label="新条目" density="compact" variant="outlined" hide-details />
        </v-list-item>
        <v-list-item class="d-flex justify-end">
          <v-btn size="small" variant="tonal" :disabled="ctx.readOnly" @click="addItem">添加</v-btn>
        </v-list-item>
      </v-list>
    </template>
  </BlockShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import type { TodoConfig } from '../Registry/canvasComponents.ts'
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'

const ctx = useBlockContext<TodoConfig>()
const config = computed(() => ctx.config)
const draft = ref('')

const toggle = (index: number) => {
  const items = config.value.items.map((item, i) =>
    i === index ? { ...item, done: !item.done } : item)
  ctx.setConfig({ items })
}

const addItem = () => {
  const text = draft.value.trim()
  if (!text) return
  ctx.setConfig({ items: [...config.value.items, { text, done: false }] })
  draft.value = ''
}
</script>
```

要点只有三条：根用 `BlockShell`、`useBlockContext()` 拿上下文、`ctx.setConfig()` 写配置。
写不写 `#settings` 插槽决定有没有设置按钮。

## 3. 类型与自动注册

`Registry/canvasComponents.ts` 里追加配置类型：

```ts
export type TodoConfig = WidgetConfig & {
  items: { text: string; done: boolean }[]
}
```

注册表本身不用改：`canvasComponents.ts` 用 `import.meta.glob` 自动收集所有 `*.block.ts`，
并为每个定义挂上同名 `.vue` 的异步组件。

## 4. 验证

1. `bunx vue-tsc --noEmit`
2. 进编辑器点「待办」加块
3. 勾选条目 → 打开设置加一条 → 切只读 → 移出视口再回来 → 保存重开

卡住了看 [07 常见坑](07-pitfalls.md)。
