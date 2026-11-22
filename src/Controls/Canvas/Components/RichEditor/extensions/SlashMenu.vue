<script setup lang="ts">
import {
  mdiCodeBraces,
  mdiFormatHeader1,
  mdiFormatHeader2,
  mdiFormatHeader3,
  mdiFormatHeader4,
  mdiFormatListBulleted,
  mdiFormatListCheckbox,
  mdiFormatListNumbered,
  mdiFormatParagraph,
  mdiFormatQuoteClose,
  mdiMathIntegral,
  mdiMinus,
  mdiTable,
} from '@mdi/js';
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from 'prosekit/vue/autocomplete';
import type { EditorCommands } from '../extension.ts';

interface SlashMenuItem {
  label: string;
  description: string;
  icon: string;
  trigger: string;
  keywords: string;
  run: (commands: EditorCommands) => void;
}

defineProps<{ commands: EditorCommands }>();

// 只认行首斜杠，避免 URL 里的斜杠误触发；90 字符上限防止超长输入回溯
const SLASH_REGEX = /(?<!\S)\/(\S.{0,90})?$/u;

const SLASH_ITEMS: SlashMenuItem[] = [
  {
    label: '正文',
    description: '普通段落',
    icon: mdiFormatParagraph,
    trigger: 'p',
    keywords: 'text paragraph zhengwen duanluo',
    run: (commands) => {
      commands.setParagraph();
    },
  },
  {
    label: '标题 1',
    description: '一级标题',
    icon: mdiFormatHeader1,
    trigger: 'h1',
    keywords: 'heading title biaoti',
    run: (commands) => {
      commands.setHeading({ level: 1 });
    },
  },
  {
    label: '标题 2',
    description: '二级标题',
    icon: mdiFormatHeader2,
    trigger: 'h2',
    keywords: 'heading title biaoti',
    run: (commands) => {
      commands.setHeading({ level: 2 });
    },
  },
  {
    label: '标题 3',
    description: '三级标题',
    icon: mdiFormatHeader3,
    trigger: 'h3',
    keywords: 'heading title biaoti',
    run: (commands) => {
      commands.setHeading({ level: 3 });
    },
  },
  {
    label: '标题 4',
    description: '四级标题',
    icon: mdiFormatHeader4,
    trigger: 'h4',
    keywords: 'heading title biaoti',
    run: (commands) => {
      commands.setHeading({ level: 4 });
    },
  },
  {
    label: '无序列表',
    description: '圆点项目',
    icon: mdiFormatListBulleted,
    trigger: 'ul',
    keywords: 'bullet list wuxu liebiao',
    run: (commands) => {
      commands.toggleList({ kind: 'bullet' });
    },
  },
  {
    label: '有序列表',
    description: '编号项目',
    icon: mdiFormatListNumbered,
    trigger: 'ol',
    keywords: 'ordered list youxu liebiao',
    run: (commands) => {
      commands.toggleList({ kind: 'ordered' });
    },
  },
  {
    label: '任务列表',
    description: '可勾选清单',
    icon: mdiFormatListCheckbox,
    trigger: 'todo',
    keywords: 'task checkbox renwu qingdan',
    run: (commands) => {
      commands.toggleList({ kind: 'task' });
    },
  },
  {
    label: '引用',
    description: '引用段落',
    icon: mdiFormatQuoteClose,
    trigger: 'quote',
    keywords: 'blockquote yinyong',
    run: (commands) => {
      commands.toggleBlockquote();
    },
  },
  {
    label: '分割线',
    description: '水平分隔',
    icon: mdiMinus,
    trigger: 'hr',
    keywords: 'divider horizontal rule fengexian',
    run: (commands) => {
      commands.insertHorizontalRule();
    },
  },
  {
    label: '公式块',
    description: 'KaTeX 独立公式',
    icon: mdiMathIntegral,
    trigger: 'math',
    keywords: 'katex latex formula gongshi',
    run: (commands) => {
      commands.insertMathBlock('');
    },
  },
  {
    label: '行内公式',
    description: 'KaTeX 行内公式',
    icon: mdiMathIntegral,
    trigger: 'imath',
    keywords: 'katex latex inline formula hangnei gongshi',
    run: (commands) => {
      commands.insertMathInline('');
    },
  },
  {
    label: '代码块',
    description: '带高亮的代码',
    icon: mdiCodeBraces,
    trigger: 'code',
    keywords: 'codeblock daima',
    run: (commands) => {
      commands.insertVueComponent('CodeBlock', { modelValue: '', language: 'javascript' });
    },
  },
  {
    label: '表格',
    description: '三行三列',
    icon: mdiTable,
    trigger: 'table',
    keywords: 'biaoge',
    run: (commands) => {
      commands.insertVueComponent('TableBlock', {});
    },
  },
];

const ENTRY_BY_LABEL = new Map(SLASH_ITEMS.map((item) => [item.label, item]));

// 列表项显示中文，所以检索同时匹配中文标题、触发词与英文/拼音关键词
const normalizeQueryText = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const filterSlashItems = ({ value, query }: { value: string; query: string }) => {
  const entry = ENTRY_BY_LABEL.get(value);
  if (!entry) return false;
  const target = normalizeQueryText(`${value}${entry.trigger}${entry.keywords}`);
  return target.includes(normalizeQueryText(query));
};
</script>

<template>
  <AutocompleteRoot :regex="SLASH_REGEX" :filter="filterSlashItems">
    <AutocompletePositioner :offset="{ mainAxis: 6, crossAxis: 0 }">
      <AutocompletePopup class="slash-menu">
        <div class="slash-menu-list">
          <AutocompleteItem
            v-for="item in SLASH_ITEMS"
            :key="item.label"
            :value="item.label"
            class="slash-menu-item"
            @select="item.run(commands)"
          >
            <svg class="slash-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path :d="item.icon" fill="currentColor" />
            </svg>
            <span class="slash-menu-text">
              <span class="slash-menu-label">{{ item.label }}</span>
              <span class="slash-menu-desc">{{ item.description }}</span>
            </span>
            <kbd class="slash-menu-key">/{{ item.trigger }}: {{ item.keywords }}</kbd>
          </AutocompleteItem>
          <AutocompleteEmpty class="slash-menu-empty">没有匹配的命令</AutocompleteEmpty>
        </div>
        <div class="slash-menu-hints" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd>选择</span>
          <span><kbd>Enter</kbd>确认</span>
          <span><kbd>Esc</kbd>关闭</span>
        </div>
      </AutocompletePopup>
    </AutocompletePositioner>
  </AutocompleteRoot>
</template>

<style scoped>
/* popover 属性的浏览器默认样式会给 positioner 加边框和内边距，关闭时会留下一个空框 */
:deep(prosekit-autocomplete-positioner) {
  border: none;
  padding: 0;
  margin: 0;
  background: none;
  overflow: visible;
}

:deep(prosekit-autocomplete-positioner[data-state='closed']) {
  display: none;
}

.slash-menu {
  display: flex;
  flex-direction: column;
  min-width: 260px;
  max-height: 320px;
  overflow: hidden;
  padding: 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
}

/* 自带 display:flex 会盖掉关闭态的原生隐藏 */
.slash-menu[hidden],
.slash-menu[data-state='closed'] {
  display: none;
}

/* 只让列表滚动，键位提示固定在自己的行里，不压住最后一项 */
.slash-menu-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}

.slash-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}

.slash-menu-item[hidden] {
  display: none;
}

.slash-menu-item:hover,
.slash-menu-item[data-highlighted] {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.slash-menu-icon {
  flex: none;
  width: 20px;
  height: 20px;
  opacity: 0.72;
}

.slash-menu-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.slash-menu-label {
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
}

.slash-menu-desc {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.6;
  white-space: nowrap;
}

.slash-menu-key {
  margin-left: auto;
  flex: none;
  padding: 0 6px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 4px;
  font-family: inherit;
  font-size: 11px;
  line-height: 18px;
  opacity: 0.6;
}

.slash-menu-empty {
  padding: 8px 10px;
  font-size: 13px;
  opacity: 0.6;
}

.slash-menu-hints {
  display: flex;
  flex: none;
  gap: 12px;
  padding: 6px 10px 4px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  font-size: 11px;
  opacity: 0.55;
}

.slash-menu-hints span {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.slash-menu-hints kbd {
  padding: 0 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
  line-height: 16px;
}
</style>
