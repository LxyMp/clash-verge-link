<script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import { Loader2, Zap } from 'lucide-vue-next';
  import type { ProxyNode } from '../../types';
  import { useI18n } from '../../composables/useI18n';

  const { t } = useI18n();

  const props = defineProps<{
    nodeName: string;
    node?: ProxyNode;
    delay?: number;
    isTesting: boolean;
    isActive: boolean;
  }>();

  const emit = defineEmits<{
    select: [];
    testDelay: [];
  }>();

  const el = ref<HTMLElement>();

  onMounted(() => {
    if (props.isActive && el.value) {
      el.value.scrollIntoView({ block: 'start' });
    }
  });

  function delayLabel(ms: number | undefined): string {
    if (ms === undefined) return '';
    if (ms < 0) return '—';
    return `${ms}ms`;
  }

  function delayCss(ms: number | undefined): string {
    if (ms === undefined) return '';
    if (ms < 0) return 'delay--error';
    if (ms < 300) return 'delay--fast';
    if (ms < 800) return 'delay--mid';
    return 'delay--slow';
  }

  function typeLabel(t: string | undefined): string {
    return t || 'Unknown';
  }
</script>

<template>
  <div
    ref="el"
    class="node"
    :class="{ 'node--active': isActive }"
    role="button"
    tabindex="0"
    @click="emit('select')"
    @keydown.enter="emit('select')"
    @keydown.space.prevent="emit('select')"
  >
    <!-- 类型标签 -->
    <span class="node__type">{{ typeLabel(node?.type) }}</span>

    <!-- 名称 -->
    <span class="node__name">{{ nodeName }}</span>

    <!-- 延迟 -->
    <span v-if="delay !== undefined" class="node__delay" :class="delayCss(delay)">{{
      delayLabel(delay)
    }}</span>

    <!-- 选中指示（始终占位，避免选中时挤压名称） -->
    <span class="node__check" :class="{ 'node__check--on': isActive }">✓</span>

    <!-- 测速按钮 -->
    <button
      class="node__test"
      :disabled="isTesting"
      @click.stop="emit('testDelay')"
      :title="t('testNode')"
    >
      <Loader2 v-if="isTesting" :size="13" class="spin" />
      <Zap v-else :size="13" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
  @use '../../assets/styles/mixins' as mix;
  @use '../../assets/styles/variables' as *;

  .node {
    @include mix.flex-center(row, var(--space-sm));
    width: 100%;
    height: var(--node-item-height);
    padding: 0 var(--space-md);
    border-radius: var(--radius-sm);
    @include mix.interactive;
    position: relative;
    cursor: pointer;
    @include mix.focus-ring;

    &--active {
      background: var(--color-accent-muted);
      &:hover {
        background: rgba(88, 166, 255, 0.18);
      }
    }
  }

  .node__type {
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-accent);
    background: var(--color-accent-muted);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }

  .node__name {
    flex: 1;
    font-size: var(--font-size-sm);
    @include mix.text-ellipsis;
    color: var(--color-text-primary);
    min-width: 0;
  }

  .node__delay {
    font-size: var(--font-size-xs);
    font-weight: 500;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;

    &.delay--fast {
      color: var(--color-success);
      background: var(--color-success-muted);
    }
    &.delay--mid {
      color: var(--color-warning);
      background: var(--color-warning-muted);
    }
    &.delay--slow {
      color: var(--color-danger);
      background: var(--color-danger-muted);
    }
    &.delay--error {
      color: var(--color-danger);
      background: var(--color-danger-muted);
    }
  }

  .node__test {
    @include mix.flex-center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    flex-shrink: 0;
    @include mix.interactive;

    &:hover {
      color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
    }
  }

  .node__check {
    font-size: var(--font-size-sm);
    color: var(--color-accent);
    flex-shrink: 0;
    font-weight: 700;
    width: 14px;
    text-align: center;
    visibility: hidden;

    &--on {
      visibility: visible;
    }
  }

  // ---- 工具 ----
  .spin {
    @include mix.spin;
  }
</style>
