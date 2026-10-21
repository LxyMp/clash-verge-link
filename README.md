# ClashVergeLink

ClashVergeLink 是一个浏览器扩展，同时支持桌面 Firefox 与 Chromium 系浏览器（Chrome / Edge 等）。它通过浏览器代理 API 控制浏览器代理，并通过 Clash Verge Rev 的本地 REST API 切换运行模式、策略组和节点。

## 功能

- 一键开启或关闭浏览器代理
- 切换 Clash 的规则模式和全局模式
- 选择策略组与代理节点
- 单节点测速和限流批量测速
- 直连规则：按正则过滤 URL，命中的网址在代理开启时也直连
- 中英文界面、深色和浅色主题

扩展只影响所在浏览器，不修改操作系统的全局代理。

## 直连规则

设置页的"直连规则"允许在代理开启时让指定网址直连：一行一条正则表达式，按**完整 URL**（含协议与路径）做子串匹配。例如 `example\.com` 命中所有 URL 中包含该域名的请求，`^https://internal\.` 命中以该前缀开头的内网地址。本机地址（localhost / 127.0.0.1 / [::1] / 无点主机名）始终直连。

两个平台的实现方式不同：

- Chrome：规则以 `/regex/` 形式写入 `chrome.proxy` 的 `bypassList`，由浏览器原生匹配，需兼容 RE2 语法（不支持前瞻、后向引用）。
- Firefox：规则通过 `browser.proxy.onRequest` 在扩展内逐请求匹配，支持完整 JavaScript 正则。

规则在代理开启状态下保存后立即生效，无需重新开关代理。

## 环境要求

- Firefox 142 或更高版本，或 Chrome 116 / Edge 116 及以上
- Clash Verge Rev，并开启 `external-controller`
- Yarn 1.x
- Node.js 20.19+ 或 22.13+；推荐使用仓库指定的 Node.js 20

## 开发

```bash
yarn install
yarn test
yarn build            # Firefox 目标，产物在 dist-firefox/
yarn build:chrome     # Chrome 目标，产物在 dist-chrome/
```

开发时持续构建：

```bash
yarn dev              # Firefox
yarn dev:chrome       # Chrome
```

平台差异的实现方式：

- 后台代理逻辑通过 `src/background/proxyBackend.ts` 适配——Firefox 走 `browser.proxy.settings`，Chromium 走 `chrome.proxy.settings`（回调包装为 Promise）。
- Chromium 没有 `browser.*` 命名空间，构建时在每个 chunk 顶部注入 `browser = chrome` 别名（见 `vite.config.ts` 的 `banner`）。
- 平台 manifest 拆分为 `manifest.firefox.json` 与 `manifest.chrome.json`；版本号统一取自 `package.json`，构建时注入，提交前只需更新 `package.json` 的版本号。
- 后台消息响应统一使用 `sendResponse` + `return true` 模式，兼容 Chrome 的 MV3 service worker。

## 在 Firefox 中测试

自动构建并载入扩展到临时浏览器配置。脚本默认使用 macOS 上的 Zen 浏览器（Firefox 内核）：

```bash
yarn firefox
```

使用原生 Firefox 时，用 `--firefox` 覆盖默认路径：

```bash
yarn firefox --firefox /Applications/Firefox.app/Contents/MacOS/firefox
```

也可以手动载入：

1. 执行 `yarn build`。
2. 在 Firefox 打开 `about:debugging#/runtime/this-firefox`。
3. 点击“临时载入附加组件”。
4. 选择 `dist-firefox/manifest.json`。
5. 在扩展详情中允许扩展在隐私窗口中运行。Firefox 的代理设置会同时影响普通窗口和隐私窗口，没有该授权时 `proxy.settings.set()` 会失败。

## 在 Chrome 中测试

```bash
yarn chrome
```

脚本会在独立的临时浏览器配置中启动 Chrome/Chromium 并尝试自动载入扩展（优先 Chromium / Canary，可用 `CHROME_BIN` 指定浏览器路径）。注意 Chrome 137+ 的正式版会忽略 `--load-extension` 参数，此时需要手动载入：

1. 执行 `yarn build:chrome`。
2. 打开 `chrome://extensions`，开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择 `dist-chrome/` 目录。

建议至少验证以下流程：

1. 打开 Popup，确认可以连接本机 Clash API。
2. 开启代理并访问网页，再关闭代理确认恢复直连。
3. 修改混合端口并保存，确认代理仍可用。
4. 切换规则/全局模式、策略组和节点。
5. 执行单节点与批量测速。
6. Clash 离线时确认仍可关闭已开启的浏览器代理，并可保存设置。
7. 从扩展图标右键菜单打开设置页。

## AMO 校验与打包（Firefox）

提交前先更新 `package.json` 中的版本号（manifest 版本号会在构建时注入），然后执行：

```bash
yarn test
yarn lint:addon
yarn package:addon
yarn package:source
```

`web-ext lint` 会检查 Firefox Manifest 与常见 AMO 问题。`package:addon` 生成待签名扩展，`package:source` 生成 AMO 审核压缩代码时需要的对应源码包，两者都输出到 `web-ext-artifacts/`。扩展的 Gecko ID 为 `clash-verge-link@dx`，后续版本必须保持不变。

## Chrome Web Store 打包（Chrome）

```bash
yarn package:chrome
```

生成 `web-ext-artifacts/clash-verge-link-chrome-<version>.zip`（manifest 位于压缩包根目录），可直接上传 Chrome Web Store 开发者后台。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `proxy` | 设置和清除浏览器代理 |
| `storage` | 在浏览器本地保存扩展设置 |
| `contextMenus` | 在扩展图标右键菜单中提供设置入口 |
| 本机地址访问权限 | 连接 `127.0.0.1` 或 `localhost` 上的 Clash REST API |

扩展不使用分析、广告或远程遥测服务。具体说明见 [PRIVACY.md](PRIVACY.md)。

## 项目结构

```text
src/
├── assets/          样式与图标
├── background/      后台脚本（MV3 事件页 / Service Worker）
│   ├── proxyBackend.ts   平台代理适配层（Firefox / Chromium）
│   └── proxyState.ts     代理配置构建与归属判断的纯逻辑
├── compat/          平台检测
├── composables/     国际化逻辑
├── popup/           Popup 与设置页
├── services/        Clash API、存储和设置规则
└── types/           共享类型
```

后台脚本通过 `browser.runtime` 接收 UI 消息，并使用平台适配层管理代理。Popup 和设置页直接调用本机 Clash REST API 完成节点、模式、测速和连接检查。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `yarn dev` | 持续构建 Firefox 扩展 |
| `yarn dev:chrome` | 持续构建 Chrome 扩展 |
| `yarn test` | 运行单元测试 |
| `yarn build` | 类型检查并生成 `dist-firefox/` |
| `yarn build:chrome` | 类型检查并生成 `dist-chrome/` |
| `yarn firefox` | 构建并在临时浏览器中运行（默认 Zen，可用 `--firefox` 覆盖） |
| `yarn chrome` | 构建并在临时 Chrome/Chromium 中运行（可用 `CHROME_BIN` 覆盖） |
| `yarn lint:addon` | 构建并运行 AMO 静态校验 |
| `yarn package:addon` | 构建并生成 AMO 提交 ZIP |
| `yarn package:chrome` | 构建并生成 Chrome Web Store ZIP |
| `yarn package:source` | 生成供 AMO 审核的源码 ZIP |
| `yarn icons` | 从 SVG 重新生成各尺寸 PNG 图标 |
