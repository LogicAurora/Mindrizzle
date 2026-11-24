import type { Ref } from 'vue';
import type { TourStep } from '../useTourKit';
import { waitForClick, waitForCondition } from '../tourHelpers';

export interface NoteSetsTourState {
  activeSectionId: Ref<string>;
  isSelectMode: Ref<boolean>;
  exitSelectMode: () => void;
}

export function createNoteSetsTourSteps(state: NoteSetsTourState): TourStep[] {
  const entrySectionId = state.activeSectionId.value;

  return [
    {
      id: 'welcome',
      title: '欢迎使用便签集',
      content: '这里是所有笔记的列表。花一分钟了解工作区、排序、筛选和多选。',
      placement: 'center',
    },
    {
      id: 'workspace',
      target: '[data-tour="notes-workspace"]',
      title: '工作区',
      content: '点击这里切换工作区，按项目或主题组织你的笔记。',
      placement: 'bottom',
      waitingText: '请点击工作区并选择另一个目录（10 秒后自动继续）',
      isReady: ({ tour }) =>
        waitForCondition(() => state.activeSectionId.value !== entrySectionId, tour, {
          timeout: 10000,
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
      // 多选按钮点击后会从 DOM 移除，不能作为交互步骤的目标；
      // 用稳定的工具栏容器锚定卡片，再用 waitForClick 监听按钮
      target: '#toolbar-actions',
      title: '多选',
      content: '点击工具栏中的多选按钮进入多选模式，可批量复制或删除便签。',
      placement: 'bottom',
      waitingText: '请点击多选按钮（进入多选后会自动退出）',
      isReady: async ({ tour }) => {
        const ok = await waitForClick('[data-tour="notes-select"]', tour);
        if (ok) {
          // 退出多选，让下一步展示正常卡片；不自动前进，用户点“下一步”
          state.exitSelectMode();
        }
        return ok;
      },
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
      content: '现在你可以自由管理便签了。随时从右上角重新打开引导。',
      placement: 'center',
    },
  ];
}
