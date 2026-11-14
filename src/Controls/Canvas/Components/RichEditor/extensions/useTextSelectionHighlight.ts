import { onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import type { Editor } from '@prosekit/core';

import { getView, layoutToCanvasCss } from './blockHandleUtils';
import { uniqueClientRects } from './textSelectionRects';
import type { TextRect } from './textSelectionRects';

export type TextSelectionRect = TextRect;

interface TextSelectionHighlightOptions {
  editor: Editor;
  scrollRef: Ref<HTMLElement | null | undefined>;
}

// 原生 ::selection 只能方角，所以按行取矩形、在编辑器外层自绘圆角高亮
export function useTextSelectionHighlight(options: TextSelectionHighlightOptions) {
  const { editor, scrollRef } = options;
  const rects = ref<TextSelectionRect[]>([]);

  const elementOf = (node: Node): HTMLElement | null =>
    node instanceof HTMLElement ? node : node.parentElement;

  const rangeOfSelection = (view: any): Range | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!view.dom.contains(range.commonAncestorContainer)) return null;
    // 嵌入块内部是原生控件，选区由浏览器自己画，再叠一层自绘会重影
    return elementOf(range.commonAncestorContainer)?.closest('[data-node-view-root]')
      ? null
      : range;
  };

  const update = () => {
    const view = getView(editor);
    const scroll = scrollRef.value;
    const range = view && scroll ? rangeOfSelection(view) : null;
    if (!view || !scroll || !range) {
      if (rects.value.length) rects.value = [];
      return;
    }
    // 矩形与滚动原点同在 BCR 布局空间，而高亮层在 .canvas 的 zoom 空间内，所以按 zoom 折成层内 CSS 长度
    const origin = scroll.getBoundingClientRect();
    rects.value = uniqueClientRects(range).map((rect) => ({
      left: layoutToCanvasCss(view, rect.left - origin.left),
      top: layoutToCanvasCss(view, rect.top - origin.top),
      width: layoutToCanvasCss(view, rect.width),
      height: layoutToCanvasCss(view, rect.height),
    }));
  };

  onMounted(() => {
    document.addEventListener('selectionchange', update);
    // 块内滚动不冒泡，所以直接挂滚动容器；画布滚动用捕获阶段兜底
    scrollRef.value?.addEventListener('scroll', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
  });

  onUnmounted(() => {
    document.removeEventListener('selectionchange', update);
    scrollRef.value?.removeEventListener('scroll', update);
    window.removeEventListener('scroll', update, true);
    window.removeEventListener('resize', update);
  });

  return { rects, refresh: update };
}
