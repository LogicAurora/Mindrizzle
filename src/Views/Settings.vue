<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  mdiBug,
  mdiInformationOutline,
  mdiPalette,
  mdiSwapVertical,
  mdiTuneVariant,
} from '@mdi/js';

import about from './SettingTabs/About.vue';
import advanced from './SettingTabs/Advanced.vue';
import appearance from './SettingTabs/Appearance.vue';
import developer from './SettingTabs/Developer.vue';
import interfaceTab from './SettingTabs/Interface.vue';
import SettingsTabHost from './SettingTabs/SettingsTabHost.vue';
import { isDeveloperMode } from '../utils/developerMode';
import { pendingSettingsTab } from '../utils/settingsTabIntent';

const SETTINGS_TABS = [
  {
    value: 'about',
    label: '关于',
    component: about,
    icon: mdiInformationOutline,
  },
  {
    value: 'appearance',
    label: '外观',
    component: appearance,
    icon: mdiPalette,
  },
  {
    value: 'interface',
    label: '界面',
    component: interfaceTab,
    icon: mdiSwapVertical,
  },
  {
    value: 'advanced',
    label: '高级',
    component: advanced,
    icon: mdiTuneVariant,
  },
] as const;
const DEVELOPER_TAB = {
  value: 'developer',
  label: '开发者',
  component: developer,
  icon: mdiBug,
} as const;
const ALL_SETTINGS_TABS = [...SETTINGS_TABS, DEVELOPER_TAB] as const;
const DEFAULT_SETTINGS_TAB = SETTINGS_TABS[0].value;

type SettingsTabValue = (typeof ALL_SETTINGS_TABS)[number]['value'];

const visibleSettingsTabs = computed(() =>
  isDeveloperMode.value ? ALL_SETTINGS_TABS : SETTINGS_TABS,
);

const route = useRoute();

// tab 只从路由入参取初值：写回路由会让 App.vue 的 :key="route.path" 重建整个设置页，切 tab 的滑窗动画就没了
const tab = ref<SettingsTabValue>(resolveSettingsTab(route.params.tab));

function resolveSettingsTab(value: unknown): SettingsTabValue {
  const matched = ALL_SETTINGS_TABS.find((item) => item.value === value);
  if (!matched) return DEFAULT_SETTINGS_TAB;
  if (matched.value === DEVELOPER_TAB.value && !isDeveloperMode.value) return DEFAULT_SETTINGS_TAB;
  return matched.value;
}

// 关掉开发者模式后停在该 tab 会留下空白面板
watch(isDeveloperMode, (enabled) => {
  if (!enabled && tab.value === DEVELOPER_TAB.value) tab.value = DEFAULT_SETTINGS_TAB;
});

function isSettingsTabValue(value: unknown): value is SettingsTabValue {
  return ALL_SETTINGS_TABS.some((item) => item.value === value);
}

// 外部（关于页连点版本号）只能提“切哪个 tab”，切完立刻清掉，下次进入设置页不会又跳过去
watch(
  pendingSettingsTab,
  (value) => {
    if (value === null) return;
    pendingSettingsTab.value = null;
    if (isSettingsTabValue(value)) tab.value = value;
  },
  { immediate: true },
);
</script>

<template>
  <v-sheet elevation="4" class="settings-host">
    <!-- tab 行进工具栏（App.vue 的 #toolbar-tabs）；defer 等 App 的 DOM 就绪，align-tabs="title" 让它与上方标题同左缘 -->
    <Teleport to="#toolbar-tabs" defer>
      <v-tabs
        v-model="tab"
        class="settings-tabs"
        align-tabs="title"
        color="white"
        slider-color="white"
        density="compact"
      >
        <v-tab
          v-for="item in visibleSettingsTabs"
          :prepend-icon="item.icon"
          :key="item.value"
          :value="item.value"
          >{{ item.label }}</v-tab
        >
      </v-tabs>
    </Teleport>

    <v-tabs-window v-model="tab" class="settings-window">
      <v-tabs-window-item v-for="item in visibleSettingsTabs" :key="item.value" :value="item.value">
        <SettingsTabHost :active="tab === item.value">
          <component :is="item.component" />
        </SettingsTabHost>
      </v-tabs-window-item>
    </v-tabs-window>
  </v-sheet>
</template>

<style scoped>
.settings-host {
  height: 100%;
}

.settings-window {
  height: 100%;
}

/* v-window 默认按内容高度撑，设置页要自己滚，所以把窗口容器和每一项都钉成面板高度 */
.settings-window :deep(.v-window__container),
.settings-window :deep(.v-window-item) {
  height: 100%;
}
</style>
