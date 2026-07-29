export async function runBatched<T>(
  items: readonly T[],
  concurrency: number,
  signal: AbortSignal,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const batchSize = Math.max(1, Math.floor(concurrency));
  for (let index = 0; index < items.length; index += batchSize) {
    if (signal.aborted) break;
    const batch = items.slice(index, index + batchSize);
    await Promise.allSettled(batch.map((item) => worker(item)));
  }
}
