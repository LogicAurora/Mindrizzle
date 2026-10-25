<!-- 最后验证: 2026-10-24 -->
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

## 尺寸与布局

- 尺寸可变性只影响「联结与手柄」，组件自己调 `resizeTo` 不受限制。
- 自动高度块要把 `heightChangableOf` 设为 `false`，否则会被联结传播改高度。
- 高度会被 `constraints.minHeight + 8` 钳制，别用固定高度硬顶。

## 快照

- 快照函数必须同步返回。
- canvas / WebGL / iframe 类必须自绘，DOM 克隆是空白。
- 块内 `<textarea>` 的克隆值恒为空，依赖可见层渲染。

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
