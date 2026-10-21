/**
 * 平台标识，由 vite.config.ts 的 define 在构建期注入（'firefox' | 'chrome'），
 * 与所选 manifest 一一对应。
 *
 * 不能在运行时通过命名空间探测（检查 browser 是否存在）：
 * banner 已先于所有代码把 browser 别名到 chrome，探测结果恒为 Firefox。
 */
declare const __EXT_TARGET__: 'firefox' | 'chrome'

export const isChromium = __EXT_TARGET__ === 'chrome'
