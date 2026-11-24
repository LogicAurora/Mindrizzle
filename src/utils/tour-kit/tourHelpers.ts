import type { TourKitReturn } from './useTourKit';

/**
 * 等待选择器对应的元素被点击。
 * - 元素尚未渲染（Teleport defer / 懒加载）：轮询等待，不再秒回 true；
 * - 元素在超时时间内一直不存在：放行（返回 true），避免教程卡死；
 * - 教程被 stop()：通过 cleanup 取消监听并 resolve(false)。
 */
export function waitForClick(
  selector: string,
  tour: TourKitReturn,
  { timeout = 15000, interval = 100 }: { timeout?: number; interval?: number } = {},
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    let controller: AbortController | null = null;
    let timer: number | null = null;
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      controller?.abort();
      controller = null;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      resolve(result);
    };

    const attach = () => {
      if (settled) return;
      const el = document.querySelector(selector);
      if (!el) {
        if (Date.now() - startedAt >= timeout) {
          // 目标一直没出现：放行，避免永久卡住
          finish(true);
          return;
        }
        timer = window.setTimeout(attach, interval);
        return;
      }
      controller = new AbortController();
      el.addEventListener('click', () => finish(true), {
        signal: controller.signal,
        once: true,
      });
    };

    tour._registerCleanup(() => finish(false));

    attach();
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
