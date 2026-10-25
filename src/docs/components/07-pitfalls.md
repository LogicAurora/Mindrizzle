<!-- 最后验证: 2026-10-25 -->
# 07 常见坑

## 一定会踩的

- **不要直接改 `ctx.config`**：它是原始对象，改了不重渲染也不会落盘，一律 `ctx.setConfig(patch)`。
- **不要再包一层 `MdrCanvasComponentBase`**：根用 `BlockShell` 就够，再包会出现双层边框与两套手柄。
- **不要自己写 `v-if="!virtualized"`**：壳已经接管虚拟化，块内只写内容。
- **不要自己监听 window 指针事件**：画布每个编辑器都在捕获阶段监听，再叠一份会随块数线性劣化。
- **`#settings` 不写就不出设置按钮**，写了才会出现。

## 数据

- `config` 只放可 JSON 序列化的小数据；图片/附件/长文本走 `ctx.files`。
- 数组或嵌套结构要换新引用：`ctx.setConfig({ items: [...] })`。
- 读取时假设老数据可能缺字段：`config.items ?? []`。

## 嵌入富文本

- `embed.component` 必须是 props 驱动的独立组件，**不能调 `useBlockContext()`**（嵌入态没有 BlockContext）。
- 只写 `toProps` / `fromProps` 不写 `component`，会复用到块自己的 `.vue`，嵌入时直接抛错。
- 回写用 `emit('update-props', patch)`；`modelValue` / `language` 两个通道是代码块的历史约定。
- 附件类块用 `createBlockFiles(props.blockUuid)` 开目录：拖入与拖出都沿用同一个 uuid，不要靠异步复制文件来交接。
- 共享视图（如 `TableBlock/TableGrid.vue`）用 props + `update:*` 事件，块与嵌入态各自包一层壳。
- **设置面板**：在 `defineBlock({ settings })` 里声明，块组件写进 `#settings` 插槽；嵌入态从 `EMBED_SETTINGS_HOST_KEY` 取宿主自行 `Teleport`（面板挂在 body，避免被 `.editor-scroll` 裁掉）。
- 嵌入组件根是「内容 + Teleport」的 fragment，必须 `defineOptions({ inheritAttrs: false })`，否则 NodeView 传的 `blockUuid` / `style` 会触发 Vue 透传警告。

## 尺寸与布局

- 尺寸可变性只影响「联结与手柄」，组件自己调 `resizeTo` 不受限制。
- 自动高度块要把 `heightChangableOf` 设为 `false`，否则会被联结传播改高度。
- 高度会被 `constraints.minHeight + 8` 钳制，别用固定高度硬顶。

## 快照

- 快照函数必须同步返回。
- canvas / WebGL / iframe 类必须自绘，DOM 克隆是空白。
- **表单控件的值不进入内联 HTML**：`input` / `textarea` 的 value 是 property，DOM 克隆出来的快照里表格是空格子、任务行是空串。这类块必须用函数式 `snapshot` 自己拼文本（参考 `TableBlock.block.ts`）。
- 运行时生成的 blob URL（图片预览）会在 `onBeforeUnmount` 里被 revoke，克隆里的 `<img>` 变成破图；快照改用占位卡片（参考 `FileBlock.block.ts`）。
- 快照 HTML 经 `v-html` 注入，文本来自用户输入或外部 `.mdrf`，拼接前必须 `escapeHtml`。

## 设置面板

- 控件一律加 `:disabled="ctx.readOnly"`。
- 面板里的下拉菜单需要 `:menu-props="{ zIndex: Z_LAYER.settingsDropdown }"`，否则会被面板压住。

## 提交前检查清单

1. 根是 `BlockShell`，内容是默认插槽，设置是 `#settings`。
2. 所有写入走 `ctx.setConfig`。
3. 需要进富文本已声明 `embed`。
4. 视口外快照策略符合内容类型。
5. `bunx vue-tsc --noEmit` 通过。
6. 实操：加块 → 设置 → 只读 → 移出视口再回来 → 保存重开。

## 维护

- 新增 `ctx` 成员 → 更新 [02 BlockContext](02-context.md) 与 [../flow/02-contracts.md](../flow/02-contracts.md)
- 新增 `defineBlock` 字段 → 更新 [03 块定义](03-definition.md)
- 改动快照契约 → 更新 [04 生命周期](04-lifecycle.md) 与 [../flow/05-block-lifecycle.md](../flow/05-block-lifecycle.md)
