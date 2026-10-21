<script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted } from 'vue';
  import {
    Power,
    Settings,
    WifiOff,
    Loader2,
    RefreshCw,
    Zap,
    RotateCw,
    Square,
    ChevronDown,
  } from 'lucide-vue-next';
  import NodeItem from './components/NodeItem.vue';
  import { clashApi } from '../services/clashApi';
  import { getSettings } from '../services/storage';
  import { resolveLocaleDirectory } from '../services/settingsRules';
  import { delaySortWeight } from '../services/nodeSort';
  import { isSuccessfulResponse } from '../background/proxyState';
  import { useI18n, loadLocale } from '../composables/useI18n';
  import { useDelayTest } from '../composables/useDelayTest';
  import { useTheme } from '../composables/useTheme';
  import type { ProxyGroup as PG, ProxyNode, ClashMode } from '../types';

  const { t } = useI18n();

  let ac = new AbortController();

  const connectionStatus = ref<'connected' | 'disconnected' | 'checking'>('checking');
  const currentMode = ref<ClashMode>('rule');
  const proxyEnabled = ref(false);
  const errorMsg = ref('');

  const groups = ref<PG[]>([]);
  const proxies = ref<Record<string, ProxyNode>>({});
  const selectedGroup = ref('');
  const showGroupDropdown = ref(false);

  let testUrl = 'http://www.gstatic.com/generate_204';
  let testTimeout = 5000;
  let testConcurrency = 5;

  const { delays, testingNodes, testingAll, isAnyTesting, testNode, toggleTestAll, abortAll } =
    useDelayTest({
      getSignal: () => ac.signal,
      getNodes: () => sortedNodes.value,
      getConfig: () => ({ timeout: testTimeout, url: testUrl, concurrency: testConcurrency }),
    });

  const toast = ref('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(msg: string): void {
    toast.value = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = '';
    }, 2000);
  }

  const theme = ref('system');
  // 初始化主题（尽早应用，避免闪烁；useTheme 会在 ref 变化时重新应用）
  getSettings().then((s) => {
    theme.value = s.theme || 'system';
  });
  const stopThemeWatch = useTheme(theme);

  const SKIP_TYPES = new Set([
    'urltest',
    'fallback',
    'reject',
    'reject-drop',
    'pass',
    'direct',
    'compatible',
  ]);
  const SKIP_GROUPS = new Set(['direct', 'reject']);

  const modeOptions = computed(() => [
    { value: 'rule' as ClashMode, label: t('modeRule') },
    { value: 'global' as ClashMode, label: t('modeGlobal') },
  ]);

  const selectorGroups = computed(() =>
    groups.value.filter((g) => g.type === 'Selector' && g.name.toLowerCase() !== 'global'),
  );

  const coreGroup = computed(() => {
    if (currentMode.value === 'global')
      return (
        groups.value.find((g) => g.name.toLowerCase() === 'global' && g.type === 'Selector') ?? null
      );
    if (selectedGroup.value)
      return groups.value.find((g) => g.name === selectedGroup.value) ?? null;
    return selectorGroups.value[0] ?? null;
  });

  // 过滤 + 排序（测速中不排序，完成后排序）
  const sortedNodes = computed(() => {
    if (!coreGroup.value) return [];
    const list = coreGroup.value.all.filter((n) => n in proxies.value);
    if (!isAnyTesting.value) {
      // 正常延迟升序；未测速居中；测速失败排最后
      list.sort((a, b) => delaySortWeight(delays.value[a]) - delaySortWeight(delays.value[b]));
    }
    return list;
  });

  async function openSettings(): Promise<void> {
    await browser.tabs.create({ url: browser.runtime.getURL('index.html') });
  }

  function selectGroup(name: string): void {
    selectedGroup.value = name;
    showGroupDropdown.value = false;
  }

  onMounted(async () => {
    ac = new AbortController();
    const s = await getSettings();
    // 确保 i18n messages 已加载，避免 t() 走 browser.i18n.getMessage 回退导致占位符异常
    const lang = resolveLocaleDirectory(s.language, browser.i18n.getUILanguage());
    await loadLocale(lang);
    clashApi.setConfig(s.apiBaseUrl, s.apiSecret);
    testUrl = s.testUrl;
    testTimeout = s.testTimeout;
    testConcurrency = s.testConcurrency;
    await checkConnection(ac.signal);
    if (connectionStatus.value === 'connected') {
      try {
        await Promise.all([fetchProxies(ac.signal), fetchConfig(ac.signal)]);
      } catch {
        connectionStatus.value = 'disconnected';
        errorMsg.value = t('connectFail');
      }
    }
    await checkProxyStatus();
  });

  onUnmounted(() => {
    ac.abort();
    abortAll();
    stopThemeWatch();
    if (toastTimer) clearTimeout(toastTimer);
  });

  async function checkConnection(signal: AbortSignal): Promise<void> {
    connectionStatus.value = 'checking';
    try {
      await clashApi.healthCheck(signal);
      connectionStatus.value = 'connected';
    } catch {
      connectionStatus.value = 'disconnected';
      errorMsg.value = t('connectFail');
    }
  }

  async function retryConnect(): Promise<void> {
    ac.abort();
    ac = new AbortController();
    const signal = ac.signal;
    connectionStatus.value = 'checking';
    try {
      await clashApi.healthCheck(signal);
      await Promise.all([fetchProxies(signal), fetchConfig(signal)]);
      connectionStatus.value = 'connected';
      errorMsg.value = '';
    } catch {
      connectionStatus.value = 'disconnected';
      errorMsg.value = t('connectFail');
    }
  }

  async function refreshProxies(): Promise<void> {
    try {
      await Promise.all([fetchProxies(ac.signal), fetchConfig(ac.signal)]);
      showToast(t('refreshSuccess'));
    } catch {
      showToast(t('refreshFail'));
    }
  }

  async function fetchProxies(signal: AbortSignal): Promise<void> {
    const data = await clashApi.getProxies(signal);
    const m: Record<string, ProxyNode> = {};
    const l: PG[] = [];
    for (const [name, p] of Object.entries(data.proxies ?? {})) {
      if (
        SKIP_TYPES.has(((p as PG).type ?? '').toLowerCase()) ||
        SKIP_GROUPS.has(name.toLowerCase())
      )
        continue;
      if (Array.isArray((p as unknown as Record<string, unknown>).all)) {
        l.push({ name, type: (p as PG).type, now: (p as PG).now, all: (p as PG).all } as PG);
      } else {
        m[name] = p as ProxyNode;
      }
    }
    proxies.value = m;
    groups.value = l;
    if (selectedGroup.value && !l.some((group) => group.name === selectedGroup.value))
      selectedGroup.value = '';
  }

  async function fetchConfig(signal: AbortSignal): Promise<void> {
    currentMode.value = (await clashApi.getConfigs(signal)).mode;
  }

  async function checkProxyStatus(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await browser.runtime.sendMessage({ action: 'GET_PROXY_STATUS' });
        proxyEnabled.value = !!(r as { enabled?: boolean })?.enabled;
        return;
      } catch {
        if (i < 2) await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  async function toggleProxy(): Promise<void> {
    if (connectionStatus.value !== 'connected' && !proxyEnabled.value) return;
    const n = !proxyEnabled.value;
    try {
      const response = await browser.runtime.sendMessage({ action: 'SET_PROXY', enabled: n });
      if (!isSuccessfulResponse(response))
        throw new Error(response?.error || 'Proxy operation failed');
      proxyEnabled.value = n;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[toggleProxy]', message);
      showToast(
        message.includes('private browsing permission')
          ? t('privateBrowsingRequired')
          : `${t('switchFail')}: ${message}`,
      );
    }
  }

  async function switchMode(m: ClashMode): Promise<void> {
    if (m === currentMode.value) return;
    try {
      await clashApi.updateConfig({ mode: m }, ac.signal);
      currentMode.value = m;
      showToast(
        t('switchSuccess', { mode: modeOptions.value.find((o) => o.value === m)?.label ?? '' }),
      );
    } catch {
      showToast(t('switchFail'));
    }
  }

  async function switchNode(nodeName: string): Promise<void> {
    const cg = coreGroup.value;
    if (!cg) {
      showToast(t('noGroup'));
      return;
    }
    if (cg.type !== 'Selector') {
      showToast(t('notSelector', { type: cg.type }));
      return;
    }
    try {
      await clashApi.switchProxy(cg.name, nodeName, ac.signal);
      cg.now = nodeName;
      showToast(t('nodeSwitched', { node: nodeName }));
    } catch (e: unknown) {
      showToast(
        t('switchNodeFail', { group: cg.name, error: e instanceof Error ? e.message : String(e) }),
      );
    }
  }

</script>

<template>
  <div class="popup" @click="showGroupDropdown = false">
    <Transition name="toast"
      ><div v-if="toast" class="popup-toast">{{ toast }}</div></Transition
    >

    <header class="popup__header">
      <div class="popup__brand">
        <svg class="logo" width="16" height="16" viewBox="82 82 860 860" xmlns="http://www.w3.org/2000/svg">
          <path d="M511.5 82c-236.6 0-429 192.4-429 429 0 236.5 192.5 429 429 429 236.6 0 429-192.4 429-429 0-236.5-192.4-429-429-429z m377.6 403.8H734.3c-4-139.9-41.4-259.9-97.5-331.9C776.5 203 879 332 889.1 485.8z m-402.8-349v349h-147c5.5-175.5 68.6-322.6 147-349z m0 399.4v349c-78.4-26.4-141.4-173.5-147-349h147z m50.5 349v-349h147c-5.6 175.5-68.6 322.6-147 349z m0-399.4v-349c78.4 26.4 141.4 173.5 147 349h-147zM386.3 153.9c-56.1 72-93.5 192-97.5 331.9H133.9C144.1 332 246.5 203 386.3 153.9zM133.9 536.2h154.8c4 139.9 41.4 259.9 97.5 331.9C246.5 819 144.1 690 133.9 536.2z m502.8 331.9c56.1-72 93.5-192 97.5-331.9H889C879 690 776.5 819 636.7 868.1z" fill="#5F9BEB"/>
        </svg>
        <span class="title">ClashVergeLink</span>
        <span
          class="status"
          :class="`s--${connectionStatus}`"
          :title="
            connectionStatus === 'connected'
              ? t('connected')
              : connectionStatus === 'checking'
                ? t('checking')
                : t('disconnected')
          "
        ></span>
      </div>
      <div class="popup__actions">
        <button
          class="toggle"
          :class="{ 'toggle--on': proxyEnabled }"
          :disabled="connectionStatus !== 'connected' && !proxyEnabled"
          @click="toggleProxy"
        >
          <Power :size="13" /><span>{{ proxyEnabled ? t('proxyOn') : t('proxyOff') }}</span>
        </button>
        <button class="icon-btn" @click="openSettings" :title="t('settings')">
          <Settings :size="15" />
        </button>
      </div>
    </header>

    <div v-if="connectionStatus !== 'connected'" class="notice">
      <Loader2 v-if="connectionStatus === 'checking'" :size="16" class="spin" />
      <WifiOff v-else :size="16" />
      <p>{{ connectionStatus === 'checking' ? t('connecting') : errorMsg }}</p>
      <button class="notice__btn" :disabled="connectionStatus === 'checking'" @click="retryConnect">
        <Loader2 v-if="connectionStatus === 'checking'" :size="13" class="spin" />
        <RefreshCw v-else :size="13" /><span>{{
          connectionStatus === 'checking' ? t('detecting') : t('retry')
        }}</span>
      </button>
    </div>

    <template v-else>
      <nav class="mode-bar">
        <button
          v-for="m in modeOptions"
          :key="m.value"
          class="mode-btn"
          :class="{ 'mode-btn--on': currentMode === m.value }"
          @click="switchMode(m.value)"
        >
          {{ m.label }}
        </button>
      </nav>

      <!-- 策略组下拉 -->
      <div class="selector">
        <button
          class="selector__btn"
          :class="{ 'selector__btn--disabled': currentMode !== 'rule' }"
          :disabled="currentMode !== 'rule'"
          @click.stop="currentMode === 'rule' && (showGroupDropdown = !showGroupDropdown)"
        >
          <span class="selector__label">{{ t('groupLabel') }}</span>
          <span class="selector__name">
            <template v-if="currentMode === 'global'">GLOBAL</template>
            <template v-else>{{ coreGroup?.name || '—' }}</template>
          </span>
          <ChevronDown
            v-if="currentMode === 'rule'"
            :size="14"
            class="selector__chevron"
            :class="{ 'sel-rotated': showGroupDropdown }"
          />
        </button>
        <div v-if="showGroupDropdown && currentMode === 'rule'" class="selector__list" @click.stop>
          <button
            v-for="g in selectorGroups"
            :key="g.name"
            class="selector__item"
            :class="{
              'selector__item--on':
                g.name === selectedGroup || (!selectedGroup && g === selectorGroups[0]),
            }"
            @click="selectGroup(g.name)"
          >
            {{ g.name }}
          </button>
        </div>
      </div>

      <section class="nodes" v-if="coreGroup">
        <div class="nodes-head">
          <span class="nodes-head__title"
            >{{ t('nodeListTitle') }}：{{ coreGroup.name }} ({{ sortedNodes.length }})</span
          >
          <button class="nodes-head__btn" @click="refreshProxies" :title="t('refresh')">
            <RotateCw :size="13" />
          </button>
          <button
            class="nodes-head__btn"
            :class="{ 'nodes-head__btn--stop': testingAll }"
            @click="toggleTestAll"
            :title="testingAll ? t('stopTest') : t('testAll')"
          >
            <Square v-if="testingAll" :size="11" />
            <Zap v-else :size="13" />
          </button>
        </div>

        <div class="nodes-list">
          <NodeItem
            v-for="nodeName in sortedNodes"
            :key="nodeName"
            :node-name="nodeName"
            :node="proxies[nodeName]"
            :delay="delays[nodeName]"
            :is-testing="!!testingNodes[nodeName]"
            :is-active="coreGroup.now === nodeName"
            @select="switchNode(nodeName)"
            @test-delay="testNode(nodeName)"
          />
        </div>
      </section>

      <div v-if="!coreGroup" class="notice notice--empty">
        <Zap :size="14" />
        <p>{{ t('noNodes') }}</p>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
  @use '../assets/styles/mixins' as mix;
  @use '../assets/styles/variables' as *;

  .popup {
    width: 380px;
    max-height: 560px;
    overflow: hidden;
    background: var(--color-bg-primary);
    display: flex;
    flex-direction: column;
    padding: 10px 0;
  }

  .popup__header {
    @include mix.flex-between(var(--space-sm));
    height: 48px;
    padding: 0 var(--space-lg);
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border-light);
    position: sticky;
    top: 0;
    z-index: 10;
    flex-shrink: 0;
  }
  .popup__brand {
    @include mix.flex-center(row, var(--space-sm));
    min-width: 0;
  }
  .logo {
    color: var(--color-accent);
    flex-shrink: 0;
  }
  .title {
    font-size: var(--font-size-md);
    font-weight: 600;
    @include mix.text-ellipsis;
  }
  .status {
    @include mix.status-dot(8px);
    &.s--connected {
      background: var(--color-success);
      box-shadow: 0 0 6px var(--color-success);
    }
    &.s--disconnected {
      background: var(--color-danger);
      box-shadow: 0 0 6px var(--color-danger);
    }
    &.s--checking {
      background: var(--color-warning);
      box-shadow: 0 0 6px var(--color-warning);
    }
  }
  .popup__actions {
    @include mix.flex-center(row, var(--space-xs));
    flex-shrink: 0;
  }
  .toggle {
    @include mix.flex-center(row, var(--space-xs));
    @include mix.pill(26px);
    font-size: var(--font-size-xs);
    font-weight: 700;
    background: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
    &--on {
      background: var(--color-accent-muted);
      color: var(--color-accent);
      border-color: var(--color-accent);
      box-shadow: var(--shadow-glow);
    }
  }
  .icon-btn {
    @include mix.flex-center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    @include mix.interactive;
  }

  .popup-toast {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999;
    padding: var(--space-sm) var(--space-lg);
    max-width: 300px;
    font-size: var(--font-size-xs);
    color: var(--color-text-primary);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    text-align: center;
    pointer-events: none;
  }
  .toast-enter-active,
  .toast-leave-active {
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast);
  }
  .toast-enter-from,
  .toast-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(8px);
  }

  .mode-bar {
    display: flex;
    gap: var(--space-xs);
    padding: var(--space-md) var(--space-lg);
    background: var(--color-bg-secondary);
    flex-shrink: 0;
  }
  .mode-btn {
    flex: 1;
    height: 32px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    transition: all var(--transition-fast);
    &:hover {
      color: var(--color-text-primary);
      background: var(--color-bg-elevated);
    }
    &--on {
      color: var(--color-text-primary);
      background: var(--color-accent);
      box-shadow: var(--shadow-glow);
      &:hover {
        background: var(--color-accent-hover);
      }
    }
  }

  // Selector
  .selector {
    position: relative;
    padding: var(--space-sm) var(--space-lg) 0;
    background: var(--color-bg-secondary);
    flex-shrink: 0;
  }
  .selector__btn {
    @include mix.flex-center(row, var(--space-sm));
    width: 100%;
    height: 34px;
    padding: 0 var(--space-md);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
    &:hover:not(:disabled) {
      border-color: var(--color-accent);
    }
    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
  .selector__label {
    font-weight: 500;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
  }
  .selector__name {
    flex: 1;
    text-align: left;
    @include mix.text-ellipsis;
    color: var(--color-text-primary);
  }
  .selector__chevron {
    flex-shrink: 0;
    transition: transform var(--transition-base);
  }
  .sel-rotated {
    transform: rotate(180deg);
  }
  .selector__list {
    position: absolute;
    top: 100%;
    left: var(--space-lg);
    right: var(--space-lg);
    z-index: 20;
    max-height: 160px;
    overflow-y: auto;
    margin-top: 1px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    @include mix.custom-scrollbar;
  }
  .selector__item {
    display: block;
    width: 100%;
    padding: 7px var(--space-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-align: left;
    transition: background var(--transition-fast);
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    &--on {
      color: var(--color-accent);
      background: var(--color-accent-muted);
    }
  }

  .nodes {
    padding: var(--space-md) var(--space-lg) 0;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .nodes-head {
    @include mix.flex-center(row, 15px);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--color-border-light);
    flex-shrink: 0;
  }
  .nodes-head__title {
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    flex: 1;
  }
  .nodes-head__btn {
    @include mix.flex-center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    margin-right: 15px;
    @include mix.interactive;
    &:hover:not(:disabled) {
      color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    &--stop {
      color: var(--color-accent);
    }
    &:last-child {
      margin-left: -30px;
    }
  }
  .nodes-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    @include mix.custom-scrollbar;
  }

  .notice {
    @include mix.flex-center(column, var(--space-md));
    padding: var(--space-2xl) var(--space-lg);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    text-align: center;
    &--empty {
      padding-top: var(--space-xl);
    }
  }
  .notice__btn {
    @include mix.flex-center(row, var(--space-xs));
    @include mix.pill(30px);
    font-size: var(--font-size-xs);
    color: var(--color-accent);
    border: 1px solid var(--color-accent);
    &:hover {
      background: var(--color-accent-muted);
    }
  }

  .spin {
    @include mix.spin;
  }
</style>
