<!-- 最后验证: 2026-10-24 -->
# 画布块开发

一个块 = **两个同名文件 + 自动注册**。第一次写块从 [01 快速上手](01-quick-start.md) 开始。

## 文档导航

| 文档 | 什么时候看 |
| --- | --- |
| [01 快速上手](01-quick-start.md) | 第一次写块，照着抄 |
| [02 BlockContext](02-context.md) | 想知道块里能调什么 |
| [03 块定义](03-definition.md) | 写 `Xxx.block.ts` 时查字段 |
| [04 生命周期](04-lifecycle.md) | 搞清谁什么时候调你、视口外显示什么 |
| [05 设置面板](05-settings.md) | 要给块加设置项 |
| [06 私有文件](06-files.md) | 要存图片、附件、大文本 |
| [07 常见坑](07-pitfalls.md) | 卡住了、提交前自查 |

## 一个块的分层

```mermaid
flowchart TD
  MC["MdrCanvas<br/>布局 / 选中 / 拖拽 / 联结"] --> H["PluginBlockHost<br/>只 provide 上下文"]
  H --> C["你的组件"]
  C --> B["BlockShell<br/>= MdrCanvasComponentBase"]
  B --> S["content-area<br/>内容 / 视口外快照"]
```

- 画布只管布局、选中、拖拽、联结。
- `BlockShell` 管尺寸、手柄、拖拽栏、设置菜单、虚拟化。
- 你的组件只管内容和设置。

## 文件结构

```text
Components/
  TodoBlock.block.ts   定义：显示名、图标、默认尺寸、初始配置
  TodoBlock.vue        组件：根是 BlockShell
```

`Registry/canvasComponents.ts` 用 `import.meta.glob` 自动收集所有 `*.block.ts`，并按同名 `.vue`
懒加载组件——新增块不用改注册表。

## 最小示例

```vue
<template>
  <BlockShell>
    <div class="hello">{{ ctx.config.text }}</div>
  </BlockShell>
</template>

<script setup lang="ts">
import BlockShell from '../Sdk/BlockShell.vue'
import { useBlockContext } from '../Sdk/blockContext.ts'

const ctx = useBlockContext<{ text: string }>()
</script>
```

完整可跑版本（含定义文件与设置面板）见 [01 快速上手](01-quick-start.md)。

## 相关

- 画布流程与坐标：[../flow/README.md](../flow/README.md)
- 块 SDK 源码：`src/Controls/Canvas/Sdk/`
- 参考实现：`Components/CanvasTestBench.block.ts` + `CanvasTestBench.vue`
