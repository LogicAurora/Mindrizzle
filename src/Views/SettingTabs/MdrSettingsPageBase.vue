<script setup lang="ts">
import { computed } from 'vue';

import { titleRollDirection } from '../../utils/uiPreference';
import { useSettingsTabActive } from './settingsTabContext';

defineProps<{
  title?: string;
  subtitle?: string;
  icon?: string;
}>();

const isActive = useSettingsTabActive();
const rollName = computed(() =>
  titleRollDirection.value === 'top-down' ? 'title-roll-down' : 'title-roll-up',
);
</script>

<template>
  <v-sheet color="surface" class="settings-page">
    <!-- 页头 teleport 进顶栏（App.vue 的 #toolbar-page-header）：只有当前 tab 那份渲染，切 tab 时旧的滚出、新的滚入 -->
    <Teleport to="#toolbar-page-header" defer>
      <Transition :name="rollName" appear>
        <div v-if="isActive && title" class="settings-page-heading">
          <h1 class="settings-page-title">{{ title }}</h1>
          <p v-if="subtitle" class="settings-page-caption">{{ subtitle }}</p>
          <v-icon
            v-if="icon"
            :icon="icon"
            class="settings-page-icon"
            size="18"
            aria-hidden="true"
          />
        </div>
      </Transition>
    </Teleport>
    <v-container
      class="settings-page-inner"
      :class="{ 'settings-page-inner--custom-header': !!$slots.header }"
    >
      <slot name="header" />
      <slot />
    </v-container>
  </v-sheet>
</template>

<style scoped>
/* 面板自己滚（Settings.vue 给足高度），v-main 滚动时会被 v-window 的 overflow:hidden 吃掉 */
.settings-page {
  --settings-content-width: 960px;
  --settings-gutter: 16px;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}

.settings-page::-webkit-scrollbar {
  display: none;
}

/* 顶栏里的页头：一行放下标题、说明和图标，白字跟 tab 行同左缘 */
.settings-page-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 16px 0 42px;
}

.settings-page-title {
  flex: none;
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
}

.settings-page-caption {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  opacity: 0.72;
  font-size: 0.75rem;
  line-height: 1.33;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-page-icon {
  flex: none;
  margin-inline-start: auto;
  opacity: 0.72;
}

.settings-page-inner {
  max-width: var(--settings-content-width);
  padding: 20px var(--settings-gutter) 24px;
}

/* 各 tab 分节统一用 .settings-section 系列类名，样式由这里下发：:slotted 只会给 slot 顶层节点打标记，所以分节必须包在 section 里 */
/* 相邻分节之间的留白与分隔线也在这一处生成，各 tab 不要再自己插 v-divider */
:slotted(.settings-section + .settings-section) {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

:slotted(.settings-section) .settings-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

:slotted(.settings-section) .settings-section-title {
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.4;
}

:slotted(.settings-section) .settings-section-caption {
  margin-top: 2px;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.875rem;
  line-height: 1.5;
}

@media (min-width: 600px) {
  .settings-page-inner--custom-header {
    padding-top: 28px;
  }
}
</style>
