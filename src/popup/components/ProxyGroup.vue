<script setup lang="ts">
  import { ref, computed, onMounted, nextTick } from 'vue';
  import { ChevronRight, Layers, Zap, Loader2 } from 'lucide-vue-next';
  import NodeItem from './NodeItem.vue';
  import type { ProxyGroup as PG, ProxyNode } from '../../types';
  import { useI18n } from '../../composables/useI18n';

  const { t } = useI18n();

  const props = defineProps<{
    group: PG;
    proxies: Record<string, ProxyNode>;
    delays: Record<string, number>;
    testingNodes: Record<string, boolean>;
    testingAll: boolean;
    startExpanded?: boolean;
    hideHeader?: boolean;
  }>();

  const emit = defineEmits<{
    switchNode: [nodeName: string];
    testDelay: [nodeName: string];
    testAll: [];
  }>();

  const expanded = ref(props.startExpanded ?? false);

  function toggle(): void {
    expanded.value = !expanded.value;
  }

  // 自动滚动到当前选中节点
  onMounted(() => {
    if (props.hideHeader || props.startExpanded) {
      nextTick(() => {
        const el = document.querySelector('.pg__nodes .node--active') as HTMLElement | null;
        el?.scrollIntoView({ block: 'nearest' });
      });
    }
  });

  const currentDelay = computed<number | undefined>(() => props.delays[props.group.now]);

  const sortedNodes = computed(() => {
    const list = [...props.group.all];
    list.sort((a, b) => {
      const da = props.delays[a];
      const db = props.delays[b];
      const va = da === undefined || da < 0 ? Infinity : da;
      const vb = db === undefined || db < 0 ? Infinity : db;
      return va - vb;
    });
    return list;
  });

  function delayLabel(ms: number | undefined): string {
    if (ms === undefined) return '';
    if (ms < 0) return '—';
    return `${ms}ms`;
  }

  function delayCss(ms: number | undefined): string {
    if (ms === undefined) return '';
    if (ms < 0) return 'badge--error';
    if (ms < 300) return 'badge--fast';
    if (ms < 800) return 'badge--mid';
    return 'badge--slow';
  }
</script>

<template>
  <div class="pg" :class="{ 'pg--open': expanded }">
    <!-- 完整组头（非 hideHeader 模式） -->
    <button v-if="!props.hideHeader" class="pg__header" @click="toggle">
      <ChevronRight :size="14" class="pg__chevron" :class="{ 'pg__chevron--rotated': expanded }" />
      <Layers :size="13" class="pg__icon" />
      <span class="pg__name">{{ group.name }}</span>
      <span class="pg__badge">{{ group.all.length }}</span>
      <span class="pg__current">{{ group.now }}</span>
      <span
        v-if="currentDelay !== undefined && currentDelay >= 0"
        class="pg__delay"
        :class="delayCss(currentDelay)"
        >{{ delayLabel(currentDelay) }}</span
      >
      <button
        class="pg__test-all"
        :disabled="props.testingAll"
        @click.stop="emit('testAll')"
        :title="t('testAll')"
      >
        <Loader2 v-if="props.testingAll" :size="12" class="spin" />
        <Zap v-else :size="12" />
      </button>
    </button>

    <!-- 节点列表 -->
    <div
      v-if="props.hideHeader || expanded"
      class="pg__nodes"
      :class="{ 'pg__nodes--bare': props.hideHeader }"
    >
      <!-- hideHeader 模式：简洁顶栏 -->
      <div v-if="props.hideHeader" class="pg__bar">
        <span class="pg__bar-current">{{ group.now }}</span>
        <span
          v-if="currentDelay !== undefined && currentDelay >= 0"
          class="pg__bar-delay"
          :class="delayCss(currentDelay)"
          >{{ delayLabel(currentDelay) }}</span
        >
        <span class="pg__bar-spacer"></span>
        <button
          class="pg__btn-test"
          :disabled="props.testingAll"
          @click.stop="emit('testAll')"
          :title="t('testAll')"
        >
          <Loader2 v-if="props.testingAll" :size="12" class="spin" />
          <Zap v-else :size="12" />
        </button>
      </div>

      <!-- 节点列表标题 -->
      <div v-if="props.hideHeader" class="pg__title">{{ t('nodeListTitle') }}</div>

      <NodeItem
        v-for="nodeName in sortedNodes"
        :key="nodeName"
        :node-name="nodeName"
        :node="proxies[nodeName]"
        :delay="delays[nodeName]"
        :is-testing="!!testingNodes[nodeName]"
        :is-active="group.now === nodeName"
        @select="emit('switchNode', nodeName)"
        @test-delay="emit('testDelay', nodeName)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
  @use '../../assets/styles/mixins' as mix;
  @use '../../assets/styles/variables' as *;

  .pg {
    margin-bottom: var(--space-xs);
    @include mix.glassmorphism;
    overflow: hidden;
  }

  // 完整组头
  .pg__header {
    @include mix.flex-center(row, var(--space-sm));
    width: 100%;
    height: var(--group-header-height);
    padding: 0 var(--space-md);
    @include mix.interactive;
    &:hover {
      background: rgba(255, 255, 255, 0.02);
    }
  }
  .pg__chevron {
    flex-shrink: 0;
    color: var(--color-text-tertiary);
    transition: transform var(--transition-base);
    &--rotated {
      transform: rotate(90deg);
    }
  }
  .pg__icon {
    flex-shrink: 0;
    color: var(--color-accent);
    opacity: 0.7;
  }
  .pg__name {
    font-size: var(--font-size-sm);
    font-weight: 500;
    @include mix.text-ellipsis;
    min-width: 0;
  }
  .pg__badge {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: 1px 6px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
    margin-left: auto;
  }
  .pg__current {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    @include mix.text-ellipsis;
    max-width: 80px;
    flex-shrink: 1;
  }
  .pg__delay {
    font-size: var(--font-size-xs);
    font-weight: 500;
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    &.badge--fast {
      color: var(--color-success);
      background: var(--color-success-muted);
    }
    &.badge--mid {
      color: var(--color-warning);
      background: var(--color-warning-muted);
    }
    &.badge--slow {
      color: var(--color-danger);
      background: var(--color-danger-muted);
    }
    &.badge--error {
      color: var(--color-danger);
      background: var(--color-danger-muted);
    }
  }
  .pg__test-all {
    @include mix.flex-center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    flex-shrink: 0;
    @include mix.interactive;
    &:hover:not(:disabled) {
      color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  // hideHeader 简洁顶栏
  .pg__bar {
    @include mix.flex-center(row, var(--space-sm));
    padding: var(--space-xs) var(--space-md) var(--space-sm);
    border-bottom: 1px solid var(--color-border-light);
  }
  .pg__bar-current {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }
  .pg__bar-delay {
    font-size: var(--font-size-xs);
    font-weight: 500;
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    &.badge--fast {
      color: var(--color-success);
      background: var(--color-success-muted);
    }
    &.badge--mid {
      color: var(--color-warning);
      background: var(--color-warning-muted);
    }
    &.badge--slow {
      color: var(--color-danger);
      background: var(--color-danger-muted);
    }
    &.badge--error {
      color: var(--color-danger);
      background: var(--color-danger-muted);
    }
  }
  .pg__bar-spacer {
    flex: 1;
  }
  .pg__title {
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-text-tertiary);
    padding: var(--space-sm) var(--space-md) var(--space-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .pg__btn-test {
    @include mix.flex-center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    flex-shrink: 0;
    @include mix.interactive;
    &:hover:not(:disabled) {
      color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .pg__nodes {
    border-top: 1px solid var(--color-border-light);
    padding: var(--space-xs) 0;
    @include mix.fade-in;
    &--bare {
      border-top: none;
      padding-top: 0;
      max-height: 260px;
      overflow-y: auto;
      @include mix.custom-scrollbar;
    }
  }

  .spin {
    @include mix.spin;
  }
</style>
