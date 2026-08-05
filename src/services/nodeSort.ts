/**
 * 节点延迟排序权重。
 *
 * 正常延迟直接按值比较（升序，值越小越靠前）；
 * 未测速节点（无历史数据）居中；
 * 测速失败的节点（延迟为负数）排最后。
 *
 * 注意不能用 Infinity/Infinity+1 表示“最后”，因为 Infinity + 1 === Infinity，
 * 会让“未测速”和“测速失败”权重相同，排序变成随机。
 */
export function delaySortWeight(delay: number | undefined): number {
  if (delay === undefined) return Number.MAX_SAFE_INTEGER - 1;
  return delay < 0 ? Number.MAX_SAFE_INTEGER : delay;
}
