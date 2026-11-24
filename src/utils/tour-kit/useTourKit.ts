import { createStackContext, createTour } from '@vuetify/v0';
import { computed, getCurrentScope, onScopeDispose, provide, ref, watch, type Ref } from 'vue';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  id: string;
  target?: string | (() => Element | null) | (() => Promise<Element | null>);
  title?: string;
  content?: string;
  placement?: TourPlacement;
  skipIfMissing?: boolean;
  scroll?: boolean;
  isReady?: (ctx: { tour: TourKitReturn; visit: number }) => boolean | Promise<boolean>;
  blockTarget?: boolean;
  waitingText?: string;
}

export interface TourKitOptions {
  steps: TourStep[];
  /**
   * 引导遮罩与卡片的 z-index 基准值。
   * 不要抬到 Vuetify 覆盖层区间（默认从 2000 起），否则交互步骤里弹出的
   * 菜单/对话框会被引导卡片盖住（如工作区下拉）。
   */
  zIndex?: number;
}

// Vuetify 的 v-menu / v-dialog 等覆盖层默认从 2000 起叠加，引导必须压在其下；
// 同时要高过页面自身的浮层（导航抽屉 1004、画布浮层最高 2110 但不在引导页面）
const TOUR_BASE_Z_INDEX = 1900;

export type TourLifecycleHandler = () => void;
export type TourCompleteHandler = TourLifecycleHandler;

export interface TourKitReturn {
  start: (opts?: { stepId?: string }) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  complete: () => void;
  reset: () => void;
  step: (n: number) => void;
  ready: (stepId: string, visit: number) => void;
  onComplete: (fn: TourCompleteHandler) => () => void;
  onExit: (fn: TourLifecycleHandler) => () => void;
  state: {
    isActive: Readonly<Ref<boolean>>;
    isReady: Readonly<Ref<boolean>>;
    isFirst: Readonly<Ref<boolean>>;
    isLast: Readonly<Ref<boolean>>;
    canGoNext: Readonly<Ref<boolean>>;
    canGoBack: Readonly<Ref<boolean>>;
    total: number;
  };
  _tour: ReturnType<typeof createTour>;
  _steps: TourStep[];
  _registerCleanup: (fn: () => void) => void;
}

const TARGET_TIMEOUT = 1500;
const TARGET_POLL = 80;

async function resolveTarget(target: NonNullable<TourStep['target']>): Promise<Element | null> {
  if (typeof target === 'function') {
    const r = target();
    return r instanceof Promise ? r : r;
  }

  const immediate = document.querySelector(target);
  if (immediate) return immediate;

  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const el = document.querySelector(target);
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (Date.now() - start >= TARGET_TIMEOUT) {
        clearInterval(timer);
        resolve(null);
      }
    }, TARGET_POLL);
  });
}

export function useTourKit(options: TourKitOptions): TourKitReturn {
  const tour = createTour();
  const pendingCleanups = new Set<() => void>();
  const completeHandlers = new Set<TourLifecycleHandler>();
  const exitHandlers = new Set<TourLifecycleHandler>();

  // 当前步骤是否就绪。不依赖底层 tour.isReady：Vuetify0 在步骤切换时
  // 不保证重置 isReady，上一步 ready 后下一步仍为 true，导致
  // waitingText 不显示、按钮不禁用、交互步骤被"下一步"直接绕过。
  const currentReady = ref(false);
  const canGoNext = computed(() => currentReady.value);
  const canGoBack = computed(() => !tour.isFirst.value);

  provide('v0:tour', tour);

  // v0 的遮罩与卡片各自通过 Portal 注册到 v0 的 z-index 栈，默认基准 2000
  // 与 Vuetify 覆盖层同层，卡片会盖住步骤中弹出的菜单；这里换成更低一档的独立栈
  const [, provideStack] = createStackContext({ baseZIndex: options.zIndex ?? TOUR_BASE_Z_INDEX });
  provideStack();

  let completedInCurrentRun = false;
  let notifiedInCurrentRun = false;
  let roundActive = false;
  let activeBlock: { el: Element; controller: AbortController } | null = null;

  let tourKitReturn: TourKitReturn;

  function emit(handlers: Set<TourLifecycleHandler>, label: string) {
    if (notifiedInCurrentRun) return;
    notifiedInCurrentRun = true;
    for (const handler of [...handlers]) {
      try {
        handler();
      } catch (error) {
        console.warn(`[tour-kit] ${label} handler failed`, error);
      }
    }
  }

  const flushCleanups = () => {
    for (const fn of pendingCleanups) fn();
    pendingCleanups.clear();
  };

  const unblockTarget = () => {
    if (!activeBlock) return;
    activeBlock.controller.abort();
    activeBlock.el.classList.remove('tour-target-blocked');
    activeBlock = null;
  };

  const blockTarget = (el: Element) => {
    unblockTarget();
    const controller = new AbortController();
    const prevent = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (el === target || el.contains(target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const opts: AddEventListenerOptions = { capture: true, signal: controller.signal };
    document.addEventListener('click', prevent, opts);
    document.addEventListener('mousedown', prevent, opts);
    document.addEventListener('pointerdown', prevent, opts);
    document.addEventListener('touchstart', prevent, { ...opts, passive: false });
    el.classList.add('tour-target-blocked');
    activeBlock = { el, controller };
  };

  const markReady = (stepId: string, visit: number) => {
    tour.ready(stepId, visit);
    currentReady.value = true;
  };

  const tickets = options.steps.map((step) => {
    const ticket: Record<string, unknown> = {
      id: step.id,
      noActivator: !step.target,
      placement: step.placement ?? 'bottom',
      enter: async ({
        done,
        activate,
        visit,
      }: {
        done: () => void;
        activate: (el: Element, opts?: { scroll?: boolean }) => void;
        visit: number;
      }) => {
        unblockTarget();
        // 进入新步骤：先标记未就绪，waitingText 由此显示
        currentReady.value = false;

        if (!step.target) {
          done();
          if (!step.isReady) markReady(step.id, visit);
          return;
        }

        const el = await resolveTarget(step.target);

        if (el) {
          activate(el, { scroll: step.scroll !== false });
          const shouldBlock = step.blockTarget ?? !step.isReady;
          if (shouldBlock) blockTarget(el);
          done();
        } else if (step.skipIfMissing !== false) {
          done();
          markReady(step.id, visit);
          await tour.next();
          return;
        } else {
          done();
          if (!step.isReady) return;
        }

        if (!step.isReady) {
          markReady(step.id, visit);
          return;
        }

        try {
          const ready = await step.isReady({ tour: tourKitReturn, visit });
          if (ready) markReady(step.id, visit);
        } catch (e) {
          console.warn(`[tour-kit] isReady failed for step "${step.id}"`, e);
          markReady(step.id, visit);
        }
      },
    };
    return ticket;
  });

  tour.steps.onboard(tickets as any);

  watch(tour.isActive, (active) => {
    if (active) {
      roundActive = true;
      return;
    }
    unblockTarget();
    currentReady.value = false;
    if (!roundActive) return;
    roundActive = false;
    flushCleanups();
    emit(exitHandlers, 'onExit');
  });

  if (getCurrentScope()) {
    onScopeDispose(() => {
      unblockTarget();
      flushCleanups();
      completeHandlers.clear();
      exitHandlers.clear();
    });
  }

  const start = (opts?: { stepId?: string }) => {
    completedInCurrentRun = false;
    notifiedInCurrentRun = false;
    currentReady.value = false;
    tour.start(opts);
  };

  const stop = () => {
    unblockTarget();
    currentReady.value = false;
    flushCleanups();
    tour.stop();
  };

  const complete = () => {
    if (completedInCurrentRun) return;
    completedInCurrentRun = true;
    try {
      tour.complete();
    } catch (error) {
      completedInCurrentRun = false;
      console.warn('[tour-kit] complete() failed', error);
      return;
    }
    unblockTarget();
    emit(completeHandlers, 'onComplete');
  };

  tourKitReturn = {
    start,
    next: tour.next,
    prev: tour.prev,
    stop,
    complete,
    reset: tour.reset,
    step: tour.step,
    ready: (stepId, visit) => {
      tour.ready(stepId, visit);
      currentReady.value = true;
    },
    onComplete: (fn) => {
      completeHandlers.add(fn);
      return () => completeHandlers.delete(fn);
    },
    onExit: (fn) => {
      exitHandlers.add(fn);
      return () => exitHandlers.delete(fn);
    },
    state: {
      isActive: tour.isActive,
      isReady: currentReady,
      isFirst: tour.isFirst,
      isLast: tour.isLast,
      canGoNext,
      canGoBack,
      total: tour.total,
    },
    _tour: tour,
    _steps: options.steps,
    _registerCleanup: (fn: () => void) => pendingCleanups.add(fn),
  };

  return tourKitReturn;
}
