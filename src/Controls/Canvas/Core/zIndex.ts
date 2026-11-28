// 画布叠加层 z-index 体系（全项目唯一事实来源）。
// CSS（scoped）无法引用 TS 常量，各处硬编码的 z-index 必须与本表一致，改动需同步：
// settingsDropdown 2110 > settingsMenu 2100 > textSelectionHandles 1013 > textSelectionToolbar 1012 > formatDetailPicker 1011 > formatModePicker 1010 > annotationEditor 1008 > annotationCatcher 1007 > blockLineHighlight 1006 > popup 1005 > 曲别针 1004 > 缩放手柄 1003 > 描边环 1002 > 拖拽栏 1001 > 选中块 1000 > annotation 990 > itemZLimit 500
export const Z_LAYER = {
  popup: 1005,
  // 批注画在所有普通块之上，但要压在描边环与拖拽栏之下，避免遮挡选中块的交互浮层
  annotation: 990,
  // 批注模式的绘制捕捉层挂在 .canvas-container，需盖住块但不能盖住左侧工具栏
  annotationCatcher: 1007,
  // 文本框编辑器要压过捕捉层，否则输入框收不到指针、点击还会穿透到画布触发其它操作
  annotationEditor: 1008,
  paperclip: 1004,
  resizeHandle: 1003,
  outline: 1002,
  dragHandle: 1001,
  selectedBlock: 1000,
  itemZLimit: 500,
  // 块设置菜单挂在 body 上（zoom 容器外），需压过所有画布浮层
  settingsMenu: 2100,
  // 设置项里的下拉菜单也挂在 body，必须高于设置菜单卡片，否则选项被卡片盖住点不到
  settingsDropdown: 2110,
  // 格式模式选择器挂在画布容器右侧，只需压过画布浮层
  formatModePicker: 1010,
  // 格式详情选择器的弹窗要压在主选择器之上，展开时才能完整可见
  formatDetailPicker: 1011,
  // 富文本选区工具栏使用画布同步变换浮层，需压过 SideToolbar 和块内浮层
  textSelectionToolbar: 1012,
  textSelectionHandles: 1013,
  // 富文本 hover 行高亮挂在 body，须压过画布内容但不能盖住右侧的选择器
  blockLineHighlight: 1006,
  appLoadingCurtain: 10002,
} as const;
