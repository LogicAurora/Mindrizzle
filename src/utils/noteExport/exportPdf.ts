// SPDX-License-Identifier: MIT
import { invoke, isTauri } from '@tauri-apps/api/core';

import { escapeHtml } from '../escapeHtml';
import type { ExportCanvasSnapshot } from './types';

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_MARGIN = 48;
const PAGE_FOOTER_HEIGHT = 24;
const CLIP_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const CLIP_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2 - PAGE_FOOTER_HEIGHT;
const PRINT_READY_DELAY_MS = 120;
const PRINT_CLEANUP_DELAY_MS = 60_000;

export const PDF_PREVIEW_CSS = `
.mdr-pdf-preview { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 20px; background: #e9edf3; }
html { color-scheme: light; }
.mdr-page { position: relative; width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px; background: #fff; box-shadow: 0 8px 26px rgba(15, 23, 42, 0.18); overflow: hidden; }
.mdr-page-theme { width: 100%; height: 100%; color-scheme: light; }
.mdr-page-clip { position: relative; width: ${CLIP_WIDTH}px; height: ${CLIP_HEIGHT}px; margin: ${PAGE_MARGIN}px; overflow: hidden; }
.mdr-page-stage { position: relative; width: ${CLIP_WIDTH}px; height: ${CLIP_HEIGHT}px; transform-origin: 0 0; }
.mdr-page-stage > .canvas { transform-origin: 0 0; }
.mdr-page-footer { position: absolute; left: ${PAGE_MARGIN}px; right: ${PAGE_MARGIN}px; bottom: 10px; display: flex; justify-content: space-between; color: #94a3b8; font-size: 11px; }
.mdr-print-root { display: none; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(.mdr-print-root) { display: none !important; }
  .mdr-print-root { display: block !important; }
  .mdr-page { width: 210mm !important; height: 297mm !important; box-shadow: none !important; break-after: page; page-break-after: always; }
  .mdr-page:last-child { break-after: auto; page-break-after: auto; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

let isCssInjected = false;

// 预览内容走 v-html，拿不到 scoped 属性，所以页面样式必须以全局样式注入
export function ensurePdfPreviewStyles(): void {
  if (isCssInjected) return;
  isCssInjected = true;
  const style = document.createElement('style');
  style.id = 'mdr-pdf-preview-styles';
  style.textContent = PDF_PREVIEW_CSS;
  document.head.appendChild(style);
}

export interface PdfPages {
  html: string;
  pageCount: number;
}

export function buildPdfPages(snapshot: ExportCanvasSnapshot, title: string): PdfPages {
  const contentWidth = Math.max(snapshot.bounds.width, 1);
  const contentHeight = Math.max(snapshot.bounds.height, 1);
  const scale = Math.min(1, CLIP_WIDTH / contentWidth);
  const pageContentHeight = CLIP_HEIGHT / scale;
  const pageCount = Math.max(1, Math.ceil(contentHeight / pageContentHeight));
  const centerX = (CLIP_WIDTH / scale - contentWidth) / 2 - snapshot.bounds.minX;
  const pages: string[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const offsetY = -snapshot.bounds.minY - index * pageContentHeight;
    pages.push(`<section class="mdr-page">
  <div class="mdr-page-theme v-application v-theme--light" data-vxe-ui-theme="light" style="${snapshot.themeVars}">
    <div class="mdr-page-clip">
      <div class="mdr-page-stage" style="transform: scale(${scale}) translate(${centerX}px, ${offsetY}px)">
        ${snapshot.html}
      </div>
    </div>
  </div>
  <footer class="mdr-page-footer"><span>${escapeHtml(title)}</span><span>第 ${index + 1} / ${pageCount} 页</span></footer>
</section>`);
  }

  return { pageCount, html: pages.join('') };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 打印根挂到 body：WebView 打印整页，靠 @media print 只留它
export async function printPdfPages(pagesHtml: string): Promise<void> {
  ensurePdfPreviewStyles();
  document.querySelectorAll('.mdr-print-root').forEach((stale) => stale.remove());
  const root = document.createElement('div');
  root.className = 'mdr-print-root';
  root.innerHTML = pagesHtml;
  document.body.appendChild(root);
  await wait(PRINT_READY_DELAY_MS);

  let isCleaned = false;
  const cleanup = () => {
    if (isCleaned) return;
    isCleaned = true;
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, PRINT_CLEANUP_DELAY_MS);

  if (isTauri()) {
    await invoke('print_main_webview');
    return;
  }
  window.print();
}
