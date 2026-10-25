<!-- 最后验证: 2026-10-24 -->
# 03 块定义

每个块在 `Components/` 下有一个同名定义文件 `Xxx.block.ts`，默认导出一个 `defineBlock({...})`。

`Registry/canvasComponents.ts` 用 `import.meta.glob('../Components/**/*.block.ts', { eager: true })`
收集全部定义，并按同名 `.vue` 懒加载组件。**新增块不需要改注册表。**

## 字段

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `key` | 是 | 持久化在 `.mdrf` 中，不能随意改 |
| `title` / `icon` / `addId` | 是 | 添加菜单文案、图标与 DOM id |
| `order` | 否 | 添加菜单顺序，缺省 0 |
| `defaultConfig` / `defaultSize` | 是 | 新块初始配置与尺寸 |
| `constraints` | 否 | 尺寸约束，缺省走画布默认值 |
| `titleOf` / `iconOf` | 否 | 按 config 动态取标题/图标 |
| `widthChangableOf` / `heightChangableOf` | 否 | `(config, env) => boolean`，`env` 含 `isCompact` / `isReadOnly` |
| `snapshot` | 否 | 视口外显示什么，默认 `'html'`，见 [04 生命周期](04-lifecycle.md) |
| `embed` | 否 | 块 ↔ 富文本双向映射 |

## 尺寸约束

```ts
import { MY_CONSTRAINTS } from '../Registry/componentConstraints.ts'

defineBlock({
  constraints: { minWidth: 260, maxWidth: null, minHeight: 220, maxHeight: null },
})
```

`null` 表示该方向无上限，不写则用画布默认值。

## 尺寸可变性

由 config 推导；`false` 时对应方向的手柄会收掉，联结传播也不改该轴。

```ts
// 自动高度模式：高度随内容走，不能被联结改
heightChangableOf: (config) => config.autoHeight !== true,
// 移动端宽度锁在画布宽
widthChangableOf: (config, env) => !env.isCompact,
```

## 动态标题与图标

```ts
titleOf: (config) => (config.note ? `探针 · ${config.note}` : '探针'),
iconOf: (config) => (config.kind === 'alert' ? mdiAlert : mdiNote),
```

不写就用静态的 `title` / `icon`。

## 进富文本

声明 `embed` 后，块能拖进富文本、富文本里的同类节点也能拖出来成块：

```ts
embed: {
  nodeName: 'CodeBlock',
  toProps: (config) => ({ modelValue: config.code, language: config.language }),
  fromProps: (props) => ({
    code: (props.modelValue as string) ?? '',
    language: (props.language as string) ?? 'javascript',
  }),
}
```

`nodeName` 是 ProseMirror 节点名；组件复用同一个 `.vue`，不用另写组件映射。

## 配置类型

写在 `Registry/canvasComponents.ts`，供定义与组件共用：

```ts
export type TodoConfig = WidgetConfig & {
  items: { text: string; done: boolean }[]
}
```

`config` 只放可 JSON 序列化的小数据；图片、附件、大文本走 [06 私有文件](06-files.md)。
