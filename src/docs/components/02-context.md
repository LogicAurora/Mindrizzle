<!-- 最后验证: 2026-10-24 -->
# 02 BlockContext

块组件通过 `useBlockContext<TConfig>()` 拿到上下文，它只暴露语义，不暴露 DOM 坐标与画布内部结构。

```ts
import { useBlockContext } from '../Sdk/blockContext.ts'

const ctx = useBlockContext<TodoConfig>()
```

| 成员 | 说明 |
| --- | --- |
| `uuid` | 块唯一标识，与 `ComponentsData/<uuid>/` 同名 |
| `config` | 当前配置，只读引用；写入必须走 `setConfig` |
| `setConfig(patch)` | 合并写回、驱动重渲染，并同步给画布持久化 |
| `files` | 块私有文件，见 [06 私有文件](06-files.md) |
| `getView()` | 按需读 `zoom / pan / origin / viewport / block / isPanning` |
| `getSize()` | 当前块尺寸 `{ w, h }` |
| `resizeTo({ w?, h? })` | 改自身尺寸，含联结传播与重叠推挤 |
| `moveBy(dx, dy)` | 移动自身，联动联结块 |
| `panBy(dx, dy)` / `zoomTo(z)` | 平移/缩放画布（`z` 范围 0.5–3） |
| `readOnly` | 只读态（响应式 getter） |
| `isCompact` | 画布移动端模式 |
| `isActive` | 是否处于选中态 |
| `setDropHandlers(handlers)` | 注册后块才能接收画布拖入 |

## 写配置

```ts
ctx.setConfig({ title: '新的标题' })
// 数组/嵌套结构自己换新引用，别原地改
ctx.setConfig({ items: [...ctx.config.items, nextItem] })
```

`config` 是原始对象（不响应式），所以：

- 直接改 `ctx.config.xxx` 既不重渲染也不会落盘；
- 组件里要渲染时用 `computed(() => ctx.config)`，它会在 `setConfig` 后刷新。

## 读视图

`getView()` 是**函数**而不是响应式对象：

```ts
const refresh = () => {
  const { zoom, pan } = ctx.getView()
  label.value = `z${zoom} pan(${Math.round(pan.x)},${Math.round(pan.y)})`
}
```

放进 `computed` 或模板会随每帧 pan 重渲染整个块，只在点击/滚动等时机主动调用。

## 接收拖入

块内有可定位的列表或编辑器时才注册：

```ts
onMounted(() => {
  ctx.setDropHandlers({
    resolveDropAtElement: (el, preferBefore) => resolvePosition(el, preferBefore),
    scrollContent: (deltaY) => listEl.value?.scrollBy(0, deltaY),
  })
})
```

`resolveDropAtElement` 返回 `null` 表示不接收该落点。卸载时传 `null` 注销。

## 环境状态

```ts
<input :disabled="ctx.readOnly" />
<div :class="{ compact: ctx.isCompact }">
```

只读态不要只靠 CSS：画布会隐藏浮层，内部编辑器也要真正禁用。
