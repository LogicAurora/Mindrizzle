<!-- 最后验证: 2026-10-17 -->
# 00 系统全景

## 心智模型

1. **MdrCanvas.vue 是唯一状态源**：块布局、选中、链接、缩放都在这里。
2. **跨组件通信靠两套契约**：`Mindrizzle:*` CustomEvent + DOM 选择器（详见 02-contracts）。
3. **坐标系是最大认知负担**：画布侧 content/screen/visual 三态，编辑器侧 layout/viewport 两态。

## 图 0.1 系统全景

```mermaid
flowchart TB
  subgraph Canvas["画布层"]
    MC["MdrCanvas.vue"]
    ZI["zIndex.ts"]
    CC["utils/canvasCoords.ts"]
  end

  subgraph Block["块渲染层"]
    MCB["MdrCanvasComponentBase.vue<br/>通用壳 + 浮层 + controller"]
    RB["ResizeBox.vue"]
    RTE["RichTextEditor.vue<br/>自身使用 base"]
    CODE["EditableCodeBlock.vue<br/>自身使用 base"]
    VCN["vue-component.ts"]
    EXT["extension.ts"]
    FMT["formatting.ts"]
    KTX["kateX.ts"]
    RDI["row-drop-indicator.ts + RowDropIndicator.vue"]
  end

  subgraph Handle["悬浮手柄层"]
    BH["block-handle.vue"]
    BHO["blockHandleOwner.ts"]
    UHS["useHoverState.ts"]
    UHU["useHoverUi.ts"]
    UBD["useBlockDrag.ts"]
  end

  subgraph Utils["工具层"]
    BHU["blockHandleUtils.ts"]
  end

  MC --> RB
  MC --> MCB
  MCB --> RB
  RTE --> MCB
  CODE --> MCB
  RTE --> EXT
  RTE --> VCN
  RTE --> RDI
  EXT --> FMT
  EXT --> KTX
  RTE --> BH
  BH --> UHS
  BH --> UHU
  BH --> UBD
  UHS --> BHU
  UHU --> BHU
  UBD --> BHU
  BH --> BHO
  MC --> CC
  MC --> ZI
  BHU -.->|"读取 DOM 契约"| MC
```

## 图 0.2 import 依赖图

```mermaid
flowchart LR
  MC["MdrCanvas.vue"] --> RB["ResizeBox.vue"]
  MC --> MCB["MdrCanvasComponentBase.vue"]
  MC --> CC["canvasCoords.ts"]
  MC --> ZI["zIndex.ts"]
  MC --> BHU["blockHandleUtils.ts"]
  MCB --> RB
  MCB --> GEO["blockFloatGeometry.ts"]
  MCB --> CTRL["canvasComponentControllers.ts"]
  MCB --> ZI
  RTE_B["MdrCanvasComponentBaseRichText.vue"] --> MCB
  RTE_B --> RTE["RichTextEditor.vue"]
  COD["RichTextEditor.vue"] --> MCB
  RTE --> CTRL
  CODE["EditableCodeBlock.vue"] --> MCB
  VCN --> BHO["blockHandleOwner.ts"]
  VCN --> RS["resizeConstraints.ts"]
  RTE["RichTextEditor.vue"] --> EXT["extension.ts"]
  RTE --> BH["block-handle.vue"]
  RTE --> RDI["RowDropIndicator.vue"]
  RTE --> BHU
  EXT --> FMT["formatting.ts"]
  EXT --> KTX["kateX.ts"]
  EXT --> VCN
  BH --> UHS["useHoverState.ts"]
  BH --> UHU["useHoverUi.ts"]
  BH --> UBD["useBlockDrag.ts"]
  BH --> BHU
  UHS --> BHU
  UHU --> BHU
  UBD --> BHU
  RDI --> RDIP["row-drop-indicator.ts"]
```

## 层职责

- **画布层**：MdrCanvas 管布局/会话/缩放；zIndex 定层；canvasCoords 管换算。
- **块渲染层**：MdrCanvasComponentBase 提供通用壳（尺寸、拖拽栏、设置插槽、controller）；具体块组件（RichText/Code）只关心自身 config、可变形与设置 UI；ResizeBox 提供缩放手柄；RichTextEditor 承载 ProseMirror。
- **浮层几何**：blockFloatGeometry 是拖拽栏/设置栏/遮罩几何与 z 的唯一来源，画布命中测试与 basRichTextEditor / EditableCodeBlock 在自己的定义里使用 base，并自行处理 config、可变形、设置 UI 与自动高度；ResizeBox 提供缩放手柄。
- **浮层几何**：blockFloatGeometry 是拖拽栏/设置栏/遮罩几何与 z 的唯一来源，画布命中测试与 base 渲染共用。
- **控制器契约**：canvasComponentControllers 定义块内组件向画布申请移动/改尺寸/平移/缩放/读视图的接口（provide/inject），自动高度与光标跟随都由块组件自己调用
- **工具层**：blockHandleUtils 是编辑器侧唯一坐标与几何入口。

## 维护提示

- 新增文件 → 更新图 0.1、0.2
- 新增跨层依赖 → 检查是否应该走事件而不是 import
- 新增块类型 → 按 [../components/README.md](../components/README.md) 的接入清单登记