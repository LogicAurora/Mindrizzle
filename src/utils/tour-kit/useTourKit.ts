import { createTour } from '@vuetify/v0';
import { getCurrentScope, onScopeDispose, provide, watch, type Ref } from 'vue';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  id: string;
  /** CSS 选择器，或返回元素的函数，或返回 Promise 的函数 */
  target?: string | (() => Element | null) | (() => Promise<Element | null>);
  title?: string;
  content?: string;
  placement?: TourPlacement;
  /** 目标不存在时静默跳过，默认 true */
  skipIfMissing?: boolean;
  /** 是否滚动目标进入视野，默认 true */
  scroll?: boolean;
  /**
   * 自定义就绪判定。返回 false 或 Promise<false> 时步骤保持未就绪；
   * 返回 true 时自动就绪。未提供时步骤在激活后立即可推进。
   */
  isReady?: (ctx: { tour: TourKitReturn; visit: number }) => boolean | Promise<boolean>;
}

export interface TourKitOptions {
  steps: TourStep[];
}

/** 完成 / 退出回调；返回的取消函数用于在组件卸载或不再需要时移除订阅 */
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
  /**
   * 注册完成回调，返回取消订阅函数。
   * 仅在引导真正完成时触发（最后一步完成 / 显式 complete()），
   * 用户提前 stop() 不会触发；同一轮运行内至多触发一次。
   */
  onComplete: (fn: TourCompleteHandler) => () => void;
  /**
   * 注册退出回调（用户跳过 / 按 Esc / 调用 stop()）。
   * 与 onComplete 互斥：同一轮运行只会触发其中一个。
   */
  onExit: (fn: TourLifecycleHandler) => () => void;
  state: {
    isActive: Readonly<Ref<boolean>>;
    isReady: Readonly<Ref<boolean>>;
    isFirst: Readonly<Ref<boolean>>;
    isLast: Readonly<Ref<boolean>>;
    canGoNext: Readonly<Ref<boolean>>;
    canGoBack: Readonly<Ref<boolean>>;
    total: Number;
  };
  /** 供 TourKitLayer 内部使用，业务代码不应直接依赖 */
  _tour: ReturnType<typeof createTour>;
  _steps: TourStep[];
  /** 注册副作用清理函数，stop() 时统一执行 */
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

  provide('v0:tour', tour);

  // 一轮运行内 complete 与 exit 只通知一次，避免包装层与底层双触发
  let completedInCurrentRun = false;
  let notifiedInCurrentRun = false;
  // 底层没有 onComplete 钩子，Esc / Tour.Skip / 直接 stop() 都会绕过包装层，
  // 因此统一由 isActive 落回 false 时收尾，保证跳过也能被业务感知
  let roundActive = false;

  let tourKitReturn: TourKitReturn;

  function emit(handlers: Set<TourLifecycleHandler>, label: string) {
    if (notifiedInCurrentRun) return;
    notifiedInCurrentRun = true;
    // 复制一份再遍历：回调里取消订阅或重新 start 都不影响本轮通知
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

  const tickets = options.steps.map((step) => {
    // v0 的 onboard 会复制 ticket，中途再改 noActivator 不会同步到注册表，必须在注册前定好
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
        // 1. 无目标：居中显示卡片（noActivator 已在注册前声明）
        if (!step.target) {
          done();
          if (!step.isReady) tour.ready(step.id, visit);
          return;
        }

        // 2. 解析并激活目标
        const el = await resolveTarget(step.target);

        if (el) {
          activate(el, { scroll: step.scroll !== false });
          done();
        } else if (step.skipIfMissing !== false) {
          // 目标不存在且允许跳过：先就绪再前进
          done();
          tour.ready(step.id, visit);
          await tour.next();
          return;
        } else {
          // 目标不存在且不允许跳过：停留在未就绪状态
          done();
          return;
        }

        // 3. 无交互要求：立即可推进
        if (!step.isReady) {
          tour.ready(step.id, visit);
          return;
        }

        // 4. 有交互要求：等待用户逻辑决定何时就绪
        try {
          const ready = await step.isReady({ tour: tourKitReturn, visit });
          if (ready) tour.ready(step.id, visit);
        } catch (e) {
          console.warn(`[tour-kit] isReady failed for step "${step.id}"`, e);
          // 异常时放行，避免用户因意外错误永久卡住
          tour.ready(step.id, visit);
        }
      },
    };
    return ticket;
  });

  tour.steps.onboard(tickets as any);

  // 底层没有完成钩子，只能靠 isActive 回落来收尾；完成标记先行置位，
  // 因此正常完成不会误报 onExit
  watch(tour.isActive, (active) => {
    if (active) {
      roundActive = true;
      return;
    }
    if (!roundActive) return;
    roundActive = false;
    flushCleanups();
    emit(exitHandlers, 'onExit');
  });

  // 组件卸载 / effectScope 销毁时清空订阅，避免旧实例残留
  if (getCurrentScope()) {
    onScopeDispose(() => {
      flushCleanups();
      completeHandlers.clear();
      exitHandlers.clear();
    });
  }

  const start = (opts?: { stepId?: string }) => {
    // 新一轮运行：重置标记，允许本轮完成 / 退出时再次通知
    completedInCurrentRun = false;
    notifiedInCurrentRun = false;
    tour.start(opts);
  };

  const stop = () => {
    flushCleanups();
    tour.stop();
  };

  const complete = () => {
    if (completedInCurrentRun) return;
    // 先标记再调用：底层 complete 是异步的，isActive 回落时不能误判成“跳过”
    completedInCurrentRun = true;
    try {
      tour.complete();
    } catch (error) {
      // 底层在非激活状态下 complete 可能抛错，此时不应通知“完成”
      completedInCurrentRun = false;
      console.warn('[tour-kit] complete() failed', error);
      return;
    }
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
    ready: tour.ready,
    onComplete: (fn) => {
      completeHandlers.add(fn);
      return () => {
        completeHandlers.delete(fn);
      };
    },
    onExit: (fn) => {
      exitHandlers.add(fn);
      return () => {
        exitHandlers.delete(fn);
      };
    },
    state: {
      isActive: tour.isActive,
      isReady: tour.isReady,
      isFirst: tour.isFirst,
      isLast: tour.isLast,
      canGoNext: tour.canGoNext,
      canGoBack: tour.canGoBack,
      total: tour.total,
    },
    _tour: tour,
    _steps: options.steps,
    _registerCleanup: (fn: () => void) => pendingCleanups.add(fn),
  };

  return tourKitReturn;
}
