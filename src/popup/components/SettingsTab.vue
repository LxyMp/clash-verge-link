<script setup lang="ts">
  import { ref, onMounted, onUnmounted, watch } from 'vue';
  import { AlertTriangle, CheckCircle2, Loader2, CircleCheck } from 'lucide-vue-next';
  import { getSettings, saveSettings } from '../../services/storage';
  import { ClashApi, clashApi } from '../../services/clashApi';
  import { parseBypassRule } from '../../services/bypassRules';
  import {
    resolveLocaleDirectory,
    validateSettingsInput,
    type ApiProtocol,
    type SettingsValidationError,
  } from '../../services/settingsRules';

  import { useI18n } from '../../composables/useI18n';
  import { useTheme } from '../../composables/useTheme';
  const { t } = useI18n();
  const emit = defineEmits<{ settingsSaved: [connectionOk: boolean | null] }>();

  const apiHost = ref('127.0.0.1');
  const apiPort = ref('9097');
  const apiProtocol = ref<ApiProtocol>('http');
  const apiSecret = ref('');
  const mixedPort = ref(7899);
  const testConcurrency = ref(5);
  const testUrl = ref('');
  const testTimeout = ref(5000);
  const bypassText = ref('');
  const saving = ref(false);
  const toastMsg = ref('');
  const toastType = ref<'success' | 'warning' | 'error'>('error');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const showUrlList = ref(false);
  const showLang = ref(false);
  const showTheme = ref(false);
  const language = ref('');
  const themeVal = ref('system');
  let savedApiBaseUrl = '';
  let savedApiSecret = '';

  function langLabel(v: string): string {
    if (v === 'en') return t('langEn');
    if (v === 'zh-CN') return t('langZh');
    return t('langAuto');
  }
  function themeLabel(v: string): string {
    if (v === 'dark') return t('themeDark');
    if (v === 'light') return t('themeLight');
    return t('themeSystem');
  }

  function setLanguage(lang: string): void {
    language.value = lang;
    showLang.value = false;
  }

  const stopThemeWatch = useTheme(themeVal);
  onUnmounted(stopThemeWatch);
  watch(language, async (v) => {
    const { loadLocale } = await import('../../composables/useI18n');
    await loadLocale(resolveLocaleDirectory(v, browser.i18n.getUILanguage()));
  });

  function onLangBlur(): void {
    window.setTimeout(() => {
      showLang.value = false;
    }, 150);
  }
  function onThemeBlur(): void {
    window.setTimeout(() => {
      showTheme.value = false;
    }, 150);
  }

  function showToast(type: 'success' | 'warning' | 'error', msg: string): void {
    toastType.value = type;
    toastMsg.value = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMsg.value = '';
    }, 2500);
  }

  const presetUrls = [
    'http://www.gstatic.com/generate_204',
    'http://cp.cloudflare.com',
    'https://www.google.com',
    'https://www.baidu.com',
    'https://www.bing.com',
    'http://connectivitycheck.gstatic.com/generate_204',
  ];

  onMounted(async () => {
    const s = await getSettings();
    try {
      const u = new URL(s.apiBaseUrl);
      apiProtocol.value = u.protocol === 'https:' ? 'https' : 'http';
      apiHost.value = u.hostname;
      apiPort.value = u.port || '9097';
    } catch {
      /* */
    }
    apiSecret.value = s.apiSecret;
    savedApiBaseUrl = s.apiBaseUrl;
    savedApiSecret = s.apiSecret;
    mixedPort.value = s.mixedPort;
    testConcurrency.value = s.testConcurrency;
    testUrl.value = s.testUrl;
    testTimeout.value = s.testTimeout;
    bypassText.value = s.bypassRules.join('\n');
    language.value = s.language;
    themeVal.value = s.theme || 'system';
  });

  /** textarea 一行一条规则，去空白行与首尾空格 */
  function parseBypassLines(): string[] {
    return bypassText.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function invalidBypassLine(): string | null {
    return parseBypassLines().find((rule) => parseBypassRule(rule) === null) ?? null;
  }

  function validate(): string | null {
    const error = validateSettingsInput({
      apiProtocol: apiProtocol.value,
      apiHost: apiHost.value,
      apiPort: Number(apiPort.value),
      apiSecret: apiSecret.value,
      mixedPort: mixedPort.value,
      testConcurrency: testConcurrency.value,
      testUrl: testUrl.value.trim(),
      testTimeout: testTimeout.value,
      bypassRules: parseBypassLines(),
    });
    if (!error) return null;
    if (error === 'bypassRuleInvalid') {
      const bad = invalidBypassLine();
      return bad ? `${t('validateBypassRule')}: ${bad}` : t('validateBypassRule');
    }
    const messages: Record<SettingsValidationError, string> = {
      apiHostEmpty: 'validateUrlEmpty',
      apiHostLocal: 'validateApiHostLocal',
      apiPortRange: 'validatePortRange',
      mixedPortRange: 'validateMixedPort',
      testConcurrencyRange: 'validateConcurrency',
      testUrlInvalid: 'validateTestUrl',
      testTimeoutRange: 'validateTimeout',
      bypassRuleInvalid: 'validateBypassRule',
    };
    return t(messages[error]);
  }

  function buildApiUrl(): string {
    return `${apiProtocol.value}://${apiHost.value.trim()}:${apiPort.value}`;
  }

  async function save(): Promise<void> {
    const err = validate();
    if (err) {
      showToast('error', err);
      return;
    }
    saving.value = true;
    try {
      const c = {
        apiBaseUrl: buildApiUrl(),
        apiSecret: apiSecret.value.trim(),
        mixedPort: mixedPort.value,
        testConcurrency: testConcurrency.value,
        testUrl: testUrl.value.trim(),
        testTimeout: testTimeout.value,
        bypassRules: parseBypassLines(),
        language: language.value,
        theme: themeVal.value,
      };
      const apiChanged = c.apiBaseUrl !== savedApiBaseUrl || c.apiSecret !== savedApiSecret;
      await saveSettings(c);
      clashApi.setConfig(c.apiBaseUrl, c.apiSecret);
      savedApiBaseUrl = c.apiBaseUrl;
      savedApiSecret = c.apiSecret;

      if (!apiChanged) {
        showToast('success', t('saveSuccess'));
        setTimeout(() => emit('settingsSaved', null), 1000);
        return;
      }

      const candidateApi = new ClashApi();
      candidateApi.setConfig(c.apiBaseUrl, c.apiSecret);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let connectionOk = true;
      try {
        await candidateApi.healthCheck(controller.signal);
      } catch {
        connectionOk = false;
      } finally {
        clearTimeout(timer);
      }

      showToast(
        connectionOk ? 'success' : 'warning',
        t(connectionOk ? 'saveSuccess' : 'saveConnectionWarning'),
      );
      setTimeout(() => emit('settingsSaved', connectionOk), 1000);
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : t('saveFail'));
    } finally {
      saving.value = false;
    }
  }
</script>

<template>
  <div
    class="settings"
    @click="
      showUrlList = false;
      showLang = false;
      showTheme = false;
    "
  >
    <Transition name="toast">
      <div
        v-if="toastMsg"
        class="toast"
        :class="{
          'toast--ok': toastType === 'success',
          'toast--warning': toastType === 'warning',
        }"
        @click="toastMsg = ''"
      >
        <CircleCheck v-if="toastType === 'success'" :size="13" />
        <AlertTriangle v-else :size="13" />
        <span>{{ toastMsg }}</span>
      </div>
    </Transition>

    <div class="card">
      <!-- ====== API 配置 ====== -->
      <h3 class="section">{{ t('apiConfig') }}</h3>

      <div class="field">
        <label class="label">{{ t('apiAddr') }} <span class="req">*</span></label>
        <div class="row api-row">
          <div class="field" style="width: 90px; flex-shrink: 0">
            <select v-model="apiProtocol" class="input protocol-select" :aria-label="t('apiProtocol')">
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
          </div>
          <div class="field" style="flex: 1; min-width: 0">
            <input v-model="apiHost" class="input" placeholder="127.0.0.1 / localhost" />
          </div>
          <div class="field" style="width: 100px; flex-shrink: 0">
            <span class="api-port-label">{{ t('apiPortLabel') }} <span class="req">*</span></span>
            <input
              v-model="apiPort"
              class="input"
              type="number"
              min="1"
              max="65535"
              placeholder="9097"
            />
          </div>
        </div>
      </div>

      <div class="row">
        <div class="field" style="flex: 1; min-width: 0">
          <label class="label">{{ t('apiSecret') }}</label>
          <input
            v-model="apiSecret"
            class="input"
            type="password"
            :placeholder="t('apiSecretOptional')"
            autocomplete="off"
          />
        </div>
        <div class="field" style="width: 100px; flex-shrink: 0">
          <label class="label">{{ t('mixedPort') }} <span class="req">*</span></label>
          <input
            v-model.number="mixedPort"
            class="input"
            type="number"
            min="1"
            max="65535"
            placeholder="7899"
          />
        </div>
      </div>

      <!-- ====== 测速配置 ====== -->
      <h3 class="section">{{ t('testConfig') }}</h3>

      <div class="row">
        <div class="field" style="flex: 1; min-width: 0">
          <label class="label">{{ t('testUrl') }}</label>
          <div class="combo" @click.stop>
            <input
              v-model="testUrl"
              class="input"
              placeholder="http://www.gstatic.com/generate_204"
              @focus="showUrlList = true"
              @click="showUrlList = true"
            />
            <div v-if="showUrlList" class="combo__list">
              <button
                v-for="u in presetUrls"
                :key="u"
                class="combo__opt"
                :class="{ 'combo__opt--on': testUrl === u }"
                @mousedown.prevent="
                  testUrl = u;
                  showUrlList = false;
                "
              >
                {{ u }}
              </button>
            </div>
          </div>
        </div>
        <div class="field" style="width: 100px; flex-shrink: 0">
          <label class="label">{{ t('concurrency') }}</label>
          <input
            v-model.number="testConcurrency"
            class="input"
            type="number"
            min="1"
            max="20"
            placeholder="5"
          />
        </div>
        <div class="field" style="width: 100px; flex-shrink: 0">
          <label class="label">{{ t('timeoutMs') }}</label>
          <input
            v-model.number="testTimeout"
            class="input"
            type="number"
            min="1000"
            max="30000"
            step="1000"
            placeholder="5000"
          />
        </div>
      </div>

      <!-- ====== 直连规则 ====== -->
      <h3 class="section">{{ t('bypassConfig') }}</h3>

      <div class="field">
        <label class="label">{{ t('bypassRulesLabel') }}</label>
        <textarea
          v-model="bypassText"
          class="input textarea"
          rows="4"
          spellcheck="false"
          :placeholder="t('bypassRulesPlaceholder')"
        ></textarea>
        <div class="hint">{{ t('bypassRulesHint') }}</div>
      </div>

      <!-- ====== 语言与主题 ====== -->
      <h3 class="section">{{ t('langTheme') }}</h3>

      <div class="row">
        <div class="field" style="width: 100px; flex-shrink: 0">
          <label class="label">{{ t('language') }}</label>
          <div class="toggle-drop" tabindex="0" @blur="onLangBlur" @click.stop>
            <button class="input toggle-drop__btn" @click="showLang = !showLang">
              <span>{{ langLabel(language) }}</span>
              <span class="toggle-drop__arrow">▾</span>
            </button>
            <div v-if="showLang" class="toggle-drop__list">
              <button
                class="toggle-drop__opt"
                :class="{ 'toggle-drop__opt--on': !language }"
                @click="setLanguage('')"
              >
                {{ t('langAuto') }}
              </button>
              <button
                class="toggle-drop__opt"
                :class="{ 'toggle-drop__opt--on': language === 'zh-CN' }"
                @click="setLanguage('zh-CN')"
              >
                中文
              </button>
              <button
                class="toggle-drop__opt"
                :class="{ 'toggle-drop__opt--on': language === 'en' }"
                @click="setLanguage('en')"
              >
                English
              </button>
            </div>
          </div>
        </div>
        <div class="field" style="width: 100px; flex-shrink: 0">
          <label class="label">{{ t('theme') }}</label>
          <div class="toggle-drop" tabindex="0" @blur="onThemeBlur" @click.stop>
            <button class="input toggle-drop__btn" @click="showTheme = !showTheme">
              <span>{{ themeLabel(themeVal) }}</span>
              <span class="toggle-drop__arrow">▾</span>
            </button>
            <div v-if="showTheme" class="toggle-drop__list">
              <button
                class="toggle-drop__opt"
                :class="{ 'toggle-drop__opt--on': themeVal === 'system' }"
                @click="
                  themeVal = 'system';
                  showTheme = false;
                "
              >
                {{ t('themeSystem') }}
              </button>
              <button
                class="toggle-drop__opt"
                :class="{ 'toggle-drop__opt--on': themeVal === 'dark' }"
                @click="
                  themeVal = 'dark';
                  showTheme = false;
                "
              >
                {{ t('themeDark') }}
              </button>
              <button
                class="toggle-drop__opt"
                :class="{ 'toggle-drop__opt--on': themeVal === 'light' }"
                @click="
                  themeVal = 'light';
                  showTheme = false;
                "
              >
                {{ t('themeLight') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="divider"></div>
      <button class="save-btn" :disabled="saving" @click="save">
        <Loader2 v-if="saving" :size="15" class="spin" />
        <CheckCircle2 v-else :size="15" />
        <span>{{ saving ? t('saving') : t('save') }}</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  @use '../../assets/styles/mixins' as mix;
  @use '../../assets/styles/variables' as *;

  .settings {
    max-width: var(--page-max-width);
    margin: 0 auto;
    padding: var(--space-xl);
    position: relative;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .toast {
    position: fixed;
    top: calc(var(--header-height) + 10px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    @include mix.flex-center(row, var(--space-xs));
    padding: var(--space-sm) var(--space-lg);
    max-width: 360px;
    font-size: var(--font-size-xs);
    color: var(--color-danger);
    background: var(--color-bg-secondary);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    cursor: pointer;
    &--ok {
      color: var(--color-success);
      border-color: rgba(63, 185, 80, 0.3);
    }
    &--warning {
      color: var(--color-warning);
      border-color: var(--color-warning-muted);
    }
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
    transform: translateX(-50%) translateY(-6px);
  }

  .section {
    text-align: center;
    font-size: var(--font-size-md);
    font-weight: 600;
    padding-top: var(--space-md);
    border-top: 1px solid var(--color-border-light);
    &:first-of-type {
      border-top: none;
      padding-top: 0;
    }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .row {
    display: flex;
    gap: var(--space-lg);
  }
  .api-row {
    gap: var(--space-lg);
    align-items: flex-end;
  }
  .api-port-label {
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    letter-spacing: 0.04em;
  }
  .label {
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    letter-spacing: 0.04em;
  }
  .req {
    color: var(--color-danger);
    margin-left: 2px;
  }
  .input {
    height: 38px;
    padding: 0 var(--space-md);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color var(--transition-fast);
    width: 100%;
    &:focus {
      border-color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    &[type='number'] {
      -moz-appearance: textfield;
      appearance: textfield;
      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        -webkit-appearance: none;
        appearance: none;
        margin: 0;
      }
    }
  }
  // Toggle Drop
  .toggle-drop {
    position: relative;
  }
  .toggle-drop__btn {
    @include mix.flex-between;
    width: 100%;
    cursor: pointer;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }
  .toggle-drop__arrow {
    color: var(--color-text-tertiary);
    font-size: 10px;
  }
  .toggle-drop__list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    margin-top: 2px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    overflow: hidden;
  }
  .toggle-drop__opt {
    display: block;
    width: 100%;
    padding: 8px var(--space-md);
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
  // Combo
  .combo {
    position: relative;
  }
  .combo__list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    margin-top: 2px;
    max-height: 180px;
    overflow-y: auto;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    @include mix.custom-scrollbar;
  }
  .combo__opt {
    display: block;
    width: 100%;
    padding: 7px var(--space-md);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    color: var(--color-text-secondary);
    text-align: left;
    @include mix.text-ellipsis;
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

  .textarea {
    height: auto;
    min-height: 96px;
    padding: var(--space-sm) var(--space-md);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    line-height: 1.7;
    resize: vertical;
  }
  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    line-height: 1.5;
  }

  .divider {
    border-top: 1px solid var(--color-border-light);
    margin-top: var(--space-sm);
  }
  .save-btn {
    @include mix.flex-center(row, var(--space-sm));
    height: 40px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-inverse);
    background: var(--color-accent);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    margin-top: var(--space-md);
    &:hover {
      background: var(--color-accent-hover);
    }
    &:active {
      transform: scale(0.98);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .spin {
    @include mix.spin;
  }
</style>
