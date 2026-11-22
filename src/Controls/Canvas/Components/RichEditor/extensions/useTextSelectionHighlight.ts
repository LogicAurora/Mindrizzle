import { onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import type { Editor } from '@prosekit/core';
import { TextSelection } from 'prosekit/pm/state';

import { getView, layoutToCanvasCss } from './blockHandleUtils';
import { uniqueClientRects } from './textSelectionRects';
import type { TextRect } from './textSelectionRects';

export type TextSelectionRect = TextRect;

interface TextSelectionHighlightOptions {
  editor: Editor;
  scrollRef: Ref<HTMLElement | null | undefined>;
  isToolbarInteractionActive: () => boolean;
}

// 原生 ::selection 只能方角，所以按行取矩形、在编辑器外层自绘圆角高亮
export function useTextSelectionHighlight(options: TextSelectionHighlightOptions) {
  const { editor, scrollRef, isToolbarInteractionActive } = options;
  const rects = ref<TextSelectionRect[]>([]);
  let frame = 0;

  const elementOf = (node: Node): HTMLElement | null =>
    node instanceof HTMLElement ? node : node.parentElement;

  const isEmbeddedSelection = (range: Range): boolean =>
    !!elementOf(range.commonAncestorContainer)?.closest('[data-node-view-root]');

  const rangeFromEditorSelection = (view: any): Range | null => {
    const selection = view.state.selection;
    if (!(selection instanceof TextSelection) || selection.empty) return null;
    const start = view.domAtPos(selection.from);
    const end = view.domAtPos(selection.to);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    if (!view.dom.contains(range.commonAncestorContainer) || isEmbeddedSelection(range))
      return null;
    return range;
  };

  const rangeOfSelection = (view: any): Range | null => {
    const selection = window.getSelection();
    const activeElement = document.activeElement;
    const isToolbarFocused =
      activeElement instanceof Element && !!activeElement.closest('.text-selection-toolbar');
    const shouldPreserveSelection = isToolbarFocused || isToolbarInteractionActive();
    if (shouldPreserveSelection) return rangeFromEditorSelection(view);
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (view.dom.contains(range.commonAncestorContainer)) {
        // 嵌入块内部是原生控件，选区由浏览器自己画，再叠一层自绘会重影
        return isEmbeddedSelection(range) ? null : range;
      }
      return null;
    }
    return null;
  };

  const update = () => {
    frame = 0;
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

  // selectionchange / scroll / resize 常同帧连发，合并到一帧只做一次 getClientRects
  const scheduleUpdate = () => {
    if (frame) return;
    frame = requestAnimationFrame(update);
  };

  onMounted(() => {
    document.addEventListener('selectionchange', scheduleUpdate);
    // 块内滚动不冒泡，所以直接挂滚动容器；画布平移时选区与滚动原点同步位移、相对位置不变，无需全局 scroll
    scrollRef.value?.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
  });

  onUnmounted(() => {
    document.removeEventListener('selectionchange', scheduleUpdate);
    scrollRef.value?.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  });

  return { rects, refresh: scheduleUpdate };
}
