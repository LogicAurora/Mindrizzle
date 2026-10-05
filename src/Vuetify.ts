import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import 'vuetify/styles'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  defaults: {
    global: {
      density: 'comfortable',
    },
  },
})

export const defaultThemes = {
  light: { ...vuetify.theme.themes.value.light, colors: { ...vuetify.theme.themes.value.light.colors } },
  dark: { ...vuetify.theme.themes.value.dark, colors: { ...vuetify.theme.themes.value.dark.colors } },
}

export default vuetify