import { mdiImageOutline } from '@mdi/js'

import { defineBlock } from '../Sdk/defineBlock.ts'
import type { ImageBlockConfig } from '../Registry/canvasComponents.ts'
import { IMAGE_BLOCK_CONSTRAINTS } from '../Registry/componentConstraints.ts'

export default defineBlock<ImageBlockConfig>({
  key: 'ImageBlock',
  title: '图片',
  icon: mdiImageOutline,
  addId: 'add-image',
  order: 30,
  constraints: IMAGE_BLOCK_CONSTRAINTS,
  defaultConfig: () => ({ path: '', mime: '', alt: '', fit: 'contain', autoSize: false }),
  defaultSize: { w: 360, h: 240 },
  // 移动端宽度锁在画布宽，块自己再放开会与堆叠布局冲突
  widthChangableOf: (config, env) => config.autoSize !== true && !env.isCompact,
  heightChangableOf: (config) => config.autoSize !== true,
})
