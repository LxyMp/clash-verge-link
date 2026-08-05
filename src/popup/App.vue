<script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue';
  import SettingsTab from './components/SettingsTab.vue';
  import { clashApi } from '../services/clashApi';
  import { getSettings } from '../services/storage';
  import { useI18n } from '../composables/useI18n';
  import { useTheme } from '../composables/useTheme';

  const { t } = useI18n();

  let ac = new AbortController();
  const connectionStatus = ref<'connected' | 'disconnected' | 'checking'>('checking');

  const theme = ref('system');

  getSettings().then((settings) => {
    theme.value = settings.theme || 'system';
  });
  const stopThemeWatch = useTheme(theme);

  onMounted(async () => {
    ac = new AbortController();
    const settings = await getSettings();
    clashApi.setConfig(settings.apiBaseUrl, settings.apiSecret);
    await checkConnection();
  });

  onUnmounted(() => {
    ac.abort();
    stopThemeWatch();
  });

  async function checkConnection(): Promise<void> {
    connectionStatus.value = 'checking';
    try {
      await clashApi.healthCheck(ac.signal);
      connectionStatus.value = 'connected';
    } catch {
      connectionStatus.value = 'disconnected';
    }
  }

  async function onSettingsSaved(connectionOk: boolean | null): Promise<void> {
    ac.abort();
    ac = new AbortController();
    const settings = await getSettings();
    theme.value = settings.theme || 'system';
    clashApi.setConfig(settings.apiBaseUrl, settings.apiSecret);
    if (connectionOk !== null) {
      connectionStatus.value = connectionOk ? 'connected' : 'disconnected';
    }
  }
</script>

<template>
  <div class="app-shell">
    <header class="header">
      <div class="header__left">
        <svg class="header__logo" width="20" height="20" viewBox="82 82 860 860" xmlns="http://www.w3.org/2000/svg">
          <path d="M511.5 82c-236.6 0-429 192.4-429 429 0 236.5 192.5 429 429 429 236.6 0 429-192.4 429-429 0-236.5-192.4-429-429-429z m377.6 403.8H734.3c-4-139.9-41.4-259.9-97.5-331.9C776.5 203 879 332 889.1 485.8z m-402.8-349v349h-147c5.5-175.5 68.6-322.6 147-349z m0 399.4v349c-78.4-26.4-141.4-173.5-147-349h147z m50.5 349v-349h147c-5.6 175.5-68.6 322.6-147 349z m0-399.4v-349c78.4 26.4 141.4 173.5 147 349h-147zM386.3 153.9c-56.1 72-93.5 192-97.5 331.9H133.9C144.1 332 246.5 203 386.3 153.9zM133.9 536.2h154.8c4 139.9 41.4 259.9 97.5 331.9C246.5 819 144.1 690 133.9 536.2z m502.8 331.9c56.1-72 93.5-192 97.5-331.9H889C879 690 776.5 819 636.7 868.1z" fill="#5F9BEB"/>
        </svg>
        <span class="header__title">ClashVergeLink</span>
        <span
          class="header__status"
          :class="`status--${connectionStatus}`"
          :title="connectionStatus === 'connected' ? t('connected') : t('disconnected')"
        ></span>
      </div>
    </header>

    <main class="main-content">
      <SettingsTab @settings-saved="onSettingsSaved" />
    </main>
  </div>
</template>

<style lang="scss" scoped>
  @use '../assets/styles/mixins' as mix;
  @use '../assets/styles/variables' as *;

  .app-shell {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--color-bg-primary);
  }

  .header {
    @include mix.flex-between(var(--space-md));
    height: var(--header-height);
    padding: 0 var(--space-xl);
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
    flex-shrink: 0;
  }
  .header__left {
    @include mix.flex-center(row, var(--space-sm));
    min-width: 0;
  }
  .header__logo {
    color: var(--color-accent);
    flex-shrink: 0;
  }
  .header__title {
    font-size: var(--font-size-lg);
    font-weight: 700;
  }
  .header__status {
    @include mix.status-dot(9px);
    &.status--connected {
      background: var(--color-success);
      box-shadow: 0 0 6px var(--color-success);
    }
    &.status--disconnected {
      background: var(--color-danger);
      box-shadow: 0 0 6px var(--color-danger);
    }
    &.status--checking {
      background: var(--color-warning);
      box-shadow: 0 0 6px var(--color-warning);
    }
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    @include mix.custom-scrollbar;
  }
</style>
