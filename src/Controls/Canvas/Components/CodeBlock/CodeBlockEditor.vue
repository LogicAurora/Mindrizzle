<template>
  <div class="code-editor-container">
    <div v-if="showToolbar" class="toolbar">
      <v-select
        :model-value="language"
        :items="languageOptions"
        :disabled="readOnly"
        aria-label="语言"
        variant="solo"
        density="compact"
        hide-details
        class="language-select"
        @update:model-value="onLanguageChange"
      />
      <v-btn
        variant="text"
        :icon="mdiContentCopy"
        size="x-small"
        title="复制代码"
        @click="copyCode"
      />
    </div>

    <div ref="editorHost" class="editor-host" />

    <v-snackbar
      v-model="snackbar"
      :timeout="1500"
      color="success"
      location="top"
      :prepend-icon="mdiCheck"
    >
      代码已复制到剪贴板
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTheme } from 'vuetify';
import { mdiCheck, mdiContentCopy } from '@mdi/js';
import { error as logError, warn } from '@tauri-apps/plugin-log';

import { basicSetup } from 'codemirror';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';

import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';

interface CodeBlockEditorProps {
  code: string;
  language: string;
  readOnly?: boolean;
  showToolbar?: boolean;
}

interface CodeBlockEditorEmits {
  (e: 'update:code', value: string): void;
  (e: 'update:language', value: string): void;
}

interface LanguageOption {
  title: string;
  value: string;
}

interface DocChange {
  from: number;
  to: number;
  insert: string;
}

const props = withDefaults(defineProps<CodeBlockEditorProps>(), {
  readOnly: false,
  showToolbar: true,
});

const emit = defineEmits<CodeBlockEditorEmits>();

const theme = useTheme();
const isDark = computed<boolean>(() => theme.global.name.value === 'dark');

const languageOptions: LanguageOption[] = [
  { title: '纯文本', value: 'plaintext' },
  { title: 'JavaScript', value: 'javascript' },
  { title: 'TypeScript', value: 'typescript' },
  { title: 'Python', value: 'python' },
  { title: 'HTML', value: 'html' },
  { title: 'CSS', value: 'css' },
  { title: 'JSON', value: 'json' },
  { title: 'SQL', value: 'sql' },
  { title: 'C++', value: 'cpp' },
  { title: 'Java', value: 'java' },
  { title: 'Go', value: 'go' },
  { title: 'Rust', value: 'rust' },
  { title: 'PHP', value: 'php' },
];

const editorHost = ref<HTMLElement | null>(null);
const snackbar = ref<boolean>(false);

// 用 Compartment 让语言/主题/只读可以在同一个 EditorView 上动态切换
const languageCompartment: Compartment = new Compartment();
const themeCompartment: Compartment = new Compartment();
const readOnlyCompartment: Compartment = new Compartment();

let view: EditorView | null = null;

const languageExtensionOf = (lang: string): Extension => {
  switch (lang) {
    case 'javascript':
      return javascript();
    case 'typescript':
      return javascript({ typescript: true });
    case 'python':
      return python();
    case 'html':
      return html();
    case 'css':
      return css();
    case 'json':
      return json();
    case 'sql':
      return sql();
    case 'cpp':
      return cpp();
    case 'java':
      return java();
    case 'go':
      return go();
    case 'rust':
      return rust();
    case 'php':
      return php();
    default:
      return [];
  }
};

// 只读用 EditorState.readOnly 控制行为，EditorView.editable 控制能否获得焦点/弹出键盘
const readOnlyExtensionOf = (readOnly: boolean): Extension[] => [
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
];

const themeExtensionOf = (dark: boolean): Extension => (dark ? oneDark : []);

const createEditor = (): void => {
  if (!editorHost.value) return;

  const state: EditorState = EditorState.create({
    doc: props.code,
    extensions: [
      basicSetup,
      languageCompartment.of(languageExtensionOf(props.language)),
      themeCompartment.of(themeExtensionOf(isDark.value)),
      readOnlyCompartment.of(readOnlyExtensionOf(props.readOnly)),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        emit('update:code', update.state.doc.toString());
      }),
    ],
  });

  view = new EditorView({
    state,
    parent: editorHost.value,
  });
};

const syncExternalCode = (): void => {
  if (!view) return;
  const current: string = view.state.doc.toString();
  if (current === props.code) return;
  // 外部内容变化时整体替换；只换 config 不会触发几何刷新，这里不需要保留光标
  const changes: DocChange = { from: 0, to: current.length, insert: props.code };
  view.dispatch({ changes });
};

watch(
  () => props.language,
  (lang: string): void => {
    view?.dispatch({
      effects: languageCompartment.reconfigure(languageExtensionOf(lang)),
    });
  },
);

watch(
  () => props.readOnly,
  (readOnly: boolean): void => {
    view?.dispatch({
      effects: readOnlyCompartment.reconfigure(readOnlyExtensionOf(readOnly)),
    });
  },
);

watch(isDark, (dark: boolean): void => {
  view?.dispatch({
    effects: themeCompartment.reconfigure(themeExtensionOf(dark)),
  });
});

watch(
  () => props.code,
  (): void => syncExternalCode(),
);

const onLanguageChange = (value: unknown): void => {
  emit('update:language', String(value ?? 'plaintext'));
};

const copyCode = async (): Promise<void> => {
  const text: string = props.code;
  if (!text) {
    warn('没有代码可复制');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const fallback: HTMLTextAreaElement = document.createElement('textarea');
      fallback.value = text;
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand('copy');
      document.body.removeChild(fallback);
    }
    snackbar.value = true;
  } catch (error) {
    const message: string = error instanceof Error ? error.message : String(error);
    logError('复制失败: ' + message);
    alert('复制失败，请手动复制代码。\n错误信息：' + message);
  }
};

onMounted((): void => {
  createEditor();
});

onBeforeUnmount((): void => {
  view?.destroy();
  view = null;
});
</script>

<style scoped>
.code-editor-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 300px;
  min-height: 200px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  flex: 0 0 40px;
  height: 40px;
  min-height: 40px;
  padding: 2px 6px;
  background-color: var(--v-theme-surface, #f6f8fa);
  border: 1px solid var(--v-theme-border, #e1e4e8);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
}

.language-select {
  max-width: 160px;
  font-size: 13px;
  --v-input-control-height: 32px;
}

.language-select :deep(.v-input__control),
.language-select :deep(.v-field),
.language-select :deep(.v-field__input) {
  height: 32px;
  min-height: 32px;
}

.language-select :deep(.v-field) {
  overflow: hidden;
}

.language-select :deep(.v-field__input) {
  padding-top: 0;
  padding-bottom: 0;
  line-height: 1.2;
}

.toolbar :deep(.v-btn) {
  width: 32px;
  height: 32px;
  min-width: 32px;
}

.editor-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--v-theme-border, #e1e4e8);
  border-top: none;
  border-radius: 0 0 6px 6px;
  background-color: var(--v-theme-surface, #f6f8fa);
}

.editor-host :deep(.cm-editor) {
  height: 100%;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Courier New', monospace;
  font-size: 14px;
}

.editor-host :deep(.cm-scroller) {
  overflow: auto;
}

.editor-host :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
