# ClashVergeLink Firefox 原生化设计

## 目标

将现有 Chrome 扩展完整迁移为仅面向桌面 Firefox 的 WebExtension。在本机完成构建、临时安装和功能验证后，生成可提交 Mozilla Add-ons（AMO）的 ZIP 包。不保留 Chrome 构建、兼容分支或 Chrome 专用文档。

## 平台与扩展身份

- 使用 Manifest V3。
- Gecko ID 固定为 `clash-verge-link@dx`。
- 通过 `browser_specific_settings.gecko` 声明最低 Firefox 版本 142 与 AMO 要求的数据收集权限。
- 扩展不收集或向外部服务传输用户数据，数据收集权限声明为 `none`。
- 仅支持桌面 Firefox；不声明 Firefox for Android 支持。

## 架构

### 浏览器 API

源码统一使用 Firefox 原生的 `browser.*` Promise API，并使用 Firefox WebExtension TypeScript 类型。不引入跨浏览器 polyfill，不保留 `chrome.*` 调用或 Chrome 类型依赖。

### 后台脚本

Firefox 不支持 Manifest V3 的扩展后台 Service Worker，因此清单使用 `background.scripts` 加载后台模块。后台模块继续负责：

- 设置和清除浏览器代理；
- 响应 Popup 与设置页消息；
- 监听设置变化并重新应用代理；
- 注册打开设置页的扩展图标右键菜单。

### Firefox 代理配置

代理开启时写入 Firefox `proxy.settings` 的手动代理配置：

- `proxyType: "manual"`；
- `http` 指向 `127.0.0.1` 和用户配置的混合端口，并通过 `httpProxyAll` 应用于所有协议；
- `passthrough` 排除 `localhost` 与 `127.0.0.1`，避免本地 Clash API 请求进入代理循环。

代理状态只在当前配置的类型、主机和端口均匹配时判定为由本扩展开启。关闭时清除扩展设置的代理配置。

### UI 与业务逻辑

Popup、设置页、Clash REST API 客户端及现有交互保持不变。只替换浏览器 API 调用和相关术语，不进行无关 UI 重构。

## 构建与发布

- 移除 Chrome 专用的 `@crxjs/vite-plugin`。
- 使用 Vite 多入口构建 Popup、设置页和后台脚本。
- 构建产物固定输出到 `dist-firefox/`，清单、语言包和图标随产物复制。
- 使用 Mozilla `web-ext` 执行清单校验、本机 Firefox 临时运行和 AMO ZIP 打包。
- package scripts 提供测试、构建、lint、Firefox 启动和打包入口。

## 清理范围

删除以下不再需要的内容：

- `dist-chrome/`；
- `clash-verge-link-chrome_20260630_020404.zip`；
- 空的 `.claude/` 目录；
- 空模板 `USER.md`；
- 与根 README 重复且包含 Chrome 专用说明的 `src/background/README.md`、`src/popup/README.md`、`src/services/README.md`。
- 已完成且仅描述旧 Chrome 实现的 `docs/superpowers/plans/2026-07-16-extension-reliability-fixes.md`。

保留图标 SVG、各尺寸 PNG、图标生成脚本、测试及所有仍有运行时或构建引用的源码。局部 README 中仍有价值的架构信息合并到根 README。

## 文档

根 README 改写为 Firefox 专用说明，覆盖：功能、权限理由、开发命令、本机临时安装、验收步骤和 AMO 打包。隐私政策更新平台描述和日期，并与 Manifest 的无数据收集声明保持一致。

## 错误处理

- Firefox 代理 API 或权限失败时，向 Popup 返回错误并将持久化的代理开关回滚为关闭。
- 修改混合端口后重新应用代理失败时，清除代理并回滚状态。
- 未知消息继续返回明确错误。

## 验收标准

1. 单元测试通过，并覆盖 Firefox 代理配置归属判断。
2. TypeScript 类型检查和 Vite 生产构建通过。
3. 构建产物中不存在 `chrome.*`、Chrome Manifest 后台 Service Worker 或 Chrome 命名产物。
4. `web-ext lint` 无阻止 AMO 提交的错误。
5. Firefox 能临时载入扩展，Popup 和设置页正常打开。
6. 代理开启、关闭、状态恢复、端口变更、模式切换和节点切换均可正常工作。
7. 生成的 ZIP 仅包含 Firefox 运行所需文件，可作为新扩展提交 AMO。
