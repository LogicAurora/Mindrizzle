import { mdiSitemapOutline } from '@mdi/js';

import { escapeHtml } from '../../../utils/escapeHtml.ts';
import type { MermaidBlockConfig } from '../Registry/canvasComponents.ts';
import { MERMAID_BLOCK_CONSTRAINTS } from '../Registry/componentConstraints.ts';
import { defineBlock } from '../Sdk/defineBlock.ts';

const SNAPSHOT_STYLE =
  'width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden';

export default defineBlock<MermaidBlockConfig>({
  key: 'MermaidBlock',
  title: 'Mermaid',
  description: '编辑并预览 Mermaid 图表',
  icon: mdiSitemapOutline,
  addId: 'add-mermaid',
  order: 25,
  constraints: MERMAID_BLOCK_CONSTRAINTS,
  defaultConfig: () => ({
    code: 'graph TD\n  A[开始] --> B[结束]',
  }),
  defaultSize: { w: 480, h: 320 },
  snapshot: (config, root) => {
    const svg = root?.querySelector('.mermaid-preview svg')?.outerHTML;
    if (svg) return `<div style="${SNAPSHOT_STYLE}">${svg}</div>`;
    return `<pre style="white-space:pre-wrap">${escapeHtml(String(config.code ?? ''))}</pre>`;
  },
});
