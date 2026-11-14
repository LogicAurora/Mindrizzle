import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import 'vuetify/styles';
import { md3 } from 'vuetify/blueprints';
import { VLoadingIndicator } from 'vuetify/labs/VLoadingIndicator';
import { VCommandPalette } from 'vuetify/labs/VCommandPalette';

const vuetify = createVuetify({
  components: {
    VLoadingIndicator,
    VCommandPalette,
  },
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
  blueprint: md3,
  defaults: {
    global: {
      density: 'comfortable',
    },
  },
});

export const defaultThemes = {
  light: {
    ...vuetify.theme.themes.value.light,
    colors: { ...vuetify.theme.themes.value.light.colors },
  },
  dark: {
    ...vuetify.theme.themes.value.dark,
    colors: { ...vuetify.theme.themes.value.dark.colors },
  },
};

export default vuetify;
