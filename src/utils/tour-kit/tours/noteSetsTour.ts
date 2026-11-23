import type { Ref } from 'vue';
import type { TourStep } from '../useTourKit';
import { waitForCondition } from '../tourHelpers';

export interface NoteSetsTourState {
  activeSectionId: Ref<string>;
  isSelectMode: Ref<boolean>;
}

export function createNoteSetsTourSteps(state: NoteSetsTourState): TourStep[] {
  const entrySectionId = state.activeSectionId.value;

  return [
    {
      id: 'welcome',
      title: '欢迎使用便签集',
      content: '这里是所有笔记的列表。花一分钟了解工作区、筛选和多选操作。',
      placement: 'center',
    },
    {
      id: 'workspace',
      target: '[data-tour="notes-workspace"]',
      title: '工作区',
      content: '点击这里切换工作区。请试着切换到另一个工作区（或先留在默认工作区）。',
      placement: 'bottom',
      skipIfMissing: false,
      isReady: ({ tour }) =>
        waitForCondition(() => state.activeSectionId.value !== entrySectionId, tour, {
          timeout: 20000,
        }),
    },
    {
      id: 'sort',
      target: '[data-tour="notes-sort"]',
      title: '排序',
      content: '按置顶优先、最近编辑、名称等排序。',
      placement: 'bottom',
    },
    {
      id: 'filter',
      target: '[data-tour="notes-filter"]',
      title: '筛选',
      content: '按标签、是否无标签、编辑时间筛选便签。',
      placement: 'bottom',
    },
    {
      id: 'select',
      target: '[data-tour="notes-select"]',
      title: '多选',
      content: '点击进入多选模式，可批量复制或删除。请试着点一下进入多选。',
      placement: 'bottom',
      skipIfMissing: false,
      isReady: ({ tour }) =>
        waitForCondition(() => state.isSelectMode.value === true, tour, { timeout: 20000 }),
    },
    {
      id: 'exit-select',
      target: '[data-tour="notes-select"]',
      title: '退出多选',
      content: '再次点击多选按钮（或点击空白处）可以退出多选。',
      placement: 'bottom',
      skipIfMissing: false,
      isReady: ({ tour }) =>
        waitForCondition(() => state.isSelectMode.value === false, tour, { timeout: 20000 }),
    },
    {
      id: 'card',
      target: '[data-tour="notes-card"]',
      title: '便签卡片',
      content: '点击整张卡片打开编辑器；右侧按钮可查看详情、编辑或打开更多操作。',
      placement: 'right',
    },
    {
      id: 'create',
      target: '[data-tour="notes-fab"]',
      title: '新建便签',
      content: '右下角的加号可以新建便签，也可以导入 .mdrf 文件。',
      placement: 'left',
    },
    {
      id: 'done',
      title: '完成了',
      content: '现在你可以自由管理便签了。随时从左上角重新打开引导。',
      placement: 'center',
    },
  ];
}
