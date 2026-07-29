# ClashVergeLink

ClashVergeLink 是一个仅面向桌面 Firefox 的扩展，通过 Firefox Proxy API 控制浏览器代理，并通过 Clash Verge Rev 的本地 REST API 切换运行模式、策略组和节点。

## 功能

- 一键开启或关闭 Firefox 浏览器代理
- 切换 Clash 的规则模式和全局模式
- 选择策略组与代理节点
- 单节点测速和限流批量测速
- 中英文界面、深色和浅色主题

扩展只影响 Firefox，不修改操作系统的全局代理。

## 环境要求

- 桌面 Firefox 142 或更高版本
- Clash Verge Rev，并开启 `external-controller`
- Yarn 1.x
- Node.js 20.19+ 或 22.13+；推荐使用仓库指定的 Node.js 20

## 开发

```bash
yarn install
yarn test
yarn build
```

构建产物位于 `dist-firefox/`。开发时持续构建：

```bash
yarn dev
```

## 在 Firefox 中测试

自动创建临时 Firefox 配置并载入扩展：

```bash
yarn firefox
```

使用 macOS 上的 Zen 浏览器时：

```bash
yarn firefox --firefox /Applications/Zen.app/Contents/MacOS/zen
```

也可以手动载入：

1. 执行 `yarn build`。
2. 在 Firefox 打开 `about:debugging#/runtime/this-firefox`。
3. 点击“临时载入附加组件”。
4. 选择 `dist-firefox/manifest.json`。
5. 在扩展详情中允许扩展在隐私窗口中运行。Firefox 的代理设置会同时影响普通窗口和隐私窗口，没有该授权时 `proxy.settings.set()` 会失败。

建议至少验证以下流程：

1. 打开 Popup，确认可以连接本机 Clash API。
2. 开启代理并访问网页，再关闭代理确认恢复直连。
3. 修改混合端口并保存，确认代理仍可用。
4. 切换规则/全局模式、策略组和节点。
5. 执行单节点与批量测速。
6. Clash 离线时确认仍可关闭已开启的浏览器代理，并可保存设置。
7. 从扩展图标右键菜单打开设置页。

## AMO 校验与打包

提交前先更新 `package.json` 和 `manifest.json` 中的版本号，然后执行：

```bash
yarn test
yarn lint:addon
yarn package:addon
yarn package:source
```

`web-ext lint` 会检查 Firefox Manifest 与常见 AMO 问题。`package:addon` 生成待签名扩展，`package:source` 生成 AMO 审核压缩代码时需要的对应源码包，两者都输出到 `web-ext-artifacts/`。扩展的 Gecko ID 为 `clash-verge-link@dx`，后续版本必须保持不变。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `proxy` | 设置和清除 Firefox 浏览器代理 |
| `storage` | 在 Firefox 本地保存扩展设置 |
| `contextMenus` | 在扩展图标右键菜单中提供设置入口 |
| 本机地址访问权限 | 连接 `127.0.0.1` 或 `localhost` 上的 Clash REST API |

扩展不使用分析、广告或远程遥测服务。具体说明见 [PRIVACY.md](PRIVACY.md)。

## 项目结构

```text
src/
├── assets/          样式与图标
├── background/      Firefox 后台脚本与代理状态判断
├── composables/     国际化逻辑
├── popup/           Popup 与设置页
├── services/        Clash API、存储和设置规则
└── types/           共享类型
```

后台脚本通过 `browser.runtime` 接收 UI 消息，并使用 `browser.proxy` 管理代理。Popup 和设置页直接调用本机 Clash REST API 完成节点、模式、测速和连接检查。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `yarn dev` | 持续构建 Firefox 扩展 |
| `yarn test` | 运行单元测试 |
| `yarn build` | 类型检查并生成 `dist-firefox/` |
| `yarn firefox` | 构建并在临时 Firefox 配置中运行 |
| `yarn lint:addon` | 构建并运行 AMO 静态校验 |
| `yarn package:addon` | 构建并生成提交 ZIP |
| `yarn package:source` | 生成供 AMO 审核的源码 ZIP |
| `yarn icons` | 从 SVG 重新生成各尺寸 PNG 图标 |
