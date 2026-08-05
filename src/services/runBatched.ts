/**
 * 以固定并发数执行异步任务。
 *
 * 滑动窗口：始终维持最多 concurrency 个任务在飞，某个任务结束立即拉取下一个，
 * 而不是按批等齐后再进下一批——后者的总耗时等于 批次数 × 每批最慢任务耗时。
 */
export async function runBatched<T>(
  items: readonly T[],
  concurrency: number,
  signal: AbortSignal,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const poolSize = Math.max(1, Math.floor(concurrency));
  const workerCount = Math.min(poolSize, items.length);
  let cursor = 0;

  const pull = async (): Promise<void> => {
    while (cursor < items.length) {
      if (signal.aborted) return;
      const item = items[cursor];
      cursor += 1;
      try {
        await worker(item);
      } catch {
        // 单个任务失败不影响其余任务继续执行
      }
    }
  };

  await Promise.allSettled(Array.from({ length: workerCount }, () => pull()));
}
