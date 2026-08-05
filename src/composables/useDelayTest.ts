import { computed, ref } from 'vue';
import { clashApi } from '../services/clashApi';
import { runBatched } from '../services/runBatched';

export interface DelayTestConfig {
  timeout: number;
  url: string;
  concurrency: number;
}

export interface DelayTestOptions {
  /** 获取当前组件生命周期的 AbortSignal（组件卸载时中止） */
  getSignal: () => AbortSignal;
  /** 获取当前可用于批量测速的节点列表（如当前策略组节点） */
  getNodes: () => string[];
  /** 获取测速配置（超时、目标地址、并发数） */
  getConfig: () => DelayTestConfig;
}

/**
 * 节点延迟测试逻辑：单节点测速、批量测速与取消。
 *
 * 单节点与批量共用同一个测试函数：请求被中止时（signal.aborted）
 * 不写入失败结果，也不清理测试中标记，避免中断产生的状态污染。
 */
export function useDelayTest(options: DelayTestOptions) {
  const delays = ref<Record<string, number>>({});
  const testingNodes = ref<Record<string, boolean>>({});
  const testingAll = ref(false);

  let testAbort: AbortController | null = null;

  const isAnyTesting = computed(
    () => testingAll.value || Object.values(testingNodes.value).some((v) => v),
  );

  async function runDelayTest(name: string, signal: AbortSignal): Promise<void> {
    const { timeout, url } = options.getConfig();
    try {
      const r = await clashApi.testDelay(name, timeout, url, signal);
      if (!signal.aborted) delays.value = { ...delays.value, [name]: r.delay };
    } catch {
      // 请求被中止时不清空旧延迟，也不写入失败结果
      if (!signal.aborted) delays.value = { ...delays.value, [name]: -1 };
    } finally {
      // 无论是否中止都清除测试中标记，避免中断后 spinner 卡死
      testingNodes.value = { ...testingNodes.value, [name]: false };
    }
  }

  async function testNode(name: string): Promise<void> {
    if (testingNodes.value[name]) return;
    testingNodes.value = { ...testingNodes.value, [name]: true };
    await runDelayTest(name, options.getSignal());
  }

  async function toggleTestAll(): Promise<void> {
    if (testingAll.value) {
      testAbort?.abort();
      testAbort = null;
      testingAll.value = false;
      return;
    }

    const pending = options.getNodes().filter((name) => !testingNodes.value[name]);
    if (!pending.length) return;

    const runController = new AbortController();
    testingAll.value = true;
    testAbort = runController;
    const signal = runController.signal;

    try {
      const { concurrency } = options.getConfig();
      await runBatched(pending, concurrency, signal, async (name) => {
        testingNodes.value = { ...testingNodes.value, [name]: true };
        await runDelayTest(name, signal);
      });
    } finally {
      if (testAbort === runController) {
        testingAll.value = false;
        testAbort = null;
      }
    }
  }

  /** 中止批量测速并清理状态（组件卸载时调用） */
  function abortAll(): void {
    testAbort?.abort();
    testAbort = null;
    testingAll.value = false;
  }

  return { delays, testingNodes, testingAll, isAnyTesting, testNode, toggleTestAll, abortAll };
}
