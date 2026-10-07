<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import about from './SettingTabs/About.vue'
import appearance from './SettingTabs/Appearance.vue'
import interfaceTab from './SettingTabs/Interface.vue'

const SETTINGS_TABS = [
  { value: 'about', label: '关于', component: about },
  { value: 'appearance', label: '外观', component: appearance },
  { value: 'interface', label: '界面', component: interfaceTab },
] as const
const DEFAULT_SETTINGS_TAB = SETTINGS_TABS[0].value

type SettingsTabValue = typeof SETTINGS_TABS[number]['value']

const route = useRoute()

// tab 只从路由入参取初值：写回路由会让 App.vue 的 :key="route.path" 重建整个设置页，切 tab 的滑窗动画就没了
const tab = ref<SettingsTabValue>(resolveSettingsTab(route.params.tab))

function resolveSettingsTab(value: unknown): SettingsTabValue {
  const matched = SETTINGS_TABS.find((item) => item.value === value)
  return matched?.value ?? DEFAULT_SETTINGS_TAB
}
</script>

<template>
  <v-sheet elevation="4" class="settings-host">
    <!-- tab 行进工具栏（App.vue 的 #toolbar-tabs）；defer 等 App 的 DOM 就绪，align-tabs="title" 让它与上方标题同左缘 -->
    <Teleport to="#toolbar-tabs" defer>
      <v-tabs v-model="tab" class="settings-tabs" align-tabs="title" color="white" slider-color="white"
        density="compact">
        <v-tab v-for="item in SETTINGS_TABS" :key="item.value" :value="item.value">{{ item.label }}</v-tab>
      </v-tabs>
    </Teleport>

    <v-tabs-window v-model="tab" class="settings-window">
      <v-tabs-window-item v-for="item in SETTINGS_TABS" :key="item.value" :value="item.value">
        <component :is="item.component" />
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

/* 面板自身滚动：v-main 当滚动容器时，下面这层 overflow:hidden 会把 tab 里的粘性页头钉在它不滚的盒子里 */
.settings-window :deep(.v-window__container),
.settings-window :deep(.v-window-item) {
  height: 100%;
}
</style>
