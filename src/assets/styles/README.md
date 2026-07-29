# 样式管理模块

## 模块职责

管理全局视觉样式、设计系统（Design System）和 CSS 自定义属性，为所有 UI 组件提供统一的视觉语言基础。供 Popup（380px 弹窗）和设置页（全屏新标签页）共用。

## 文件说明

| 文件              | 职责                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_variables.scss` | 全局 CSS 自定义属性：色彩体系（深色太空蓝基调）、圆角四级、阴影、毛玻璃参数、字体家族/字号、间距、过渡动画、布局尺寸（Popup 宽高、页面最大宽、侧栏宽）                                                     |
| `_mixins.scss`    | 复用 SCSS Mixin：`custom-scrollbar`、`glassmorphism`、`text-ellipsis`、`text-clamp`、`flex-center`、`flex-between`、`interactive`、`focus-ring`、`pill`、`status-dot`、`fade-in`、`spin`、`skeleton-pulse` |
| `main.scss`       | 全局 Reset（`box-sizing`、`margin/padding`）、`body` 基础样式、`#app` 容器、`button`/`input` 统一样式、SVG 图标约束                                                                                        |

## 使用规范

### 1. 主题微调

修改 `_variables.scss` 中的 CSS 变量即可快速切换视觉主题：

```scss
--color-accent: #58a6ff; // 主色调
--color-accent-hover: #79c0ff; // 悬停
--color-accent-muted: rgba(88, 166, 255, 0.12); // 弱化背景
```

### 2. 组件样式开发

强制使用 CSS 变量，禁止硬编码颜色值：

```scss
// ✅ 正确
.my-component {
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
}

// ❌ 错误
.my-component {
  color: #333;
  background: #fff;
}
```

### 3. Mixin 调用

各组件的 `<style scoped>` 中按需引入：

```scss
@use '../../assets/styles/mixins' as mix;

.panel {
  @include mix.glassmorphism;
  @include mix.custom-scrollbar;
}
.list-item {
  @include mix.interactive;
  @include mix.text-ellipsis;
}
.loading {
  @include mix.spin;
}
```

### 4. 过渡动画

所有交互元素使用 `cubic-bezier(0.4, 0, 0.2, 1)` 缓动，三级速度：

- `--transition-fast` (150ms)：按钮 hover、焦点切换
- `--transition-base` (250ms)：面板展开/收起
- `--transition-slow` (350ms)：模态框进出

## 维护注意事项

- 新增色彩变量需确保暗色模式下对比度 ≥ WCAG AA 级（4.5:1）
- `main.scss` 仅放全局 Reset 和基础元素样式，禁止注入组件级样式
- Mixin 保持纯净（无副作用），仅生成 CSS 属性
- Popup 与设置页共用变量文件但各自控制尺寸约束（Popup 380px，设置页 100vw）
