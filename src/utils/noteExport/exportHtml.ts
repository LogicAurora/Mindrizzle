// SPDX-License-Identifier: MIT
import { escapeHtml } from '../escapeHtml';
import type { ExportCanvasSnapshot } from './types';

const FONT_STACK =
  '"Noto Sans SC", system-ui, -apple-system, "Segoe UI", Roboto, "Microsoft YaHei", "PingFang SC", sans-serif';

const VIEWER_CSS = `
html { color-scheme: light; }
html, body { margin: 0; padding: 0; height: 100%; background: #eef1f5; }
body { overflow: hidden; background: #eef1f5; color: #1f2937; font-family: ${FONT_STACK}; }
.mdr-viewer { position: fixed; inset: 0; color-scheme: light; display: flex; flex-direction: column; background: #eef1f5; font-family: ${FONT_STACK}; }
.mdr-bar { position: relative; z-index: 10; display: flex; align-items: center; gap: 12px; height: 54px; padding: 0 16px; background: rgba(255, 255, 255, 0.92); border-bottom: 1px solid rgba(15, 23, 42, 0.08); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); backdrop-filter: blur(10px); }
.mdr-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 600; }
.mdr-badge { flex: none; padding: 2px 8px; border-radius: 999px; background: rgba(15, 23, 42, 0.06); color: #64748b; font-size: 12px; }
.mdr-tools { display: flex; align-items: center; gap: 6px; }
.mdr-btn { display: inline-flex; align-items: center; justify-content: center; height: 32px; min-width: 32px; padding: 0 10px; border: 1px solid rgba(15, 23, 42, 0.14); border-radius: 8px; background: #fff; color: #334155; font: inherit; font-size: 13px; cursor: pointer; user-select: none; }
.mdr-btn:hover { background: #f1f5f9; }
.mdr-btn:active { background: #e2e8f0; }
.mdr-zoom { min-width: 54px; text-align: center; font-variant-numeric: tabular-nums; color: #475569; font-size: 13px; }
.mdr-viewport { position: relative; flex: 1; min-height: 0; overflow: hidden; cursor: grab; touch-action: none; background-color: #eef1f5; background-image: radial-gradient(circle, rgba(15, 23, 42, 0.12) 1px, transparent 1px); background-repeat: repeat; }
.mdr-viewport.is-panning { cursor: grabbing; }
.mdr-stage { position: absolute; inset: 0; }
.mdr-stage > .canvas { transform-origin: 0 0; }
.mdr-hints { position: fixed; left: 16px; bottom: 16px; z-index: 20; width: 268px; padding: 14px 16px 12px; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 12px; background: rgba(255, 255, 255, 0.97); box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16); font-size: 13px; line-height: 1.7; }
.mdr-hints[hidden] { display: none; }
.mdr-hints h2 { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #0f172a; }
.mdr-hints ul { margin: 0; padding: 0; list-style: none; color: #475569; }
.mdr-hints kbd { display: inline-block; min-width: 18px; padding: 0 5px; border: 1px solid rgba(15, 23, 42, 0.18); border-bottom-width: 2px; border-radius: 5px; background: #f8fafc; color: #334155; font: inherit; font-size: 12px; text-align: center; }
.mdr-hints-close { position: absolute; top: 6px; right: 8px; border: 0; background: transparent; color: #94a3b8; font-size: 18px; line-height: 1; cursor: pointer; }
.mdr-hints-close:hover { color: #475569; }
.mdr-tip { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.mdr-toast { padding: 10px 16px; border-radius: 10px; background: rgba(15, 23, 42, 0.82); color: #fff; font-size: 13px; opacity: 0; transform: translateY(8px); transition: opacity 0.2s ease, transform 0.2s ease; }
.mdr-toast.show { opacity: 1; transform: none; }
@media print { .mdr-bar, .mdr-hints, .mdr-toast { display: none !important; } }
`;

const VIEWER_SCRIPT = `
(function () {
  var bounds = __BOUNDS__;
  var viewport = document.getElementById('mdr-viewport');
  var stage = viewport.querySelector('.canvas');
  var zoomLabel = document.getElementById('mdr-zoom');
  var hints = document.getElementById('mdr-hints');
  var toast = document.getElementById('mdr-toast');
  var MIN_ZOOM = 0.1;
  var MAX_ZOOM = 4;
  var state = { zoom: 1, panX: 0, panY: 0 };

  function clamp(value) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  }

  function apply() {
    stage.style.zoom = state.zoom;
    stage.style.transform =
      'translate(' + state.panX / state.zoom + 'px,' + state.panY / state.zoom + 'px)';
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    viewport.style.backgroundSize =
      24 * state.zoom + 'px ' + 24 * state.zoom + 'px';
    viewport.style.backgroundPosition = state.panX + 'px ' + state.panY + 'px';
  }

  function fit() {
    var width = viewport.clientWidth;
    var height = viewport.clientHeight;
    var margin = 48;
    var contentWidth = Math.max(bounds.width, 1);
    var contentHeight = Math.max(bounds.height, 1);
    // 只按宽度适配：矮窗口里按高度缩会小到看不清，纵向可用拖动浏览
    var zoom = clamp(Math.min((width - margin * 2) / contentWidth, 1.2));
    state.zoom = zoom;
    state.panX =
      margin + (width - margin * 2 - contentWidth * zoom) / 2 - bounds.minX * zoom;
    state.panY =
      margin + (height - margin * 2 - contentHeight * zoom) / 2 - bounds.minY * zoom;
    if (contentHeight * zoom > height - margin * 2) {
      state.panY = margin - bounds.minY * zoom;
    }
    apply();
  }

  function zoomAt(clientX, clientY, factor) {
    var rect = viewport.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    var contentX = (x - state.panX) / state.zoom;
    var contentY = (y - state.panY) / state.zoom;
    state.zoom = clamp(state.zoom * factor);
    state.panX = x - contentX * state.zoom;
    state.panY = y - contentY * state.zoom;
    apply();
  }

  var pointers = new Map();
  var drag = null;
  var pinch = null;

  function pinchInfo() {
    var values = Array.from(pointers.values());
    var dx = values[0].x - values[1].x;
    var dy = values[0].y - values[1].y;
    return {
      distance: Math.hypot(dx, dy),
      x: (values[0].x + values[1].x) / 2,
      y: (values[0].y + values[1].y) / 2,
    };
  }

  viewport.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      drag = { x: event.clientX, y: event.clientY };
      viewport.classList.add('is-panning');
    } else if (pointers.size === 2) {
      drag = null;
      pinch = pinchInfo();
    }
  });

  viewport.addEventListener('pointermove', function (event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      var info = pinchInfo();
      if (pinch && pinch.distance > 0) {
        zoomAt(info.x, info.y, info.distance / pinch.distance);
      }
      pinch = info;
      return;
    }
    if (!drag) return;
    state.panX += event.clientX - drag.x;
    state.panY += event.clientY - drag.y;
    drag = { x: event.clientX, y: event.clientY };
    apply();
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) {
      drag = null;
      pinch = null;
      viewport.classList.remove('is-panning');
    } else if (pointers.size === 1) {
      var only = Array.from(pointers.values())[0];
      drag = { x: only.x, y: only.y };
      pinch = null;
    }
  }

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  viewport.addEventListener(
    'wheel',
    function (event) {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
    },
    { passive: false }
  );

  viewport.addEventListener('dblclick', fit);

  document.addEventListener('click', function (event) {
    var action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'zoom-in') {
      var rect = viewport.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
    } else if (action.dataset.action === 'zoom-out') {
      var rect2 = viewport.getBoundingClientRect();
      zoomAt(rect2.left + rect2.width / 2, rect2.top + rect2.height / 2, 1 / 1.2);
    } else if (action.dataset.action === 'fit') {
      fit();
    } else if (action.dataset.action === 'hint') {
      hints.hidden = !hints.hidden;
    }
  });

  document.getElementById('mdr-hints-close').addEventListener('click', function () {
    hints.hidden = true;
  });

  window.addEventListener('keydown', function (event) {
    var target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    var rect = viewport.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var step = event.shiftKey ? 160 : 48;
    if (event.key === '+' || event.key === '=') zoomAt(cx, cy, 1.2);
    else if (event.key === '-' || event.key === '_') zoomAt(cx, cy, 1 / 1.2);
    else if (event.key === '0') fit();
    else if (event.key === 'ArrowLeft') { state.panX += step; apply(); }
    else if (event.key === 'ArrowRight') { state.panX -= step; apply(); }
    else if (event.key === 'ArrowUp') { state.panY += step; apply(); }
    else if (event.key === 'ArrowDown') { state.panY -= step; apply(); }
    else return;
    event.preventDefault();
  });

  var toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 3200);
  }

  window.addEventListener('resize', function () {
    apply();
  });

  fit();
  showToast('拖动平移 · 滚轮缩放 · 按 0 回到全览');
})();
`;

export interface HtmlExportOptions {
  title: string;
  appCss: string;
  snapshot: ExportCanvasSnapshot;
}

const guardStyleText = (text: string): string => text.replace(/<\/style/gi, '<\\/style');

export function buildHtmlDocument({ title, appCss, snapshot }: HtmlExportOptions): string {
  const safeTitle = escapeHtml(title);
  const boundsJson = JSON.stringify({
    minX: snapshot.bounds.minX,
    minY: snapshot.bounds.minY,
    width: snapshot.bounds.width,
    height: snapshot.bounds.height,
  }).replace(/</g, '\\u003c');
  const script = VIEWER_SCRIPT.replace('__BOUNDS__', boundsJson);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>${guardStyleText(appCss)}</style>
<style>${guardStyleText(VIEWER_CSS)}</style>
</head>
<body>
<div class="mdr-viewer mdr-export-root v-application v-theme--light" data-vxe-ui-theme="light" style="${snapshot.themeVars}">
  <header class="mdr-bar">
    <div class="mdr-title" title="${safeTitle}">${safeTitle}</div>
    <span class="mdr-badge">只读</span>
    <div class="mdr-tools">
      <button type="button" class="mdr-btn" data-action="zoom-out" title="缩小（-）">−</button>
      <span class="mdr-zoom" id="mdr-zoom">100%</span>
      <button type="button" class="mdr-btn" data-action="zoom-in" title="放大（+）">＋</button>
      <button type="button" class="mdr-btn" data-action="fit" title="适应窗口（0）">适应</button>
      <button type="button" class="mdr-btn" data-action="hint" title="操作提示">?</button>
    </div>
  </header>
  <main class="mdr-viewport" id="mdr-viewport">
    <div class="mdr-stage">${snapshot.html}</div>
  </main>
  <aside class="mdr-hints" id="mdr-hints">
    <button type="button" class="mdr-hints-close" id="mdr-hints-close" title="关闭提示">×</button>
    <h2>操作提示</h2>
    <ul>
      <li>拖动空白处平移画布</li>
      <li>滚轮或双指缩放</li>
      <li><kbd>+</kbd> / <kbd>-</kbd> 缩放，<kbd>0</kbd> 适应窗口</li>
      <li>方向键微移，按住 Shift 加速</li>
      <li>双击画布恢复全览</li>
    </ul>
  </aside>
  <div class="mdr-tip"><div class="mdr-toast" id="mdr-toast"></div></div>
</div>
<script>${script.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}
