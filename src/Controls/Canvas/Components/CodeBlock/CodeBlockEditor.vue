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
        @keydown="handleKeydown" @select="updateSelectionRects" @keyup="updateSelectionRects"
        @pointerdown="startSelectionDrag" @mouseup="updateSelectionRects" @blur="clearSelectionRects" />
      <!-- 原生 ::selection 只能方角，所以按字符偏移在高亮层上取矩形，自绘圆角块 -->
      <div class="selection-layer" aria-hidden="true">
        <div v-for="(rect, index) in selectionRects" :key="index" class="selection-rect"
          :style="{
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }" />
      </div>
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

import { viewportToLayout } from '../RichEditor/extensions/blockHandleUtils.ts'
import { uniqueClientRects } from '../RichEditor/extensions/textSelectionRects.ts'
import type { TextRect } from '../RichEditor/extensions/textSelectionRects.ts'

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

const selectionRects = ref<TextRect[]>([])

// 高亮层与 textarea 是同一份文本、同一套字体度量，所以按字符偏移就能在高亮层上取到选区矩形
const rangeAtOffsets = (root: Node, start: number, end: number): Range | null => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let offset = 0
  let isStartSet = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.nodeValue?.length ?? 0
    const nodeStart = offset
    offset += length
    if (!isStartSet && start < offset) {
      range.setStart(node, start - nodeStart)
      isStartSet = true
    }
    if (isStartSet && end <= offset) {
      range.setEnd(node, end - nodeStart)
      return range
    }
  }
  return null
}

// 拖拽时 select 事件可能只在松手后发，所以也要跟着指针重算；同一位置重复触发就不重复量
let measuredKey = ''

const clearSelectionRects = () => {
  measuredKey = ''
  if (selectionRects.value.length) selectionRects.value = []
}

const selectionKeyOf = (textarea: HTMLTextAreaElement): string => [
  textarea.selectionStart,
  textarea.selectionEnd,
  textarea.scrollTop,
  textarea.scrollLeft,
  textarea.clientWidth,
  textarea.clientHeight,
  textarea.value.length,
].join(':')

const updateSelectionRects = () => {
  const textarea = textareaRef.value
  const codeElement = highlightRef.value
  if (!textarea || !codeElement || textarea.selectionStart === textarea.selectionEnd) {
    clearSelectionRects()
    return
  }
  const key = selectionKeyOf(textarea)
  if (key === measuredKey) return
  const range = rangeAtOffsets(codeElement, textarea.selectionStart, textarea.selectionEnd)
  if (!range) {
    clearSelectionRects()
    return
  }
  measuredKey = key
  // 两层滚动同步、字体一致，所以客户端矩形减去 textarea 原点即覆盖层坐标；zoom 下须折回布局像素
  const origin = textarea.getBoundingClientRect()
  selectionRects.value = uniqueClientRects(range).map((rect) => ({
    left: viewportToLayout(textarea, rect.left - origin.left),
    top: viewportToLayout(textarea, rect.top - origin.top),
    width: viewportToLayout(textarea, rect.width),
    height: viewportToLayout(textarea, rect.height),
  }))
}

const stopSelectionDrag = () => {
  window.removeEventListener('pointermove', scheduleSelectionRects, true)
  window.removeEventListener('pointerup', stopSelectionDrag)
  window.removeEventListener('pointercancel', stopSelectionDrag)
  // 收尾必须同步量一次，rAF 可能还没轮到
  updateSelectionRects()
}

// 指针每秒能发上百次，量矩形会强制重排，所以拖拽期间每帧最多算一次
let selectionFrame = 0
const scheduleSelectionRects = () => {
  if (selectionFrame) return
  selectionFrame = requestAnimationFrame(() => {
    selectionFrame = 0
    updateSelectionRects()
  })
}

// 原生高亮已关掉，拖拽期间必须自己给出反馈，否则要松手才看得到选区
const startSelectionDrag = (event: PointerEvent) => {
  if (event.button !== 0) return
  window.addEventListener('pointermove', scheduleSelectionRects, true)
  window.addEventListener('pointerup', stopSelectionDrag)
  window.addEventListener('pointercancel', stopSelectionDrag)
}

const renderHighlight = () => {
  const codeElement = highlightRef.value
  if (!codeElement) return
  // 重绘后旧的矩形已失效，去重键要清掉否则会跳过一次量算
  measuredKey = ''
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
  updateSelectionRects()
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
    // 选区矩形取自高亮层，必须等两层滚动对齐后再量
    updateSelectionRects()
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
    updateSelectionRects()
  })
}

watch([() => props.code, () => props.language], () => nextTick(() => {
  renderHighlight()
  updateSelectionRects()
}))

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
  window.removeEventListener('pointermove', scheduleSelectionRects, true)
  if (selectionFrame) cancelAnimationFrame(selectionFrame)
  selectionFrame = 0
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

/* 原生 ::selection 只能方角，代码块改自绘，所以关掉原生背景（光标由 caretColor 保留） */
.code-editor-wrapper .edit-layer::selection {
  background: transparent;
}

.selection-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
  overflow: hidden;
  pointer-events: none;
}

.selection-rect {
  position: absolute;
  border-radius: 4px;
  background: rgba(var(--v-theme-primary), 0.26);
}
</style>
