<!-- 最后验证: 2026-11-08 -->

# 10 工具函数索引

## 图 10.1 blockHandleUtils 函数分类

```mermaid
flowchart TB
  subgraph 编辑器访问
    A1["getView(editor)"]
    A2["getScrollEl(view)"]
    A3["getBlockEl(view, pos)"]
    A4["findPositionerEl(view)"]
  end
  subgraph 几何测量
    B1["getVisibleBlockRect(el)"]
    B2["getBlockRect(view, pos)"]
    B3["getClipRect(view)"]
    B4["getVisibleBlockRectInViewport(view, el)"]
    B5["isFullyVisibleInCanvas(el)"]
    B6["getPopupHeight / getPopupWidth"]
  end
  subgraph 坐标换算
    C1["layoutToViewportX/Y/Size"]
    C2["viewportToLayout"]
    C3["getCanvasMetrics（内部，含 scale 与 zoom）"]
    C4["invalidateCanvasScaleCache"]
    C5["layoutToCanvasCss（BCR 布局 → zoom 空间 CSS 长度）"]
  end
  subgraph 指针与 hover
    D1["getRealPointer()"]
    D2["isPointerInsideRect(rect)"]
    D3["dispatchBlockHover(view, pos)"]
  end
  subgraph Context 解析
    E1["createStoreResolver"]
    E2["createOverlayStoreResolver"]
    E3["clearStoreHover"]
  end
```

> `getClipRect` 的输入横跨两个坐标空间：容器 BCR 是视觉坐标、块内滚动容器 BCR 在 `.canvas` 的 zoom 空间内，所以先经 `layoutToViewportX/Y` 折到视觉再求交；自绘高亮层（富文本选区、代码块选区）在 zoom 空间内，量到的 BCR 差值须走 `layoutToCanvasCss` 才落到层内 CSS 长度。

## 图 10.2 canvasCoords 函数

```mermaid
flowchart LR
  A["CanvasTransform<br/>{zoom, origin, pan}"] --> B["contentToScreen(t, viewport, x, y)"]
  A --> C["screenToContent(t, viewport, x, y)"]
  A --> D["contentToVisual(t, x, y)"]
  E["roundToVisual(zoom, v)"] --> D
```

## 图 10.3 ComponentDataStore

```mermaid
flowchart LR
  A["urlOf(uuid, path)"] --> U["mdrfcd://笔记名/uuid/path"]
  U --> B["writeFile / readFile / readText"]
  U --> C["deleteFile / hasFile"]
  D["listFiles(uuid 或根 URL)"] --> E["归档 ComponentsData/uuid/"]
```

## 使用原则

- **编辑器内代码**：只用 `blockHandleUtils`，不要直接读 BCR 做换算
- **画布内代码**：只用 `canvasCoords`，不要自己拼公式
- **跨边界**：clientX/Y 是唯一共同的坐标空间

## 维护提示

- 新增换算函数 → 更新图 10.1 或 10.2
- 函数归类变化 → 更新对应图
