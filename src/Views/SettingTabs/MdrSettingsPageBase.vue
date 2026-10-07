<script setup lang="ts">
import { ref } from 'vue'

const COMPACT_ENTER_SCROLL = 24
const COMPACT_EXIT_SCROLL = 6

defineProps<{
  title?: string
  subtitle?: string
  icon?: string
}>()

const isCompact = ref(false)

// 折叠会改内容高度，所以用双阈值防抖：单阈值时挤到临界点附近会反复翻转
function syncCompactState(event: Event) {
  const { scrollTop } = event.currentTarget as HTMLElement
  if (isCompact.value) {
    if (scrollTop <= COMPACT_EXIT_SCROLL) isCompact.value = false
    return
  }
  if (scrollTop > COMPACT_ENTER_SCROLL) isCompact.value = true
}
</script>

<template>
  <v-sheet color="surface" class="settings-page" @scroll.passive="syncCompactState">
    <v-container class="settings-page-inner" :class="{ 'settings-page-inner--custom-header': !!$slots.header }">
      <slot name="header">
        <header v-if="title" class="settings-page-header" :class="{ 'is-compact': isCompact }">
          <div>
            <h1 class="settings-page-title">{{ title }}</h1>
            <p v-if="subtitle" class="settings-page-caption">{{ subtitle }}</p>
          </div>
          <v-icon v-if="icon" :icon="icon" color="primary" :size="isCompact ? 22 : 28" />
        </header>
      </slot>
      <slot />
    </v-container>
  </v-sheet>
</template>

<style scoped>
/* 面板自己滚（Settings.vue 给足高度），页头才能 sticky 在这里；v-main 滚动时会被 v-window 的 overflow:hidden 吃掉粘性 */
.settings-page {
  height: 100%;
  overflow-y: auto;
  /* 关掉滚动锚定：折叠页头会改内容高度，锚定又把 scrollTop 拽回阈值另一侧，状态就来回闪 */
  overflow-anchor: none;
  scrollbar-width: none;
}

.settings-page::-webkit-scrollbar {
  display: none;
}

.settings-page-inner {
  max-width: 960px;
  /* 上下内边距不写在容器上：页头要贴住面板顶边才能一滚就钉住 */
  padding: 0 16px 24px;
}

.settings-page-inner--custom-header {
  padding-top: 20px;
}

.settings-page-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-inline: -16px;
  padding: 16px;
  border-bottom: 1px solid transparent;
  background: rgb(var(--v-theme-surface));
  transition: padding 160ms ease, border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}

/* 折叠后要跟下面滚动的内容区分开：底色掺主色 + 主色描边 + 抬起的阴影，三层一起才像“吸住的条” */
.settings-page-header.is-compact {
  padding-top: 6px;
  padding-bottom: 6px;
  background-color: color-mix(in srgb, rgb(var(--v-theme-primary)) 18%, rgb(var(--v-theme-surface)));
  border-bottom-color: color-mix(in srgb, rgb(var(--v-theme-primary)) 40%, transparent);
  box-shadow: 0 6px 16px -8px rgba(var(--v-theme-on-surface), 0.35);
}

.settings-page-title {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 500;
  line-height: 1.2;
  transition: font-size 160ms ease;
}

.settings-page-caption {
  margin: 4px 0 0;
  max-height: 40px;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.875rem;
  line-height: 1.5;
  transition: max-height 160ms ease, margin-top 160ms ease, opacity 120ms ease;
}

.settings-page-header.is-compact .settings-page-caption {
  margin-top: 0;
  max-height: 0;
  opacity: 0;
}

.settings-page-header.is-compact .settings-page-title {
  font-size: 1rem;
}

/* 各 tab 分节统一用 .settings-section 系列类名，样式由这里下发：:slotted 只会给 slot 顶层节点打标记，所以分节必须包在 section 里 */
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

  .settings-page-header {
    padding: 24px 16px 14px;
  }

  .settings-page-header.is-compact {
    padding-top: 6px;
    padding-bottom: 6px;
  }
}
</style>
