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

## 图 7.4 右侧三态轮盘的滚轮切换

```mermaid
flowchart TD
  A["window wheel（捕获）"] --> B["AddBlockPicker.onWheel"]
  B --> C{"无选中且在 .canvas-container 内？"}
  C -->|否| Z["忽略"]
  C -->|是| D["preventDefault + 展开轮盘并切一格"]
  D --> D2["900ms 无滚动自动收起（悬浮不展开）"]

  F["window wheel（捕获）"] --> G["WheelSwitch.onWheel"]
  G --> H{"轮盘已展开且指针在画布内？"}
  H -->|否| Z
  H -->|是| I["preventDefault + stopPropagation（不滚内容/滚动条）"]
  I --> I2{"距上次切换 < 40ms（同一手势残余）？"}
  I2 -->|是| Z
  I2 -->|否| I3["循环切换，弹窗三行滚动一格"]

  P["window pointerdown（捕获）"] --> Q{"Alt 弹窗正展开？"}
  Q -->|是| Q2["收起弹窗，直到重新按 Alt"]
  Q -->|否| Z

  K["window mouseup"] --> L["RichTextEditor.onSelectionMouseUp"]
  L --> M{"本轮按过 Alt 且选区在本文块内？"}
  M -->|否| Z
  M -->|是| N["v-overlay 确认：左键应用、右键取消"]
```

> 富文本格式模式与添加块共用 `WheelSwitch` 三态轮盘和 `ModeGrid` 图标网格，选择器统一 Teleport 到 `.canvas-container` 右侧中部。富文本锚点按住 Alt 展开轮盘；添加块锚点滚轮展开轮盘并切一格，停手 900ms 自动收起；两者悬浮都只展开图标网格，点击才切换，悬浮本身不改选中值。标题/字体颜色/背景高亮在下方挂详情轮盘：Alt+Ctrl+滚轮切换，悬浮展开网格；颜色详情为 12 色板 + 自定义取色器，Alt+Ctrl 时主轮盘让位。只有本轮按过 Alt 的选区才弹应用确认；普通滚轮不再切格式，否则会与块内滚动冲突。

## 维护提示

- 新增事件 → 更新 02-contracts + 本文件对应图
- 改事件监听顺序 → 更新图