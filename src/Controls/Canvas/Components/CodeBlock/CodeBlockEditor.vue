<template>
  <div class="code-editor-container">
    <div v-if="showToolbar" class="toolbar">
      <v-select :model-value="language" :items="languageOptions" :disabled="readOnly" aria-label="语言" variant="solo"
        density="compact" hide-details class="language-select" @update:model-value="onLanguageChange" />
      <v-btn variant="text" :icon="mdiContentCopy" size="x-small" title="复制代码" @click="copyCode" />
    </div>

    <div ref="wrapperRef" class="code-editor-wrapper">
      <pre class="highlight-layer"><code ref="highlightRef" :class="`language-${language}`"></code></pre>
      <textarea ref="textareaRef" :value="code" class="edit-layer" :readonly="readOnly"
        :style="{ caretColor: String(primaryColor) }" spellcheck="false" @scroll="syncScroll" @input="onInput"
        @keydown="handleKeydown" />
    </div>

    <v-snackbar :prepend-icon="mdiCheck" v-model="snackbar" :timeout="1500" color="success" location="top">
      代码已复制到剪贴板
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { mdiCheck, mdiContentCopy } from '@mdi/js'
import hljs from 'highlight.js/lib/core'
import { error as logError, warn } from '@tauri-apps/plugin-log'

import githubCss from 'highlight.js/styles/github.css?raw'
import atomDarkCss from 'highlight.js/styles/atom-one-dark.css?raw'

import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import php from 'highlight.js/lib/languages/php'
import ruby from 'highlight.js/lib/languages/ruby'
import swift from 'highlight.js/lib/languages/swift'
import kotlin from 'highlight.js/lib/languages/kotlin'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('vue', xml)
hljs.registerLanguage('php', php)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)

const props = withDefaults(defineProps<{
  code: string
  language: string
  readOnly?: boolean
  showToolbar?: boolean
}>(), {
  readOnly: false,
  showToolbar: true,
})

const emit = defineEmits<{
  (e: 'update:code', value: string): void
  (e: 'update:language', value: string): void
}>()

const theme = useTheme()
const isDark = computed(() => theme.global.name.value === 'dark')
const primaryColor = computed(() => theme.global.current.value.colors.primary)

const STYLE_ID = 'hljs-theme-local'
let styleElement: HTMLStyleElement | null = null

const applyTheme = (dark: boolean) => {
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = STYLE_ID
    document.head.appendChild(styleElement)
  }
  styleElement.textContent = dark ? atomDarkCss : githubCss
}

watch(isDark, (dark) => {
  applyTheme(dark)
}, { immediate: true })

const languageOptions = [
  { title: '纯文本', value: 'plaintext' },
  { title: 'JavaScript', value: 'javascript' },
  { title: 'TypeScript', value: 'typescript' },
  { title: 'Python', value: 'python' },
  { title: 'HTML', value: 'html' },
  { title: 'CSS', value: 'css' },
  { title: 'JSON', value: 'json' },
  { title: 'Bash / Shell', value: 'bash' },
  { title: 'C', value: 'c' },
  { title: 'C++', value: 'cpp' },
  { title: 'Java', value: 'java' },
  { title: 'Go', value: 'go' },
  { title: 'Rust', value: 'rust' },
  { title: 'Vue', value: 'vue' },
  { title: 'PHP', value: 'php' },
  { title: 'Ruby', value: 'ruby' },
  { title: 'Swift', value: 'swift' },
  { title: 'Kotlin', value: 'kotlin' },
]

const snackbar = ref(false)
const highlightRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const wrapperRef = ref<HTMLElement | null>(null)

const renderHighlight = () => {
  const codeElement = highlightRef.value
  if (!codeElement) return
  const code = props.code || ''
  try {
    const lang = props.language
    const highlighted = lang && lang !== 'plaintext' && hljs.getLanguage(lang)
      ? hljs.highlight(code, { language: lang })
      : hljs.highlightAuto(code)
    codeElement.innerHTML = highlighted.value
  } catch (error) {
    warn('高亮失败，使用纯文本: ' + (error instanceof Error ? error.message : String(error)))
    codeElement.textContent = code
  }
}

const onInput = (event: Event) => {
  if (props.readOnly) return
  emit('update:code', (event.target as HTMLTextAreaElement).value)
}

const onLanguageChange = (value: unknown) => {
  emit('update:language', String(value ?? 'plaintext'))
}

// 滚动位置要在浏览器重排后同步，所以用 requestAnimationFrame 延后一拍
const syncScroll = () => {
  const textarea = textareaRef.value
  const pre = highlightRef.value?.parentElement
  if (!pre || !textarea) return
  requestAnimationFrame(() => {
    pre.scrollTop = textarea.scrollTop
    pre.scrollLeft = textarea.scrollLeft
  })
}

const copyCode = async () => {
  const text = props.code
  if (!text) {
    warn('没有代码可复制')
    return
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const fallback = document.createElement('textarea')
      fallback.value = text
      fallback.style.position = 'fixed'
      fallback.style.opacity = '0'
      document.body.appendChild(fallback)
      fallback.select()
      document.execCommand('copy')
      document.body.removeChild(fallback)
    }
    snackbar.value = true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError('复制失败: ' + message)
    alert('复制失败，请手动复制代码。\n错误信息：' + message)
  }
}

const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
}

const handleKeydown = (event: KeyboardEvent) => {
  if (props.readOnly) return
  const textarea = textareaRef.value
  const right = PAIRS[event.key]
  if (!textarea || !right) return

  event.preventDefault()
  const { selectionStart: start, selectionEnd: end, value } = textarea
  const selected = value.substring(start, end)
  const next = value.substring(0, start) + event.key + selected + right + value.substring(end)
  emit('update:code', next)
  nextTick(() => {
    textarea.selectionStart = start + 1
    textarea.selectionEnd = end + 1
    textarea.focus({ preventScroll: true })
  })
}

watch([() => props.code, () => props.language], () => nextTick(renderHighlight))

const resizeObserver = ref<ResizeObserver | null>(null)
onMounted(() => {
  // 挂载即聚焦会让"插入块/打开便签"时焦点被 textarea 抢走，所以只渲染高亮
  nextTick(() => {
    renderHighlight()
    syncScroll()
  })
  if (window.ResizeObserver && wrapperRef.value) {
    resizeObserver.value = new ResizeObserver(() => syncScroll())
    resizeObserver.value.observe(wrapperRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver.value?.disconnect()
  if (styleElement?.parentNode) {
    styleElement.parentNode.removeChild(styleElement)
    styleElement = null
  }
})
</script>

<style scoped>
.code-editor-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  /* 内嵌时外层容器高度由缩放手柄决定，不铺满会让右下角手柄浮在代码块下方的空白里 */
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

.language-select :deep(.v-field__append-inner) {
  padding-top: 0;
  padding-bottom: 0;
}

.toolbar :deep(.v-btn) {
  width: 32px;
  height: 32px;
  min-width: 32px;
}

.code-editor-wrapper {
  position: relative;
  border: 1px solid var(--v-theme-border, #e1e4e8);
  border-top: none;
  border-radius: 0 0 6px 6px;
  overflow: hidden;
  background-color: var(--v-theme-surface, #f6f8fa);
  flex: 1;
}

.highlight-layer,
.edit-layer {
  margin: 0;
  padding: 12px 16px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  font-weight: normal;
  letter-spacing: normal;
  word-spacing: normal;
  text-transform: none;
  tab-size: 2;
  white-space: pre;
  word-wrap: normal;
  word-break: normal;
  border: none;
  outline: none;
  resize: none;
  overflow: auto;
  width: 100%;
  box-sizing: border-box;
  min-height: 120px;
  font-variant-ligatures: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.highlight-layer {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  z-index: 1;
  background-color: transparent !important;
  pointer-events: none;
  margin: 0;
  padding: 12px 16px;
  border-radius: 0;
  overflow: auto;
}

.highlight-layer code {
  display: block;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  background: transparent !important;
  padding: 0;
  border: none;
}

.edit-layer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  background-color: transparent;
  color: transparent;
  padding: 12px 16px;
  border-radius: 0;
  height: 100%;
  min-height: inherit;
  scrollbar-width: auto;
  -ms-overflow-style: auto;
}

.edit-layer::-webkit-scrollbar,
.highlight-layer::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.edit-layer::-webkit-scrollbar-thumb,
.highlight-layer::-webkit-scrollbar-thumb {
  background: var(--v-theme-border, #d1d5da);
  border-radius: 4px;
}

.edit-layer::-webkit-scrollbar-track,
.highlight-layer::-webkit-scrollbar-track {
  background: transparent;
}
</style>
