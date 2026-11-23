import type { TourKitReturn } from './useTourKit';

/**
 * 等待选择器对应的元素被点击。
 * - 元素不存在：立即放行（返回 true），避免教程卡死；
 * - 教程被 stop()：通过 cleanup 取消监听并 resolve(false)；
 * - 适合按钮类交互，不适用于会打开模态框后遮挡教程卡片的场景。
 */
export function waitForClick(selector: string, tour: TourKitReturn): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const el = document.querySelector(selector);
    if (!el) {
      resolve(true);
      return;
    }
    const controller = new AbortController();
    el.addEventListener(
      'click',
      () => {
        controller.abort();
        resolve(true);
      },
      { signal: controller.signal, once: true },
    );
    tour._registerCleanup(() => {
      controller.abort();
      resolve(false);
    });
  });
}

/**
 * 等待某个响应式条件为真（轮询式）。
 * 适合“切换工作区 / 进入多选”等状态变化，而不是模态框打开。
 */
export function waitForCondition(
  check: () => boolean,
  tour: TourKitReturn,
  { timeout = 15000, interval = 120 }: { timeout?: number; interval?: number } = {},
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (check()) {
      resolve(true);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (check()) {
        cleanup();
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeout) {
        cleanup();
        // 超时放行，避免用户卡死；需要严格时在调用方自行处理
        resolve(true);
      }
    }, interval);

    const cleanup = () => {
      window.clearInterval(timer);
    };

    tour._registerCleanup(() => {
      cleanup();
      resolve(false);
    });
  });
}
