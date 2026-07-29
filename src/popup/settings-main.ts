import { createApp } from 'vue';
import App from './App.vue';
import '../assets/styles/main.scss';
import { getSettings } from '../services/storage';
import { loadLocale, useI18n } from '../composables/useI18n';
import { resolveLocaleDirectory } from '../services/settingsRules';

async function initTitle(): Promise<void> {
  try {
    const s = await getSettings();
    const lang = resolveLocaleDirectory(s.language, browser.i18n.getUILanguage());
    await loadLocale(lang);
    const { t } = useI18n();
    document.title = t('appName');
  } catch {
    document.title = browser.i18n.getMessage('appName') || 'ClashVergeLink';
  }
}

void initTitle();

const app = createApp(App);
app.mount('#app');
