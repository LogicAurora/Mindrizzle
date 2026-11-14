// SPDX-License-Identifier: MIT
import { onBeforeUnmount, ref } from 'vue';

export const SECRET_KNOCK_TARGET = 7;
// 停手过久说明不是有意的连点，静默清零重新计数
const KNOCK_RESET_DELAY = 2_500;
// 效果播完就收回，否则会一直盖着界面
const EFFECT_DURATION = 5_000;

const KONAMI_SEQUENCE = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
];

const DRIZZLE_WORD = 'drizzle';
const KEY_BUFFER_LIMIT = Math.max(KONAMI_SEQUENCE.length, DRIZZLE_WORD.length);

export type EasterEggEffect = 'rain' | 'rainbow';

type SecretHandlers = {
  onKonami: () => void;
  onDrizzle: () => void;
};

export const activeEasterEggEffect = ref<EasterEggEffect | null>(null);
let effectTimer: number | undefined;

export function playEasterEgg(effect: EasterEggEffect): void {
  activeEasterEggEffect.value = effect;
  if (effectTimer !== undefined) window.clearTimeout(effectTimer);
  effectTimer = window.setTimeout(() => {
    effectTimer = undefined;
    activeEasterEggEffect.value = null;
  }, EFFECT_DURATION);
}

export function useSecretKnock(onUnlock: () => void): () => void {
  let knockCount = 0;
  let resetTimer: number | undefined;

  const restartResetTimer = () => {
    if (resetTimer !== undefined) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      resetTimer = undefined;
      knockCount = 0;
    }, KNOCK_RESET_DELAY);
  };

  const knock = () => {
    knockCount += 1;
    if (knockCount < SECRET_KNOCK_TARGET) {
      restartResetTimer();
      return;
    }
    knockCount = 0;
    if (resetTimer !== undefined) window.clearTimeout(resetTimer);
    resetTimer = undefined;
    onUnlock();
  };

  onBeforeUnmount(() => {
    if (resetTimer !== undefined) window.clearTimeout(resetTimer);
  });

  return knock;
}

function matchesKonami(keys: string[]): boolean {
  if (keys.length !== KONAMI_SEQUENCE.length) return false;
  return keys.every((key, index) => key === KONAMI_SEQUENCE[index]);
}

export function attachSecretKeyboard(handlers: SecretHandlers): () => void {
  const typedKeys: string[] = [];

  const onKeyDown = (event: KeyboardEvent) => {
    // 带修饰键的组合交给快捷键，避免误触彩蛋
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    typedKeys.push(event.key.toLowerCase());
    if (typedKeys.length > KEY_BUFFER_LIMIT) typedKeys.shift();
    if (matchesKonami(typedKeys)) {
      typedKeys.length = 0;
      handlers.onKonami();
      return;
    }
    if (!typedKeys.join('').endsWith(DRIZZLE_WORD)) return;
    typedKeys.length = 0;
    handlers.onDrizzle();
  };

  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}
