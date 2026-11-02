import { inject, type InjectionKey } from "vue";

export interface ToolbarSelection {
  setSelection: (count: number, onExit: () => void) => void;
  clearSelection: () => void;
}

export const toolbarSelectionKey: InjectionKey<ToolbarSelection> =
  Symbol("toolbarSelection");

export function useToolbarSelection(): ToolbarSelection {
  const selection = inject(toolbarSelectionKey);
  if (!selection) throw new Error("toolbarSelection 未由 App.vue 提供");
  return selection;
}
