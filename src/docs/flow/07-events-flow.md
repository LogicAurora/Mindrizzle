<!-- 最后验证: 2026-10-25 -->
# 07 事件连锁反应

> 事件契约见 02-contracts.md，本文件回答"派发之后发生了什么"。

## 图 7.1 pan / zoom 变化的连锁反应

```mermaid
flowchart TD
  A["pan.x/y 或 zoom.value 变化"] --> B["watch 触发（flush: post）"]
  B --> C["invalidateCanvasScaleCache()"]
  C --> D["派发 Mindrizzle:canvas-transform"]
  D --> E["useHoverState readCanvasZoom"]
  D --> F["useHoverUi onCanvasTransform"]
  D --> G["RichTextEditor onCanvasTransform"]
  D --> H["block-handle 内部监听"]
  B --> I{"customDrag.active?"}
  I -->|是| J["syncDragDom()"]
  I -->|否| K["跳过"]
  B --> L["reconcileVirtualBlocks()"]
  B --> M["canvasStyle / dotsStyle 重算"]
```

## 图 7.2 块选中变化的连锁反应

```mermaid
flowchart TD
  A["state.selectedIds 变化"] --> B["watch 触发"]
  B --> C["派发 Mindrizzle:block-selection"]
  C --> D["useHoverUi onBlockSelectionChange"]
  D --> E["blockSelected 更新"]
  E --> F["handleVisible 重算"]
  F --> G["updateHoverUi"]
  G --> H{"blockSelected 且 activeHover 为空？"}
  H -->|是| I["reassertHoverIfPointerInside"]
  H -->|否| J["跳过"]
  A --> K["selectedOutlineItems 重算"]
  A --> L["blockZ 重算（选中提层）"]
```

## 图 7.3 拖拽开始/结束的全局信号

```mermaid
flowchart TD
  A["startCustomDrag"] --> B["document.body.classList.add('block-handle-dragging')"]
  B --> C["hideAllBlockHandles()"]
  C --> D["向所有 .ProseMirror 派发 -9999 伪事件"]
  D --> E["block-handle body 类隐藏 popup"]
  D --> F["useHoverState onBlockStateChange 清 activeHover"]
  D --> G["useHoverUi updateHoverUi 提前返回"]

  H["onCustomDragUp"] --> I["document.body.classList.remove('block-handle-dragging')"]
  I --> J["popup / highlight 恢复"]
  I --> K["hover 恢复由指针自然触发"]
```

> `document.body.classList.contains('block-handle-dragging')` 是跨编辑器抑制 UI 的**全局 lock**。

## 图 7.4 工具栏按钮组的滚轮切换

```mermaid
flowchart TD
  A["window wheel（冒泡）"] --> B["Editor.cycleOption"]
  B --> C{"指针在 .canvas-container 内？"}
  C -->|否| Z["忽略"]
  C -->|是| D{"在滚动条/可滚容器上或有选中？"}
  D -->|是| Z
  D -->|否| E["preventDefault + 循环切换添加类型"]

  F["window wheel（捕获，先于 stopPropagation）"] --> G["FormatModePicker.onWheel"]
  G --> H{"按住 Alt 且本块选中且非只读？"}
  H -->|否| Z
  H -->|是| I["preventDefault + stopPropagation（不滚内容/滚动条）"]
  I --> I2{"距上次切换 < 40ms（同一手势残余）？"}
  I2 -->|是| Z
  I2 -->|否| I3["循环切换格式模式，弹窗三行滚动一格"]

  P["window pointerdown（捕获）"] --> Q{"Alt 弹窗正展开？"}
  Q -->|是| Q2["收起弹窗，直到重新按 Alt"]
  Q -->|否| Z

  K["window mouseup"] --> L["RichTextEditor.onSelectionMouseUp"]
  L --> M{"本轮按过 Alt、格式模式非指针且选区在本文块内？"}
  M -->|否| Z
  M -->|是| N["v-overlay 确认：左键应用、右键取消"]
```

> 富文本格式模式的生命周期完全在块内部（含应用与确认 overlay）；选择器由块 Teleport 到 `.canvas-container` 右上角，常驻显示当前模式图标，按住 Alt 向左展开上一/当前/下一模式三行。悬浮锚点会展开全部模式图标网格（两列三行，点击可切换，`v-tooltip` 显示名称与简介），与 Alt 轮盘互斥。开始点选/框选会先收起 Alt 弹窗，只有本轮按过 Alt 的选区才弹确认。普通滚轮不再切格式，否则会与块内滚动冲突。

## 维护提示

- 新增事件 → 更新 02-contracts + 本文件对应图
- 改事件监听顺序 → 更新图