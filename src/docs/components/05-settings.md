<!-- 最后验证: 2026-10-24 -->
# 05 设置面板

设置面板写在块组件的 `#settings` 插槽里，壳负责把它渲染进设置菜单。

```vue
<template>
  <BlockShell>
    <div class="content">…</div>

    <template #settings>
      <v-list density="compact">
        <v-list-item>
          <v-text-field v-model="draft" label="新条目" density="compact" variant="outlined" hide-details />
        </v-list-item>
      </v-list>
    </template>
  </BlockShell>
</template>
```

## 按钮什么时候出现

- 写了 `#settings` → 选中块时出现设置按钮。
- 不写 → 不出现（不会留一个空按钮）。
- 只读态 → 按钮隐藏，面板内容也不会打开。

## 状态共享

设置面板与内容在**同一个组件实例**里，所以直接共用 `ref`，不需要通过 `config` 来回搬：

```ts
const draft = ref('')          // 设置面板里编辑
const addItem = () => {        // 内容区/设置面板都能调
  ctx.setConfig({ items: [...ctx.config.items, { text: draft.value, done: false }] })
  draft.value = ''
}
```

需要落盘的才进 `config`，纯 UI 状态留在 `ref` 里。

## 常见写法

```vue
<template #settings>
  <v-list density="compact">
    <v-list-item>
      <v-select :model-value="config.fit" :items="FIT_OPTIONS" item-title="title" item-value="value"
        label="显示方式" density="compact" variant="outlined" hide-details
        :disabled="ctx.readOnly" @update:model-value="onFitChange" />
    </v-list-item>
    <v-list-item>
      <v-switch :model-value="autoSize" color="primary" label="自动大小" hide-details
        :disabled="ctx.readOnly" @update:model-value="onAutoSizeToggle" />
    </v-list-item>
    <v-list-item class="d-flex justify-end ga-2">
      <v-btn size="small" variant="tonal" :disabled="ctx.readOnly" @click="pickFile">选择文件</v-btn>
    </v-list-item>
  </v-list>
</template>
```

要点：

- 受控组件用 `:model-value` + `@update:model-value`，写入走 `ctx.setConfig`。
- 所有可编辑控件加 `:disabled="ctx.readOnly"`。
- 设置面板挂在 body 的菜单里，里面的 `v-menu` / `v-select` 需要提高层级：`:menu-props="{ zIndex: Z_LAYER.settingsDropdown }"`。

## 什么时候不该放设置面板

- 只有一两个开关且内容区能直接操作时，优先放内容区。
- 高频调节（如滑块拖拽）不要每帧写 `config`，先写本地 `ref`，松手再 `setConfig`。
