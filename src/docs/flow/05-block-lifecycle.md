<!-- 最后验证: 2026-10-18 -->
# 05 块生命周期

## 三种状态

- **Active**：真实组件实例挂载，ProseMirror 完整运行
- **Snapshot**：视口外，实例销毁，只留 sanitized DOM 快照
- **Removed**：已删除

## 图 5.1 块虚拟化状态机

```mermaid
stateDiagram-v2
  [*] --> Active: addComponent / load
  Active --> Snapshot: 视口外 + 未固定<br/>virtualizeBlock()
  Snapshot --> Active: 回到视口 / 被固定<br/>重建实例 + applyBlockScrolls
  Active --> Removed: deleteSelected
  Snapshot --> Removed: deleteSelected
  Removed --> [*]
```

## 图 5.2 isBlockPinned 判定

```mermaid
flowchart TD
  A["isBlockPinned(item)"] --> B{"state.selectedIds.has?"}
  B -->|是| Z["true 不虚拟化"]
  B -->|否| C{"customDrag.draggingUuids.has?"}
  C -->|是| Z
  C -->|否| D{"resizeSession.uuid === item.uuid?"}
  D -->|是| Z
  D -->|否| E{"popupBlockUuid / popupActiveUuid === item.uuid?"}
  E -->|是| Z
  E -->|否| F{"richTextDropTargetId === item.uuid?"}
  F -->|是| Z
  F -->|否| G{"isBlockNearViewport?"}
  G -->|是| Z
  G -->|否| H["false 走虚拟化"]
```

> 以下情况永不虚拟化：选中 / 拖拽中 / resize 中 / popup 打开 / 富文本落点目标。

## 图 5.3 reconcileVirtualBlocks 主流程

```mermaid
flowchart TD
  A["reconcileVirtualBlocks()"] --> B["focusedUuid()"]
  B --> C["遍历 state.items"]
  C --> D{"等于 focused?"}
  D -->|是| E["保持 active"]
  D -->|否| F{"isBlockPinned?"}
  F -->|是| E
  F -->|否| G{"isBlockNearViewport?"}
  G -->|是| E
  G -->|否| H{"已虚拟化？"}
  H -->|是| I["保留旧快照"]
  H -->|否| J["virtualizeBlock 生成快照"]
  E --> K["sameBlockUuids 对比"]
  I --> K
  J --> K
  K -->|相同| L["提前返回"]
  K -->|不同| M["写 virtualSnapshots"]
  M --> N["restoreScrollsSoon(touchedIds)"]
  N --> O["nextTick + rAF 双补帧"]
```

## 图 5.4 virtualizeBlock 内部

```mermaid
flowchart TD
  A["virtualizeBlock(item)"] --> B["查 .drag-wrapper[data-uuid] .inner-component"]
  B --> C{"存在？"}
  C -->|否| Z["返回空串"]
  C -->|是| D["saveConfig 落回 config"]
  D --> E["scrollRecordsOf 记录滚动位置"]
  E --> F["sanitizeSnapshot 去 contenteditable/tabindex"]
  F --> G["返回 HTML 快照"]
  G --> H["virtualSnapshots[id] = 快照"]
```

> 顺序很重要：**先 saveConfig → 再记录滚动 → 最后克隆 HTML**。实例一去，doc 与 DOM 都取不到。

## 图 5.5 自动高度与光标跟随（组件内实现）

```mermaid
flowchart TD
  A["useDocChange / RO 回调"] --> B["RichTextEditor.syncAutoHeight()"]
  B --> C["测 .editor-scroll.offsetHeight + 10"]
  C --> D["componentController.resizeTo({ height })"]
  D --> E["MdrCanvas resizeBlockTo → applyBlockSize"]
  E --> F{"mobileMode?"}
  F -->|是| G["shiftBlocksBelow 下方堆叠块跟随"]
  F -->|否| H["propagateLinkedEdges 联结群<br/>heightChangable=false 的块不改高"]
  H --> I["pushOverlapped<br/>按起始方位：右侧推右 / 下方推下"]
  G --> J["scheduleGeometryRefresh + markLayoutDirty"]
  I --> J
  C --> K["canvasController.getViewData()"]
  K --> L["光标超出视口底部 → panBy(0, -over)"]
```

> `heightChangable` 由块组件注册项声明（富文本 autoHeight 时不可改高），画布与 base 共用同一判定；`isPanning` 由 `getViewData` 提供，拖拽平移期间组件不跟随光标。
> 组件自己调用 `resizeTo` 不受 changable 拦截；自动大小（如图片块）在尺寸落定后把两轴都置为不可变，手柄随之收掉。
>
> `pushOverlapped` 按**变更前**的起始矩形判断方位：原本贴在右侧的块横向右推（横向联结群跟随），原本在下方/底边贴合的块纵向推下；变宽后新产生的横向重叠不会再被误判成「下方块」，也不会把侧边块推到下面。

## 维护提示

- 新增"固定块"条件 → 更新图 5.2
- 改虚拟化顺序 → 更新图 5.4
- 改 autoHeight 推挤 → 更新图 5.5，并补充相关回归验证
- 自动高度的测量、`resizeTo` 与光标跟随都在 `RichTextEditor.vue` 内，画布只保留通用 `applyBlockSize`