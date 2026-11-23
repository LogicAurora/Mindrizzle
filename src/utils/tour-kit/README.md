# Tour Kit 使用文档

`tour-kit` 是基于 Vuetify0 `useTour` 封装的轻量引导工具，放在项目 `src/utils/tour-kit/` 下，无需构建、无需发布。核心特点是**模板零侵入**：目标元素只需加 `id` 或 `class`，引导流程完全由数据描述；交互式引导通过 `isReady` 钩子自由编排。

---

## 目录

1. [文件结构](#1-文件结构)
2. [快速开始](#2-快速开始)
3. [步骤配置字段](#3-步骤配置字段)
4. [目标元素定位](#4-目标元素定位)
5. [交互式引导](#5-交互式引导)
6. [渲染层 `TourKitLayer`](#6-渲染层-tourkitlayer)
7. [API 参考](#7-api-参考)
8. [常见场景](#8-常见场景)
9. [边界与注意事项](#9-边界与注意事项)

---

## 1. 文件结构

```
src/utils/tour-kit/
├── index.ts              # 统一出口
├── useTourKit.ts         # 核心逻辑（类型 + resolveTarget + useTourKit）
└── TourKitLayer.vue      # 渲染层 + 默认样式
```

三个文件直接放入项目即可，无需在 `package.json` 中声明依赖（`vue` 和 `@vuetify/v0` 项目本身已有）。样式随 `TourKitLayer.vue` 的 `<style>` 一起被 Vite/Webpack 注入，**不需要单独引入 CSS 文件**。

---

## 2. 快速开始

### 2.1 在页面中定义引导

```vue
<script setup lang="ts">
import { useTourKit, TourKitLayer } from '@/utils/tour-kit';

const tour = useTourKit({
  steps: [
    {
      id: 'search',
      target: '#global-search',
      title: '全局搜索',
      content: '在这里搜索任何内容。',
      placement: 'bottom',
    },
    {
      id: 'settings',
      target: '.user-settings',
      title: '个人设置',
      content: '点击这里修改偏好。',
      placement: 'left',
    },
  ],
});
</script>

<template>
  <input id="global-search" placeholder="搜索..." />
  <v-btn class="user-settings">设置</v-btn>

  <button @click="tour.start()">开始引导</button>

  <TourKitLayer :tour="tour" />
</template>
```

### 2.2 三个关键点

**① 目标元素只加 `id` 或 `class`**，不需要包裹任何组件，模板结构保持不变。

**② `<TourKitLayer :tour="tour" />` 只挂载一次**，通常放在页面根组件的最外层。它负责渲染遮罩、高亮和所有步骤的卡片。

**③ 通过 `tour.start()` 启动**，可选传入 `{ stepId: 'xxx' }` 从指定步骤开始。

---

## 3. 步骤配置字段

每个步骤是一个 `TourStep` 对象，字段如下：

| 字段            | 类型                                                                    | 必填 | 默认值     | 说明                                            |
| :-------------- | :---------------------------------------------------------------------- | :--- | :--------- | :---------------------------------------------- |
| `id`            | `string`                                                                | ✅   | —          | 步骤唯一标识，同一引导内不可重复                |
| `target`        | `string \| (() => Element \| null) \| (() => Promise<Element \| null>)` | ❌   | —          | 目标元素定位；省略时卡片居中显示                |
| `title`         | `string`                                                                | ❌   | —          | 卡片标题                                        |
| `content`       | `string`                                                                | ❌   | —          | 卡片正文                                        |
| `placement`     | `'top' \| 'bottom' \| 'left' \| 'right' \| 'center'`                    | ❌   | `'bottom'` | 卡片相对目标的方位                              |
| `skipIfMissing` | `boolean`                                                               | ❌   | `true`     | 目标不存在时是否静默跳过该步骤                  |
| `scroll`        | `boolean`                                                               | ❌   | `true`     | 是否自动滚动目标进入视野                        |
| `isReady`       | `(ctx) => boolean \| Promise<boolean>`                                  | ❌   | —          | 自定义就绪判定，详见[交互式引导](#5-交互式引导) |

---

## 4. 目标元素定位

`target` 支持三种形式，按复杂度递进。

### 4.1 CSS 选择器（最常用）

```ts
{ id: 'search', target: '#global-search' }
{ id: 'settings', target: '.user-settings' }
{ id: 'avatar', target: '[data-tour="avatar"]' }
```

推荐使用 `data-tour` 属性，语义明确且不会和业务类名冲突：

```vue
<v-btn data-tour="settings">设置</v-btn>
```

```ts
{ id: 'settings', target: '[data-tour="settings"]' }
```

### 4.2 返回元素的函数

当目标需要动态计算时使用：

```ts
{
  id: 'save',
  target: () => document.querySelector('.dialog')?.querySelector('.save-btn') ?? null,
}
```

### 4.3 返回 Promise 的函数

当目标依赖异步数据时使用：

```ts
{
  id: 'result',
  target: () => fetchResultElement(), // 返回 Promise<Element | null>
}
```

### 4.4 懒加载/弹窗目标的自动等待

当 `target` 是选择器且元素尚未渲染时，`tour-kit` 会**自动短时轮询**（默认 1.5 秒，每 80ms 一次），等待元素出现后再激活。这覆盖了大部分弹窗、Tab 切换、懒加载组件的场景，通常不需要手写异步函数。

如果 1.5 秒内元素仍未出现：

- `skipIfMissing` 为 `true`（默认）：跳过该步骤，自动前进到下一步；
- `skipIfMissing` 为 `false`：停留在当前步骤，卡片显示但“下一步”禁用。

---

## 5. 交互式引导

### 5.1 核心概念

默认情况下，步骤激活后“下一步”立即可点。**当步骤配置了 `isReady` 时，步骤会先进入“未就绪”状态**：“下一步”按钮禁用，`tour.next()` 为空操作，直到 `isReady` 返回 `true`。

```ts
{
  id: 'open-menu',
  target: '#menu-trigger',
  title: '打开菜单',
  content: '请点击这个按钮打开菜单。',
  isReady: () => waitForClick('#menu-trigger'), // 用户点击后才返回 true
}
```

### 5.2 `isReady` 的签名

```ts
isReady?: (ctx: {
  tour: TourKitReturn   // 可调用 tour.step()、tour.stop()、tour._registerCleanup() 等
  visit: number         // 本次进入的计数器，用于安全调用 tour.ready()
}) => boolean | Promise<boolean>
```

- 返回 `true` 或 resolve 为 `true`：步骤就绪，“下一步”解锁；
- 返回 `false` 或 resolve 为 `false`：步骤保持未就绪；
- 抛出异常或 Promise reject：记录警告并**自动放行**，避免用户卡死。

### 5.3 模式一：等待用户点击

```ts
{
  id: 'open-menu',
  target: '#menu-trigger',
  isReady: ({ tour }) =>
    new Promise<boolean>((resolve) => {
      const controller = new AbortController()
      document.querySelector('#menu-trigger')?.addEventListener(
        'click',
        () => {
          controller.abort()
          resolve(true)
        },
        { signal: controller.signal }
      )
      tour._registerCleanup(() => {
        controller.abort()
        resolve(false)
      })
    }),
}
```

`AbortController` 让监听器在用户提前 `stop()` 引导时被自动清理，不会残留。

### 5.4 模式二：多条件组合

```ts
{
  id: 'advanced',
  target: '#config-panel',
  isReady: async () => {
    // 条件一：开关打开
    const toggled = await waitForCondition(
      () => document.querySelector('#advanced-toggle')?.getAttribute('aria-checked') === 'true',
      10000
    )
    if (!toggled) return false

    // 条件二：至少选一项
    const selected = await waitForCondition(
      () => document.querySelectorAll('.option-list .selected').length >= 1,
      10000
    )
    if (!selected) return false

    // 条件三：远程校验通过
    const res = await fetch('/api/validate-config')
    return res.ok
  },
}
```

`waitForCondition` 是调用方自己写的工具函数，例如：

```ts
function waitForCondition(fn: () => boolean, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (fn()) return resolve(true);
    const start = Date.now();
    const timer = setInterval(() => {
      if (fn()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - start >= timeout) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}
```

### 5.5 模式三：异步校验

```ts
{
  id: 'api-key',
  target: '#api-key-input',
  isReady: async () => {
    const key = (document.querySelector('#api-key-input input') as HTMLInputElement)?.value
    if (!key) return false
    const res = await fetch('/api/validate-key', {
      method: 'POST',
      body: JSON.stringify({ key }),
    })
    return res.ok
  },
}
```

### 5.6 模式四：状态机驱动

当交互涉及条件分支时，可以订阅外部状态机：

```ts
import { createMachine, interpret } from 'xstate'

const service = interpret(machine).start()

{
  id: 'branch-step',
  isReady: ({ tour }) =>
    new Promise<boolean>((resolve) => {
      const sub = service.subscribe((state) => {
        if (state.matches('done')) {
          sub.unsubscribe()
          resolve(true)
        }
      })
      tour._registerCleanup(() => {
        sub.unsubscribe()
        resolve(false)
      })
    }),
}
```

### 5.7 模式五：条件分支跳转

如果用户的交互决定了后续走向，可以在 `isReady` 中根据结果跳转。注意 **`tour.step(n)` 在未就绪时是空操作**，所以正确的做法是：`isReady` resolve 后，在外部监听或后续逻辑中跳转；或者更简单——让 `isReady` 先返回 `true`，让 Tour 进入下一步，然后在该步骤的 `isReady` 里判断并 `tour.step()` 跳转：

```ts
{
  id: 'plan-choice',
  target: '.plan-cards',
  isReady: async ({ tour }) => {
    const choice = await waitForPlanChoice()
    if (!choice) return false

    // 先就绪，让 Tour 有机会处理跳转
    setTimeout(() => {
      if (choice === 'pro') tour.step(4)
      else tour.step(2)
    }, 0)

    return true
  },
}
```

### 5.8 超时保护

复杂交互可能因为用户长时间不操作而卡死。建议在 `isReady` 内自行加超时：

```ts
isReady: () =>
  Promise.race([
    waitForClick('#trigger'),
    new Promise<boolean>((r) => setTimeout(() => r(true), 15000)), // 15s 后放行
  ]);
```

---

## 6. 渲染层 `TourKitLayer`

### 6.1 Props

| Prop       | 类型            | 默认值  | 说明                                           |
| :--------- | :-------------- | :------ | :--------------------------------------------- |
| `tour`     | `TourKitReturn` | 必填    | `useTourKit()` 的返回值                        |
| `blocking` | `boolean`       | `false` | 是否阻断背景区域的点击；不影响目标挖孔内的交互 |

### 6.2 `blocking` 的含义

Vuetify0 的 `Tour.Highlight` 在 `blocking=false`（默认）时：

- **背景区域**：不可点击（吞掉点击）；
- **目标挖孔**：可点击（用户能与目标元素交互）。

交互式引导**保持默认 `false` 即可**，用户既能点击目标完成交互，又不会误触背景。

如果产品要求“背景完全不可点”，设为 `blocking=true`，但目标挖孔内的点击仍会被 `Tour.Highlight` 放行，交互式步骤不受影响。

### 6.3 自定义卡片 UI

`TourKitLayer` 内置了带 Vuetify 主题变量的卡片样式。如需完全自定义，可以直接复制组件并替换 `<style>` 和模板中的 `.tour-kit-card` 部分，`useTourKit` 不受影响。

---

## 7. API 参考

### 7.1 `useTourKit(options)`

接收 `{ steps: TourStep[] }`，返回 `TourKitReturn`。

### 7.2 `TourKitReturn` 字段

| 字段                   | 类型                                      | 说明                                                                        |
| :--------------------- | :---------------------------------------- | :-------------------------------------------------------------------------- |
| `start(opts?)`         | `(opts?: { stepId?: string }) => void`    | 启动引导；`stepId` 指定从哪一步开始                                         |
| `next()`               | `() => void`                              | 下一步；未就绪时为空操作                                                    |
| `prev()`               | `() => void`                              | 上一步；未就绪或已在第一步时为空操作                                        |
| `stop()`               | `() => void`                              | 停止引导，**并执行所有 `_registerCleanup` 注册的清理函数**                  |
| `complete()`           | `() => void`                              | 完成引导（通常用于最后一步的“完成”按钮）                                    |
| `reset()`              | `() => void`                              | 重置引导状态，可再次 `start()`                                              |
| `step(n)`              | `(n: number) => void`                     | 跳转到第 n 步（**1 开始计数**）；未就绪时为空操作                           |
| `ready(stepId, visit)` | `(stepId: string, visit: number) => void` | 手动将步骤标记为就绪；**仅供高级场景使用**，封装层已在 `isReady` 中自动调用 |
| `onComplete(fn)`       | `(fn: () => void) => () => void`          | 订阅“完成”；同一轮至多触发一次，返回取消订阅函数                            |
| `onExit(fn)`           | `(fn: () => void) => () => void`          | 订阅“退出”（跳过 / Esc / `stop()`）；与 `onComplete` 互斥                   |
| `state.*`              | 多个 `Readonly<Ref<T>>`                   | 响应式状态，见下表                                                          |
| `_tour`                | —                                         | 内部 tour 实例，**业务代码不应依赖**                                        |
| `_steps`               | `TourStep[]`                              | 原始步骤配置，**业务代码不应依赖**                                          |
| `_registerCleanup(fn)` | `(fn: () => void) => void`                | 注册副作用清理函数，`stop()` 时统一执行                                     |

### 7.3 `state` 字段

| 字段        | 类型                     | 说明                               |
| :---------- | :----------------------- | :--------------------------------- |
| `isActive`  | `Readonly<Ref<boolean>>` | 引导是否激活中                     |
| `isReady`   | `Readonly<Ref<boolean>>` | 当前步骤是否已就绪                 |
| `isFirst`   | `Readonly<Ref<boolean>>` | 是否第一步                         |
| `isLast`    | `Readonly<Ref<boolean>>` | 是否最后一步                       |
| `canGoNext` | `Readonly<Ref<boolean>>` | 是否可以前进（未就绪时为 `false`） |
| `canGoBack` | `Readonly<Ref<boolean>>` | 是否可以后退                       |
| `total`     | `number`                 | 总步骤数（**不是 ref，直接访问**） |

在模板中访问 ref 类字段需要 `.value`：

```vue
<span>{{ tour.state.canGoNext.value ? '可以继续' : '请先完成操作' }}</span>
<span>共 {{ tour.state.total }} 步</span>
```

---

## 8. 常见场景

### 8.1 只在首次访问时显示引导

用 `localStorage` 记录。**注意底层 `createTour()` 没有完成钩子**，必须订阅封装层的 `onComplete` / `onExit`；直接调 `_tour.complete()` 或 `_tour.stop()` 会绕过它们：

```ts
import { onMounted } from 'vue';

const markDone = () => localStorage.setItem('tour-onboarded', '1');

onMounted(() => {
  tour.onComplete(markDone);
  tour.onExit(markDone); // 跳过 / Esc 也算看过，否则每次启动都会重弹
  if (!localStorage.getItem('tour-onboarded')) tour.start();
});
```

### 8.2 分页/多页面引导

`steps` 可以跨页面配置，只要目标选择器在引导运行时能找到即可：

```ts
const tour = useTourKit({
  steps: [
    { id: 'home', target: '#home-banner', title: '首页' },
    { id: 'list', target: '#list-container', title: '列表页' },
    { id: 'detail', target: '#detail-panel', title: '详情页' },
  ],
});
```

跨页面时建议配合路由守卫，在步骤切换时先导航再激活。更简单的做法是：**在目标页面挂载时手动 `tour.step(n)`** 跳转到对应步骤。

### 8.3 目标在弹窗中

由于 `target` 支持自动等待，弹窗内的目标可以直接写选择器：

```ts
{
  id: 'dialog-save',
  target: '.my-dialog .save-btn',
  isReady: () => waitForClick('.my-dialog .save-btn'),
}
```

只要弹窗在 1.5 秒内渲染完成，自动轮询会找到它。如果弹窗打开更慢，把 `target` 写成函数形式手动等待：

```ts
target: async () => {
  await waitForSelector('.my-dialog .save-btn', 5000);
  return document.querySelector('.my-dialog .save-btn');
};
```

### 8.4 跳过某些步骤

在 `start()` 前过滤 `steps` 数组（推荐）：

```ts
const steps = allSteps.filter((s) => userHasPermission(s.id));
const tour = useTourKit({ steps });
```

比运行时依赖 `skipIfMissing` 更清晰，也避免创建无用的 `Tour.Root`。

### 8.5 显示进度

```vue
<div class="tour-kit-progress">
  {{ tour.state.isFirst.value ? '第 1 步' : '进行中' }} / 共 {{ tour.state.total }} 步
</div>
```

---

## 9. 边界与注意事项

### 9.1 `visit` 的配对安全

`tour.ready(stepId, visit)` 只在 `visit` 仍是当前值时才生效。在 `isReady` 的异步回调中，**必须使用 `ctx.visit` 传入的那个值**，不要重新获取。这保证了即使用户在异步等待中 `stop()` 后重新 `start()`，旧回调也不会误推进新实例。

封装层已经在 `enter` 中自动处理这一点，业务代码通常不需要手动调用 `ready`。

### 9.2 `isReady` 异常会被放行

如果 `isReady` 抛出异常或 Promise reject，`tour-kit` 会**记录一条 `console.warn` 并将步骤标记为就绪**。这是为了避免用户因为一个意外的网络错误或代码 bug 而永久卡在引导中。如果需要严格行为，请在 `isReady` 内部自行 `try/catch` 并返回 `false`。

### 9.3 清理函数必须注册

任何在 `isReady` 中挂起的监听器、定时器、订阅，**都应当通过 `tour._registerCleanup()` 注册清理函数**。否则用户提前 `stop()` 时会产生残留。推荐用 `AbortController` 统一管理：

```ts
const controller = new AbortController();
el.addEventListener('click', handler, { signal: controller.signal });
setTimeout(fn, 1000); // 用 setTimeout 时手动 clearTimeout
tour._registerCleanup(() => {
  controller.abort();
  // clearTimeout(timerId)
});
```

### 9.4 `blocking` 与交互

`blocking` 只影响背景，不影响目标挖孔内的点击。交互式引导**不需要关闭 `blocking`**，默认 `false` 已经允许点击目标。

### 9.5 目标元素不存在时的行为

- `skipIfMissing` 为 `true`（默认）：跳过该步骤，自动前进；
- `skipIfMissing` 为 `false`：停留在当前步骤，卡片显示但“下一步”禁用。

如果一组步骤中有多个可能不存在，建议在 `start()` 前预过滤 `steps` 数组，避免运行时多次跳过带来的视觉闪烁。

### 9.6 步骤数量与性能

每个步骤都会渲染一个 `Tour.Root`（即使未激活时也不渲染卡片）。步骤数量在合理范围内（通常 < 20）不会带来性能问题。如果步骤非常多，建议按页面拆分引导，而不是把所有步骤塞进一个 `useTourKit`。

### 9.7 Vuetify0 版本兼容

`createTour`、`Tour.Highlight`、`Tour.Keyboard`、`Tour.Root`、`Tour.Content` 的导入路径和 API 在 Vuetify0 早期版本中可能有微调。如果升级 `@vuetify/v0` 后引导异常，**只需检查 `useTourKit.ts` 和 `TourKitLayer.vue` 顶部的 import 两行**，业务代码不受影响。

---

## 附录：完整最小示例

```vue
<script setup lang="ts">
import { useTourKit, TourKitLayer } from '@/utils/tour-kit';

const tour = useTourKit({
  steps: [
    {
      id: 'search',
      target: '#global-search',
      title: '全局搜索',
      content: '在这里搜索任何内容。',
      placement: 'bottom',
    },
    {
      id: 'settings',
      target: '.user-settings',
      title: '个人设置',
      content: '点击这里修改偏好。',
      placement: 'left',
    },
    {
      id: 'save',
      target: '.save-btn',
      title: '保存配置',
      content: '修改完成后点击保存。',
      isReady: () =>
        new Promise<boolean>((resolve) => {
          const controller = new AbortController();
          document.querySelector('.save-btn')?.addEventListener(
            'click',
            () => {
              controller.abort();
              resolve(true);
            },
            { signal: controller.signal },
          );
          tour._registerCleanup(() => {
            controller.abort();
            resolve(false);
          });
        }),
    },
  ],
});
</script>

<template>
  <input id="global-search" placeholder="搜索..." />
  <v-btn class="user-settings">设置</v-btn>
  <v-btn class="save-btn">保存</v-btn>

  <button @click="tour.start()">开始引导</button>

  <TourKitLayer :tour="tour" />
</template>
```
