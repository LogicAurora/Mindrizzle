import { addMark, defineCommands, defineMarkSpec, removeMark, union } from '@prosekit/core';

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 72;
export const FONT_SIZE_DEFAULT = 16;
export const FONT_SIZE_OPTIONS = ['12px', '14px', '16px', '18px', '24px', '32px'] as const;
export type FontSizeOption = `${number}px`;

export const isFontSizeOption = (value: unknown): value is FontSizeOption => {
  // 外部归档可能包含任意样式值，所以字号只接受整数 px 并限制在可编辑范围内
  if (typeof value !== 'string' || !/^\d+px$/.test(value)) return false;
  const size = Number.parseInt(value, 10);
  return size >= FONT_SIZE_MIN && size <= FONT_SIZE_MAX;
};

const fontSizeSpec = defineMarkSpec<'fontSize', { size: FontSizeOption }>({
  name: 'fontSize',
  attrs: {
    size: {
      validate: (value) => {
        if (!isFontSizeOption(value))
          throw new RangeError(`Unsupported font size: ${String(value)}`);
      },
    },
  },
  parseDOM: [
    {
      tag: 'span[style*="font-size"], span[data-font-size]',
      getAttrs: (node) => {
        const element = node as HTMLElement;
        const size = element.dataset.fontSize || element.style.fontSize;
        return isFontSizeOption(size) ? { size } : false;
      },
      consuming: false,
    },
  ],
  toDOM(mark) {
    const size = mark.attrs.size as FontSizeOption;
    return ['span', { style: `font-size: ${size};`, 'data-font-size': size }, 0];
  },
});

const fontSizeCommands = defineCommands({
  addFontSize({ size }: { size: FontSizeOption }) {
    if (!isFontSizeOption(size)) throw new RangeError(`Unsupported font size: ${String(size)}`);
    return addMark({ type: 'fontSize', attrs: { size } });
  },
  removeFontSize() {
    return removeMark({ type: 'fontSize' });
  },
});

export const fontSize = union(fontSizeSpec, fontSizeCommands);
