<!-- 最后验证: 2026-10-30 -->
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

## 图 7.5 富文本原子块（插入组件 / 公式块）的键盘与选区

```mermaid
flowchart TD
  A["插入组件：insertVueComponent(At)"] --> B["placeCaretAfterEmbed<br/>节点后补空段落 + TextSelection"]
  B --> C["用户继续打字落在组件之后<br/>组件与数据不被替换"]

  D["组件被 NodeSelection 选中<br/>（工具条点击 / 拖拽 / 粘贴后）"] --> E["atom-block-keyboard.handleKeyDown"]
  E --> F{"可打印字符？"}
  F -->|是| G["光标让到节点后，交给默认输入处理"]
  F -->|否| H{"方向键？"}
  H -->|是| I["光标越到节点前/后，阻止默认行为"]
  H -->|否| J["交给 baseKeymap<br/>Delete/Backspace 仍可显式删除"]

  K["点击组件工具条"] --> L["selectBlock()<br/>NodeSelection + view.focus()"]
  L --> M["Ctrl+C 走 toDOM 序列化<br/>粘贴经 parseDOM 校验 uuid / props / 尺寸"]

  N["点击嵌入块左右/上下的空隙"] --> O["GapCursor<br/>原生光标被 hideselection 隐藏"]
  O --> P["selectionStyles.css 画块间隙光标<br/>（不带样式时完全不可见）"]
  O --> Q["可打印字符 → caretFromGap<br/>补空段落把光标接进去"]

  R["鼠标拖拽选中文字<br/>selectionchange / 滚动 / 内容尺寸变化"] --> S["useTextSelectionHighlight：按行取 getClientRects<br/>折回布局像素 → .text-selection-highlight-rect"]
  S --> T["原生 .ProseMirror ::selection 置透明<br/>嵌入块内部仍用浏览器原生高亮"]

  U["代码块 textarea 选区<br/>pointerdown 拖拽 / select / keyup / scroll"] --> V["selectionStart/End 在高亮层上取 Range<br/>拖拽期 rAF 合并量算，自绘 .selection-rect"]
```

> 插入组件与公式块都是 atom block：被 NodeSelection 选中时，ProseMirror 的默认输入语义是「替换选区」，一次按键就会连组件带数据一起删掉。因此插入命令不建立 NodeSelection，键盘入口统一经 `atom-block-keyboard.ts` 把光标让到节点之外；组件内容区继续 `stopPropagation` 保留业务输入，工具条承担「选中整块」的选择把手。
>
> 原子块以 `inline-flex` 参与行内排版，块左右会留出可点击的空隙，PM 在那里只能放 GapCursor，而 `defineGapCursor()` 只带插件不带样式（`::selection`/`.ProseMirror-selectednode` 默认值也不随主题），三类选区样式统一收在 `selectionStyles.css`，它由 `RichTextEditor.vue` 随懒加载块一同引入。
>
> 文字选区要圆角只能自绘：`::selection` 不支持圆角，所以原生高亮置透明、按行铺圆角块；高亮层在 `.editor-scroll-shell` 里（不在 `.ProseMirror` 内，否则会被当成文档变更），坐标是布局像素，随 `.canvas` 的 zoom 自动缩放。
>
> 嵌入块自己要接管选区时，用比 `:where(.editor-mount.ProseMirror) ::selection` 更高的优先级把原生高亮关掉：代码块就是按 `selectionStart/End` 在高亮层 `code` 上取 Range，再画到 textarea 上的 `.selection-layer`（两层同字体、滚动同步，坐标同样折回布局像素）。

## 维护提示

- 新增事件 → 更新 02-contracts + 本文件对应图
- 改事件监听顺序 → 更新图