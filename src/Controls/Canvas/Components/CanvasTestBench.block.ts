import { mdiFlaskOutline } from '@mdi/js'

import { defineBlock } from '../Sdk/defineBlock.ts'
import type { TestBenchConfig } from '../Registry/canvasComponents.ts'
import { TEST_BENCH_CONSTRAINTS } from '../Registry/componentConstraints.ts'

export default defineBlock<TestBenchConfig>({
  key: 'CanvasTestBench',
  title: '测试台',
  icon: mdiFlaskOutline,
  addId: 'add-test',
  order: 40,
  constraints: TEST_BENCH_CONSTRAINTS,
  defaultConfig: () => ({ counter: 0, note: '', showViewport: true }),
  defaultSize: { w: 420, h: 360 },
  // 拖拽栏标题跟着配置走，用来目视确认 titleOf 生效
  titleOf: (config) => (config.note ? `测试台 · ${config.note}` : '测试台'),
})
