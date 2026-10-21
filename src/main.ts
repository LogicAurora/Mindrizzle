import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from './App.vue'
import vuetify from './Vuetify.ts'
import NoteSet from './Views/NoteSets.vue'
import { routeTransition } from './utils/routeTransition.ts'
import { loadEditorComponent } from './utils/editorRoute'
import { getSetting } from './utils/settingsStore'
import { APPEARANCE_SETTING_KEY, isAppearancePreference } from './utils/appearancePreference'
import { defaultThemes } from './Vuetify.ts'

const routes = [
  { path: '/', redirect: '/set' },
  { path: '/set', component: NoteSet, meta: { level: 1, title: '便签集' } },
  { path: '/board', component: () => import('./Views/NoteBoard.vue'), meta: { level: 2, title: '记事板' } },
  { path: '/editor/:fileName', name: 'editor', component: loadEditorComponent, meta: { level: 100, title: '编辑' } },
  { path: '/settings/:tab', component: () => import('./Views/Settings.vue'), meta: { level: 3, title: '设置', toolbarTabs: true } },
  { path: '/debug', component: () => import('./Views/Debug.vue'), meta: { level: 4, title: '调试' } },
]

const router = createRouter({
  history: createMemoryHistory(),
  routes,
})

router.beforeEach((to, from) => {
  const toLevel = (to.meta.level as number) ?? 0
  const fromLevel = (from.meta.level as number) ?? 0

  if (toLevel > fromLevel) {
    routeTransition.value = 'VSlideXReverseTransition'
  } else if (toLevel < fromLevel) {
    routeTransition.value = 'VSlideXTransition'
  } else {
    routeTransition.value = 'VFadeTransition'
  }
})

// 匹配懒加载 chunk 取不到的错误文案
const CHUNK_LOAD_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed/
const CHUNK_RELOAD_KEY = 'mindrizzle:chunk-reload'

// 因构建产物更新后旧 chunk 必然 404、只能重载入口恢复，故生产环境限次重载，避免停在空白页
router.onError((error) => {
  if (!import.meta.env.PROD || !CHUNK_LOAD_ERROR.test(String(error))) return
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  window.location.reload()
})

router.afterEach(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY))

async function mountApplication() {
  try {
    const preference = await getSetting<unknown>(APPEARANCE_SETTING_KEY)
    if (isAppearancePreference(preference)) {
      applySavedColors(vuetify.theme.themes.value.light.colors, defaultThemes.light.colors, preference.lightColors)
      applySavedColors(vuetify.theme.themes.value.dark.colors, defaultThemes.dark.colors, preference.darkColors)
      await vuetify.theme.change(preference.theme, true)
    }
  } catch (error) {
    console.error('恢复外观设置失败：', error)
  }

  createApp(App).use(vuetify).use(router).mount('#app')
}

function applySavedColors(target: object, defaults: object, savedColors: Record<string, string | number>) {
  const validColors = Object.fromEntries(
    Object.entries(savedColors).filter(([name]) => Object.prototype.hasOwnProperty.call(defaults, name)),
  )
  Object.assign(target, validColors)
}

void mountApplication()