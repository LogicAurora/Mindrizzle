// SPDX-License-Identifier: MIT
const INTERACTIVE_SELECTORS = [
  '.floating-handle',
  '.side-settings',
  '.handle',
  '.selection-box',
  '.selected-outline',
  '.selected-outline-union',
  '.rich-text-drop-target',
  '.row-drop-indicator',
  '.canvas-floating-layer',
  '.annotation-catcher',
  '.component-settings-menu',
  '.block-handle-popup',
  '.mdr-export-ignore',
].join(',');

const BLOB_URL_PATTERN = /url\((['"]?)(blob:[^)'"]+)\1\)/g;
const ASSET_ATTRIBUTES = ['src', 'href', 'poster'] as const;
// vxe 表格的悬停/当前行/勾选态是交互残留，导出时会变成一块深色行
const TRANSIENT_CLASSES = [
  'row--hover',
  'row--current',
  'is--checked',
  'is--selected',
  'is--active',
  'col--checked',
  'col--selected',
];
const TRANSIENT_ELEMENTS = [
  '.vxe-table--checkbox-range',
  '.vxe-table--resizable-number-tip',
  '.vxe-table--tooltip-wrapper',
].join(',');

// 选中样式与浮层只是编辑态辅助，导出后会变成脏元素
export function stripInteractiveLayers(root: HTMLElement): void {
  root.querySelectorAll(INTERACTIVE_SELECTORS).forEach((element) => element.remove());
  root.querySelectorAll('script').forEach((element) => element.remove());
  root.classList.remove('panning');
  root.removeAttribute('data-layout-version');
  root.removeAttribute('style');

  root.querySelectorAll<HTMLElement>('[contenteditable]').forEach((element) => {
    element.removeAttribute('contenteditable');
  });
  root.querySelectorAll<HTMLElement>('[tabindex]').forEach((element) => {
    element.removeAttribute('tabindex');
  });
  root.querySelectorAll<HTMLElement>('.drag-wrapper').forEach((element) => {
    element.classList.remove('selected', 'popup-open', 'drag-passthrough');
  });
  // v-sheet 会把当前主题类写到自己身上，留着会把浅色导出重新拉回深色
  root.querySelectorAll<HTMLElement>('.v-theme--dark, .v-theme--light').forEach((element) => {
    element.classList.remove('v-theme--dark', 'v-theme--light');
  });
  root.querySelectorAll<HTMLElement>('[class]').forEach((element) => {
    element.classList.remove(...TRANSIENT_CLASSES);
  });
  root.querySelectorAll(TRANSIENT_ELEMENTS).forEach((element) => element.remove());
  root.querySelectorAll<HTMLInputElement>('input').forEach((element) => {
    if (element.type === 'file') {
      element.remove();
      return;
    }
    element.readOnly = true;
  });
  root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((element) => {
    element.readOnly = true;
  });
}

// input.value 是属性而非特性，cloneNode 只复制特性，表格与任务块的已输入内容会丢
export function syncFormState(source: HTMLElement, clone: HTMLElement): void {
  const sources = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  );
  const clones = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  sources.forEach((element, index) => {
    const target = clones[index];
    if (!target) return;
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      if (element.checked) target.setAttribute('checked', 'checked');
      else target.removeAttribute('checked');
      return;
    }
    if (element instanceof HTMLTextAreaElement) {
      target.textContent = element.value;
      return;
    }
    target.setAttribute('value', element.value);
  });
}

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取资源失败'));
    reader.readAsDataURL(blob);
  });

// blob: 地址只存在于当前页面，导出文件里必须转成内联 data URL
async function inlineBlobUrl(url: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(url);
  if (cached) return cached;
  try {
    const response = await fetch(url);
    const dataUrl = await readAsDataUrl(await response.blob());
    cache.set(url, dataUrl);
    return dataUrl;
  } catch {
    // 忽略：资源已失效时保留原地址，不影响其余内容导出
    return url;
  }
}

export async function inlineBlobAssets(root: HTMLElement): Promise<void> {
  const cache = new Map<string, string>();
  const urls = new Set<string>();
  ASSET_ATTRIBUTES.forEach((attribute) => {
    root.querySelectorAll<HTMLElement>(`[${attribute}^="blob:"]`).forEach((element) => {
      const value = element.getAttribute(attribute);
      if (value) urls.add(value);
    });
  });
  root.querySelectorAll<HTMLElement>('[style*="blob:"]').forEach((element) => {
    for (const match of (element.getAttribute('style') ?? '').matchAll(BLOB_URL_PATTERN)) {
      urls.add(match[2]);
    }
  });

  await Promise.all(Array.from(urls, (url) => inlineBlobUrl(url, cache)));
  if (cache.size === 0) return;

  ASSET_ATTRIBUTES.forEach((attribute) => {
    root.querySelectorAll<HTMLElement>(`[${attribute}^="blob:"]`).forEach((element) => {
      const replaced = cache.get(element.getAttribute(attribute) ?? '');
      if (replaced) element.setAttribute(attribute, replaced);
    });
  });
  root.querySelectorAll<HTMLElement>('[style*="blob:"]').forEach((element) => {
    const replaced = (element.getAttribute('style') ?? '').replace(
      BLOB_URL_PATTERN,
      (_match, quote: string, url: string) => `url(${quote}${cache.get(url) ?? url}${quote})`,
    );
    element.setAttribute('style', replaced);
  });
}

const skipRule = (rule: CSSRule): boolean => {
  if (rule instanceof CSSFontFaceRule) return true;
  const text = rule.cssText;
  return text.includes('/@fs/') || text.includes('/node_modules/');
};

function collectRules(rules: CSSRuleList, chunks: string[]): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSImportRule) {
      try {
        if (rule.styleSheet) collectRules(rule.styleSheet.cssRules, chunks);
      } catch {
        // 忽略：跨域 @import 展开失败，继续导出其余样式
      }
      continue;
    }
    if (rule.cssText.startsWith('@charset') || skipRule(rule)) continue;
    chunks.push(rule.cssText);
  }
}

// 导出文件没有构建产物路径，字体与相对资源引用只会 404，所以整条规则跳过
export function collectDocumentStyles(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectRules(sheet.cssRules, chunks);
    } catch {
      // 忽略：跨域样式表读不到规则，不属于可导出内容
    }
  }
  return chunks.join('\n');
}

// Vuetify 运行时只对当前主题在 :root 写变量，探针取不到时用这份浅色色板兜底
const FALLBACK_THEME_VARS: Record<string, string> = {
  '--v-theme-background': '255,255,255',
  '--v-theme-surface': '255,251,254',
  '--v-theme-surface-variant': '66,66,66',
  '--v-theme-surface-bright': '255,255,255',
  '--v-theme-surface-light': '238,238,238',
  '--v-theme-on-background': '0,0,0',
  '--v-theme-on-surface': '0,0,0',
  '--v-theme-on-surface-variant': '238,238,238',
  '--v-theme-primary': '103,80,164',
  '--v-theme-on-primary': '255,255,255',
  '--v-theme-secondary': '180,176,187',
  '--v-theme-on-secondary': '0,0,0',
  '--v-theme-success': '76,175,80',
  '--v-theme-on-success': '255,255,255',
  '--v-theme-info': '33,150,243',
  '--v-theme-on-info': '255,255,255',
  '--v-theme-warning': '251,140,0',
  '--v-theme-on-warning': '255,255,255',
  '--v-theme-error': '179,38,30',
  '--v-theme-on-error': '255,255,255',
  '--v-theme-overlay-multiplier': '1',
  '--v-border-color': '0,0,0',
  '--v-border-opacity': '0.12',
  '--v-high-emphasis-opacity': '0.87',
  '--v-medium-emphasis-opacity': '0.6',
  '--v-disabled-opacity': '0.38',
  '--v-focus-opacity': '0.12',
  '--v-hover-opacity': '0.04',
  '--v-activated-opacity': '0.12',
  '--v-selected-opacity': '0.08',
};

const THEME_VARIABLES = [
  '--v-theme-background',
  '--v-theme-surface',
  '--v-theme-surface-variant',
  '--v-theme-surface-bright',
  '--v-theme-surface-light',
  '--v-theme-on-background',
  '--v-theme-on-surface',
  '--v-theme-on-surface-variant',
  '--v-theme-primary',
  '--v-theme-on-primary',
  '--v-theme-secondary',
  '--v-theme-on-secondary',
  '--v-theme-success',
  '--v-theme-on-success',
  '--v-theme-info',
  '--v-theme-on-info',
  '--v-theme-warning',
  '--v-theme-on-warning',
  '--v-theme-error',
  '--v-theme-on-error',
  '--v-theme-overlay-multiplier',
  '--v-border-color',
  '--v-border-opacity',
  '--v-high-emphasis-opacity',
  '--v-medium-emphasis-opacity',
  '--v-disabled-opacity',
  '--v-focus-opacity',
  '--v-hover-opacity',
  '--v-activated-opacity',
  '--v-selected-opacity',
];

// 暗色主题打印会糊成黑底，所以导出固定取浅色主题色板；变量在运行时注入，需实测读取
export function collectExportThemeVars(): string {
  const probe = document.createElement('div');
  probe.className = 'v-application v-theme--light';
  probe.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;';
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe);
  const vars = THEME_VARIABLES.map((name) => {
    const value = computed.getPropertyValue(name).trim() || FALLBACK_THEME_VARS[name] || '';
    return value ? `${name}:${value};` : '';
  }).join('');
  probe.remove();
  return vars;
}

export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || '未命名笔记';
}
