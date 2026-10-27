// 画布叠加层 z-index 体系（全项目唯一事实来源）。
// CSS（scoped）无法引用 TS 常量，各处硬编码的 z-index 必须与本表一致，改动需同步：
// settingsDropdown 2110 > settingsMenu 2100 > formatModePicker 1010 > blockLineHighlight 1006 > popup 1005 > 曲别针 1004 > 缩放手柄 1003 > 描边环 1002 > 拖拽栏 1001 > 选中块 1000 > itemZLimit 500
export const Z_LAYER = {
  popup: 1005,
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
  // 格式模式选择器挂在画布容器右上角，只需压过画布浮层
  formatModePicker: 1010,
  // 富文本 hover 行高亮挂在 body，须压过画布内容但不能盖住右上角的选择器
  blockLineHighlight: 1006,
  appLoadingCurtain: 10002,
} as const
