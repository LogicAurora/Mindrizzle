import { inject, ref, type InjectionKey, type Ref } from 'vue';

// 页面会把页头 teleport 进顶栏，隐藏的 tab 也在挂载状态，所以得由外壳告诉页面自己是不是当前 tab
export const settingsTabActiveKey: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol('settings-tab-active');

export const useSettingsTabActive = () => inject(settingsTabActiveKey, ref(true));
