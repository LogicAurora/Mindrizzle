import { defineNodeSpec } from '@prosekit/core'
import { defineVueNodeView } from '@prosekit/vue'
import {
  h,
  defineComponent,
  ref,
  watch,
  onUnmounted,
  reactive,
  PropType,
  onMounted,
  computed,
  markRaw,
  provide,
  Teleport,
} from 'vue'
import { mdiArrowBottomRight, mdiCogOutline, mdiExportVariant } from '@mdi/js'
import { Z_LAYER } from '../../../Core/zIndex.ts'
import { DEFAULT_CONSTRAINTS, normalizeConstraints, type ResizeConstraints } from '../../../Registry/resizeConstraints.ts'
import { embeddedBlockOf } from '../../../Sdk/blockRegistry.ts'
import { EMBED_SETTINGS_HOST_KEY } from '../../../Sdk/embedSettingsHost.ts'
import { createStoreResolver, findPositionerEl, layoutToViewportX, layoutToViewportY, viewportToLayout } from './blockHandleUtils.ts'

const resolveBlockHandleStore = createStoreResolver()

const loadedCache = new Map<
  string,
  { component: any; constraints: Required<ResizeConstraints>; aspectRatio: number | null }
>()

// 内嵌组件与画布块同一注册表，避免同一类块在两处各自维护一份
async function loadComponent(name: string) {
  const cached = loadedCache.get(name)
  if (cached) return cached
  const definition = embeddedBlockOf(name)
  const component = definition?.embed?.component ?? definition?.rawComponent
  if (!definition || !component) throw new Error(`未知组件：${name}`)
  const result = {
    component,
    constraints: normalizeConstraints(definition.constraints),
    aspectRatio: definition.embed?.aspectRatio ?? null,
  }
  loadedCache.set(name, result)
  return result
}

export const vueComponentNode = defineNodeSpec({
  name: 'vueComponent',
  group: 'block',
  atom: true,
  isolating: true,
  attrs: {
    componentName: { default: 'MyCard' },
    props: { default: {} },
    width: { default: 360 },
    height: { default: 240 },
    // 嵌入态也需要组件数据目录，拖出成块时按它迁移文件
    uuid: { default: '' },
  },
  parseDOM: [
    {
      tag: 'div[data-vue-component]',
      getAttrs(dom) {
        const el = dom as HTMLElement
        return {
          componentName: el.getAttribute('data-component-name') || 'MyCard',
          props: JSON.parse(el.getAttribute('data-props') || '{}'),
          width: parseFloat(el.getAttribute('data-width') || '360'),
          height: parseFloat(el.getAttribute('data-height') || '240'),
          uuid: el.getAttribute('data-uuid') || '',
        }
      },
    },
  ],
  toDOM(node) {
    return [
      'div',
      {
        'data-vue-component': '',
        'data-component-name': node.attrs.componentName,
        'data-props': JSON.stringify(node.attrs.props),
        'data-width': String(node.attrs.width),
        'data-height': String(node.attrs.height),
        'data-uuid': node.attrs.uuid || '',
      },
    ]
  },
})

interface ToolButtonOptions {
  icon: string
  active: boolean
  cursor: string
  title: string
  onMousedown: (event: MouseEvent) => void
  onHover: (hovering: boolean) => void
}

// 左下"拖出成块"与右下缩放共用角标视觉，避免渲染函数重复整段样式
// 描边与工具条共用同一个色相，随主题明暗自动切换
const toolTone = 'var(--v-theme-on-surface, #000000)'
const TOOLBAR_HEIGHT = 22
const TOOL_BUTTON_SIZE = 20
const SETTINGS_POP_WIDTH = 240

const toolButtonStyle = (active: boolean, cursor: string) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: `${TOOL_BUTTON_SIZE}px`,
  height: `${TOOL_BUTTON_SIZE}px`,
  borderRadius: '3px',
  background: active ? `rgba(${toolTone}, 0.16)` : 'transparent',
  color: active ? `rgba(${toolTone}, 0.95)` : `rgba(${toolTone}, 0.6)`,
  cursor,
  userSelect: 'none' as const,
  transition: 'background 0.15s, color 0.15s',
})

function renderToolButton(options: ToolButtonOptions) {
  const { icon, active, cursor, title, onMousedown, onHover } = options
  return h(
    'div',
    {
      title,
      style: toolButtonStyle(active, cursor),
      onMouseenter: () => onHover(true),
      onMouseleave: () => onHover(false),
      onMousedown,
    },
    [h('svg', { viewBox: '0 0 24 24', width: 14, height: 14 }, [h('path', { d: icon, fill: 'currentColor' })])],
  )
}

// 拖出成块时跟随鼠标的徽标，不可命中
function createExtractGhost(): HTMLDivElement {
  const ghost = document.createElement('div')
  ghost.style.cssText =
    'position:fixed;pointer-events:none;z-index:9999;width:26px;height:26px;border-radius:4px;' +
    'display:flex;align-items:center;justify-content:center;' +
    'background:rgba(var(--v-theme-surface),0.92);' +
    'border:1px solid rgba(var(--v-theme-on-surface),0.3);color:rgba(var(--v-theme-on-surface),0.6);'
  ghost.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="${mdiExportVariant}" fill="currentColor"/></svg>`
  return ghost
}

const ResizableContainer = defineComponent({
  name: 'ResizableContainer',
  props: {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    aspectRatio: { type: Number, default: null },
    minWidth: { type: Number as PropType<number | null>, default: null },
    maxWidth: { type: Number as PropType<number | null>, default: null },
    minHeight: { type: Number as PropType<number | null>, default: null },
    maxHeight: { type: Number as PropType<number | null>, default: null },
    readOnly: { type: Boolean, default: false },
    icon: { type: String, default: '' },
    title: { type: String, default: '' },
    // NodeView 渲染上下文外调用 slot 会触发 Vue 警告，所以内容经 prop 传入
    content: { type: Object as PropType<any>, required: true },
  },
  emits: ['resize', 'extract'],
  setup(props, { emit }) {
    const containerRef = ref<HTMLElement | null>(null)
    const isResizing = ref(false)
    const isResizeHovered = ref(false)
    const isExtractHovered = ref(false)
    const isExtracting = ref(false)
    const currentWidth = ref(props.width)
    const currentHeight = ref(props.height)

    const settingsOpen = ref(false)
    const settingsPopRef = ref<HTMLElement | null>(null)
    const settingsHostRef = ref<HTMLElement | null>(null)
    const settingsAnchorRef = ref<HTMLElement | null>(null)
    const settingsPos = ref({ left: 0, top: 0 })
    provide(EMBED_SETTINGS_HOST_KEY, settingsHostRef)

    // 弹层挂在 body，点外面就收起；点按钮自身交给 toggle 处理
    const closeSettingsOnOutside = (event: MouseEvent) => {
      if (!settingsOpen.value) return
      const target = event.target as Node | null
      if (!target) return
      if (settingsPopRef.value?.contains(target) || settingsAnchorRef.value?.contains(target)) return
      settingsOpen.value = false
    }

    const toggleSettings = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (settingsOpen.value) {
        settingsOpen.value = false
        return
      }
      const anchor = event.currentTarget as HTMLElement
      settingsAnchorRef.value = anchor
      const rect = anchor.getBoundingClientRect()
      // 弹层在 body（zoom 容器外），所以按钮矩形是布局坐标、需要换算成视觉坐标再夹进视口
      const left = layoutToViewportX(anchor, rect.right) - SETTINGS_POP_WIDTH
      settingsPos.value = {
        left: Math.max(8, Math.min(left, window.innerWidth - SETTINGS_POP_WIDTH - 8)),
        top: layoutToViewportY(anchor, rect.bottom) + 6,
      }
      settingsOpen.value = true
    }

    const stopWatchWidth = watch(
      () => props.width,
      (val) => {
        if (!isResizing.value) currentWidth.value = val
      }
    )
    const stopWatchHeight = watch(
      () => props.height,
      (val) => {
        if (!isResizing.value) currentHeight.value = val
      }
    )

    const startResize = (e: MouseEvent) => {
      if (props.readOnly) return
      e.preventDefault()
      e.stopPropagation()
      isResizing.value = true

      // 画布 zoom 下鼠标位移是视觉像素、而组件宽高是编辑器布局像素，所以位移须折回布局空间（否则缩放后手柄跟不上鼠标）
      const scaleEl = e.currentTarget as HTMLElement | null
      const startX = e.clientX
      const startY = e.clientY
      const startWidth = currentWidth.value
      const startHeight = currentHeight.value

      const maxW = props.maxWidth !== null ? props.maxWidth : Infinity
      const minW = props.minWidth !== null ? props.minWidth : -Infinity
      const maxH = props.maxHeight !== null ? props.maxHeight : Infinity
      const minH = props.minHeight !== null ? props.minHeight : -Infinity

      const onMouseMove = (ev: MouseEvent) => {
        ev.preventDefault()
        let newWidth = startWidth + viewportToLayout(scaleEl, ev.clientX - startX)
        let newHeight = startHeight + viewportToLayout(scaleEl, ev.clientY - startY)

        newWidth = Math.max(minW, Math.min(maxW, newWidth))
        newHeight = Math.max(minH, Math.min(maxH, newHeight))

        if (props.aspectRatio !== null && props.aspectRatio !== undefined) {
          let newHeightByWidth = newWidth / props.aspectRatio
          newHeight = newHeightByWidth
          newHeight = Math.max(minH, Math.min(maxH, newHeight))
          const newWidthByHeight = newHeight * props.aspectRatio
          newWidth = Math.max(minW, Math.min(maxW, newWidthByHeight))
        }

        currentWidth.value = newWidth
        currentHeight.value = newHeight
        emit('resize', newWidth, newHeight)
      }

      const onMouseUp = () => {
        isResizing.value = false
        document.removeEventListener('mousemove', onMouseMove, true)
        document.removeEventListener('mouseup', onMouseUp)
      }

      // hover 自解析会 stopPropagation，所以用捕获阶段
      document.addEventListener('mousemove', onMouseMove, true)
      document.addEventListener('mouseup', onMouseUp)
    }

    // 左下按钮把插入组件拖出成画布块，是否落位由画布判定
    const startExtract = (event: MouseEvent) => {
      if (props.readOnly) return
      event.preventDefault()
      event.stopPropagation()
      isExtracting.value = true
      const ghost = createExtractGhost()
      document.body.appendChild(ghost)
      const placeGhost = (ev: MouseEvent) => {
        ghost.style.left = `${ev.clientX + 12}px`
        ghost.style.top = `${ev.clientY + 12}px`
      }
      const onMouseMove = (ev: MouseEvent) => placeGhost(ev)
      const onMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMouseMove, true)
        document.removeEventListener('mouseup', onMouseUp)
        ghost.remove()
        isExtracting.value = false
        emit('extract', { clientX: ev.clientX, clientY: ev.clientY })
      }
      placeGhost(event)
      // hover 自解析会 stopPropagation，所以用捕获阶段
      document.addEventListener('mousemove', onMouseMove, true)
      document.addEventListener('mouseup', onMouseUp)
    }

    onMounted(() => document.addEventListener('mousedown', closeSettingsOnOutside, true))

    onUnmounted(() => {
      stopWatchWidth()
      stopWatchHeight()
      document.removeEventListener('mousedown', closeSettingsOnOutside, true)
    })

    return () => {
      const children = [props.content]
      const isResizeActive = isResizing.value || isResizeHovered.value
      const isExtractActive = isExtracting.value || isExtractHovered.value

      const maxWidth = props.maxWidth !== null ? props.maxWidth + 'px' : '100%'
      const toolbar = props.readOnly
        ? null
        : h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              // 宽度交给父级 stretch，写 100% 会在自动宽容器里按可用宽撑开，块缩窄时条不跟
              alignSelf: 'stretch',
              height: `${TOOLBAR_HEIGHT}px`,
              marginTop: '2px',
              padding: '0 3px',
              boxSizing: 'border-box',
              borderRadius: '4px',
              background: `rgba(${toolTone}, 0.06)`,
              border: `1px solid rgba(${toolTone}, 0.08)`,
            },
            // 工具条在内容外，但仍在 ProseMirror 里，不拦住会变成选段落
            onMousedown: (event: MouseEvent) => event.stopPropagation(),
          },
          [
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '4px', flex: '1', minWidth: 0 } },
              [
                props.icon
                  ? h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, style: { flex: '0 0 auto', color: `rgba(${toolTone}, 0.45)` } }, [h('path', { d: props.icon, fill: 'currentColor' })])
                  : null,
                h(
                  'span',
                  {
                    style: {
                      fontSize: '11px',
                      color: `rgba(${toolTone}, 0.6)`,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  },
                  props.title,
                ),
              ],
            ),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '2px', flex: '0 0 auto' } },
              [
                renderToolButton({
                  icon: mdiExportVariant,
                  active: isExtractActive,
                  cursor: 'grab',
                  title: '拖出成画布块',
                  onMousedown: startExtract,
                  onHover: (hovering) => { isExtractHovered.value = hovering },
                }),
                renderToolButton({
                  icon: mdiCogOutline,
                  active: settingsOpen.value,
                  cursor: 'pointer',
                  title: '块设置',
                  onMousedown: toggleSettings,
                  onHover: () => {},
                }),
                renderToolButton({
                  icon: mdiArrowBottomRight,
                  active: isResizeActive,
                  cursor: 'nwse-resize',
                  title: '拖动改变大小',
                  onMousedown: startResize,
                  onHover: (hovering) => { isResizeHovered.value = hovering },
                }),
              ],
            ),
          ],
        )

      return h(
        'div',
        {
          style: {
            display: 'inline-flex',
            flexDirection: 'column',
            width: currentWidth.value + 'px',
            maxWidth,
            verticalAlign: 'top',
          },
        },
        [
          h(
            'div',
            {
              ref: containerRef,
              style: {
                width: '100%',
                height: currentHeight.value + 'px',
                maxWidth,
                maxHeight: props.maxHeight !== null ? props.maxHeight + 'px' : '100%',
                position: 'relative',
                boxSizing: 'border-box',
                overflow: 'hidden',
                borderRadius: '4px',
                // 描边会挤压内容，所以用 inset 阴影画
                boxShadow: `inset 0 0 0 1px rgba(${toolTone}, 0.22)`,
              },
            },
            children,
          ),
          toolbar,
          // 设置面板挂在 body：放在 .editor-scroll 里会被 overflow 裁掉
          h(Teleport, { to: 'body' }, [
            h(
              'div',
              {
                ref: settingsPopRef,
                style: {
                  position: 'fixed',
                  left: `${settingsPos.value.left}px`,
                  top: `${settingsPos.value.top}px`,
                  width: `${SETTINGS_POP_WIDTH}px`,
                  display: settingsOpen.value ? 'block' : 'none',
                  zIndex: Z_LAYER.settingsMenu,
                  background: 'rgb(var(--v-theme-surface))',
                  border: `1px solid rgba(${toolTone}, 0.12)`,
                  borderRadius: '6px',
                  boxShadow: '0 12px 32px -12px rgba(0, 0, 0, 0.45)',
                  padding: '4px',
                  maxHeight: '60vh',
                  overflow: 'auto',
                },
                onMousedown: (event: MouseEvent) => event.stopPropagation(),
              },
              [h('div', { ref: settingsHostRef })],
            ),
          ]),
        ],
      )
    }
  },
})

export const vueComponentNodeView = defineVueNodeView({
  name: 'vueComponent',
  component: defineComponent({
    props: ['node', 'view', 'getPos'],
    setup(props) {
      const node = props.node
      const view = props.view
      const getPos = props.getPos
      let hoverKeepAlive: ReturnType<typeof setInterval> | null = null

      const setBlockHover = () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        const store = resolveBlockHandleStore(findPositionerEl(view))
        store?.hoverState?.set({ node: node.value, pos })
      }

      const notifyBlockHover = () => {
        setBlockHover()
        if (hoverKeepAlive) return
        hoverKeepAlive = setInterval(setBlockHover, 150)
      }

      const stopBlockHover = () => {
        if (!hoverKeepAlive) return
        clearInterval(hoverKeepAlive)
        hoverKeepAlive = null
      }

      // 工具条标题/图标与画布块一致：按当前 config 反推，改 props 立即更新
      const definition = computed(() => embeddedBlockOf(node.value.attrs.componentName as string))
      const embedConfig = computed<Record<string, unknown>>(() => {
        const embed = definition.value?.embed
        return embed ? embed.fromProps(node.value.attrs.props as Record<string, unknown>) : {}
      })
      const blockIcon = computed(() => definition.value?.iconOf?.(embedConfig.value) ?? definition.value?.icon ?? '')
      const blockTitle = computed(() => definition.value?.titleOf?.(embedConfig.value) ?? definition.value?.title ?? '')

      const state = reactive<{
        component: any | null
        constraints: Required<ResizeConstraints>
        aspectRatio: number | null
        loaded: boolean
        error?: string
      }>({
        component: null,
        constraints: { ...DEFAULT_CONSTRAINTS },
        aspectRatio: null,
        loaded: false,
      })

      const load = async () => {
        const name = node.value.attrs.componentName as string
        try {
          const { component, constraints, aspectRatio } = await loadComponent(name)
          state.component = markRaw(component)
          state.constraints = constraints
          state.aspectRatio = aspectRatio
          state.loaded = true
          state.error = undefined
        } catch (err: any) {
          state.error = err.message || '加载失败'
          state.loaded = true
        }
      }
      load()

      watch(
        () => node.value.attrs.componentName,
        () => {
          state.loaded = false
          load()
        }
      )

      // 首次 clientWidth 可能为 0，所以以 10000 后备避免宽度塌缩
      const containerWidth = ref<number>(view.dom.clientWidth || 10000)
      let resizeObserver: ResizeObserver | null = null
      const readOnly = ref(!view.editable)
      let editorWrapper: HTMLElement | null = null
      const onReadOnlyChange = (event: Event) => {
        readOnly.value = (event as CustomEvent<boolean>).detail === true
      }

      onMounted(() => {
        const container = view.dom
        if (container) {
          containerWidth.value = container.clientWidth || 10000
          resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              containerWidth.value = entry.contentRect.width || 10000
            }
          })
          resizeObserver.observe(container)
        }
      })

      onUnmounted(() => {
        stopBlockHover()
        if (resizeObserver) {
          resizeObserver.disconnect()
          resizeObserver = null
        }
      })

      const effectiveMaxWidth = computed(() => {
        const constraintsMax = state.constraints.maxWidth
        const containerW = containerWidth.value

        if (constraintsMax === null) {
          return containerW
        }
        return Math.min(constraintsMax, containerW)
      })

      const handleResize = (newWidth: number, newHeight: number) => {
        if (readOnly.value) return
        const pos = getPos()
        if (typeof pos !== 'number') return
        const tr = view.state.tr
        tr.setNodeMarkup(pos, undefined, {
          ...node.value.attrs,
          width: Math.round(newWidth),
          height: Math.round(newHeight),
        })
        view.dispatch(tr)
      }

      const updateComponentProps = (props: Record<string, any>) => {
        if (readOnly.value) return
        const pos = getPos()
        if (typeof pos !== 'number') return
        const tr = view.state.tr
        tr.setNodeMarkup(pos, undefined, {
          ...node.value.attrs,
          props: { ...node.value.attrs.props, ...props },
        })
        view.dispatch(tr)
      }

      // 落位成功后从文档删除该节点（画布块已接管其内容）
      const handleExtract = (point: { clientX: number; clientY: number }) => {
        if (readOnly.value) return
        const pos = getPos()
        if (typeof pos !== 'number') return
        // doc 需 block+，仅剩该节点时抽出会留下非法空文档，所以不响应
        if (view.state.doc.childCount <= 1) return
        const payload = {
          componentName: node.value.attrs.componentName as string,
          props: node.value.attrs.props as Record<string, any>,
          uuid: node.value.attrs.uuid as string,
          clientX: point.clientX,
          clientY: point.clientY,
          accepted: false,
        }
        window.dispatchEvent(new CustomEvent('Mindrizzle:extract-component', { detail: payload }))
        if (!payload.accepted) return
        view.dispatch(view.state.tr.delete(pos, pos + node.value.nodeSize))
      }

      watch(
        [effectiveMaxWidth, () => node.value.attrs.width],
        ([maxW, currentW]) => {
          if (maxW < currentW) {
            const newWidth = Math.floor(maxW)
            const currentHeight = node.value.attrs.height
            handleResize(newWidth, currentHeight)
          }
        },
        { immediate: true }
      )

      onMounted(() => {
        editorWrapper = view.dom.closest('.editor-wrapper') as HTMLElement | null
        if (!editorWrapper) return
        readOnly.value = editorWrapper.dataset.readOnly === 'true'
        editorWrapper.addEventListener('Mindrizzle:rich-text-read-only', onReadOnlyChange)
      })

      onUnmounted(() => editorWrapper?.removeEventListener('Mindrizzle:rich-text-read-only', onReadOnlyChange))

      return () => {
        const currentNode = node.value
        const componentProps = currentNode.attrs.props as Record<string, any>

        if (!state.loaded) {
          return h(
            'div',
            {
              style: {
                padding: '16px',
                color: 'rgba(var(--v-theme-on-surface), 0.6)',
              },
            },
            '加载中...'
          )
        }
        if (state.error || !state.component) {
          return h(
            'div',
            {
              style: {
                color: 'var(--v-theme-error, #b71c1c)',
                padding: '8px',
              },
            },
            `错误：${state.error || '组件未找到'}`
          )
        }

        const Comp = state.component
        const aspectRatio = state.aspectRatio

        const innerContent = h(
          'div',
          {
            style: {
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              boxSizing: 'border-box',
            },
            onMousedown: (e: Event) => e.stopPropagation(),
            onKeydown: (e: Event) => e.stopPropagation(),
            onPointermove: notifyBlockHover,
            onPointerenter: notifyBlockHover,
            onPointerover: notifyBlockHover,
            onPointerleave: stopBlockHover,
          },
          h(Comp, {
            ...componentProps,
            readOnly: readOnly.value,
            blockUuid: currentNode.attrs.uuid as string,
            // 结构化块（表格/任务）一次要改多个字段，所以除两个历史通道外再给一个通用 patch 通道
            onUpdateProps: (patch: Record<string, any>) => updateComponentProps(patch),
            'onUpdate:modelValue': (value: string) => updateComponentProps({ modelValue: value }),
            'onUpdate:language': (value: string) => updateComponentProps({ language: value }),
            style: {
              ...(componentProps.style || {}),
              width: '100%',
              height: '100%',
            },
          })
        )

        // ResizableContainer 以 null 表示无限制，这里始终传数字以确保限制生效
        return h(
          ResizableContainer,
          {
            width: currentNode.attrs.width,
            height: currentNode.attrs.height,
            icon: blockIcon.value,
            title: blockTitle.value,
            aspectRatio: aspectRatio ?? undefined,
            minWidth: state.constraints.minWidth,
            maxWidth: effectiveMaxWidth.value,
            minHeight: state.constraints.minHeight,
            maxHeight: state.constraints.maxHeight,
            readOnly: readOnly.value,
            onResize: handleResize,
            onExtract: handleExtract,
            content: innerContent,
          }
        )
      }
    },
  }) as any,
})