import type { TourStep } from '../useTourKit';

export const homeTourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: '欢迎使用 Mindrizzle',
    content: '这是你的首页。花一分钟快速了解各个区域，之后随时可以从右上角重新打开引导。',
    placement: 'center',
  },
  {
    id: 'quick-open',
    target: '[data-tour="home-quick-open"]',
    title: '快速打开',
    content: '按 Ctrl/Cmd + K 或点击这里，搜索并打开任意笔记。',
    placement: 'bottom',
  },
  {
    id: 'new-file',
    target: '[data-tour="home-new-file"]',
    title: '新建文件',
    content: '点击这里创建新笔记，可以选择模板并添加标签。',
    placement: 'bottom',
  },
  {
    id: 'stats',
    target: '[data-tour="home-stats"]',
    title: '数据概览',
    content: '笔记总数、近 7 天操作、连续创作天数和近 90 天活跃天数一目了然。',
    placement: 'bottom',
  },
  {
    id: 'recent',
    target: '[data-tour="home-recent"]',
    title: '最近打开',
    content: '继续上次的思路。点击任意笔记即可回到编辑状态。',
    placement: 'right',
  },
  {
    id: 'tags',
    target: '[data-tour="home-tags"]',
    title: '标签云',
    content: '点击标签可以快速筛选便签集，找到相关主题。',
    placement: 'right',
  },
  {
    id: 'charts',
    target: '[data-tour="home-charts"]',
    title: '文件活动',
    content: '本周对比、活跃时段和月度趋势，帮你了解自己的创作节奏。',
    placement: 'left',
  },
  {
    id: 'pinned',
    target: '[data-tour="home-pinned"]',
    title: '收藏',
    content: '置顶重要笔记，随时从这里快速访问。',
    placement: 'left',
  },
  {
    id: 'heatmap',
    target: '[data-tour="home-heatmap"]',
    title: '创作热力图',
    content: '过去 90 天的文件活动一目了然，保持连续创作。',
    placement: 'left',
  },
  {
    id: 'workspace',
    target: '[data-tour="home-workspace"]',
    title: '工作区',
    content: '管理多个笔记目录，按项目或主题组织内容。',
    placement: 'left',
    // 网页端不渲染工作区卡片，skipIfMissing 默认 true，会自动跳过
  },
  {
    id: 'done',
    title: '准备好了',
    content: '开始记录吧！随时可以从右上角的“引导”按钮重新打开。',
    placement: 'center',
  },
];
