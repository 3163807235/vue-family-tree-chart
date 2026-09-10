# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。所有值得记录的行为变化均列于此。

## [Unreleased]

## [1.0.3] - 2026-09-10

### 布局与缩放

- 节点与吊线布局增强：吊线起点（下吊线顶点）随节点实际内容高度自适应，层间距由上一层内容下缘累积，上下连接线与文字保持统一 `PADDING_V` 净距。
- 折叠/展开按钮位置由布局单一来源（`node.dropY`）驱动，始终与吊线顶点对齐；按钮圆半径 8→6、符号字号 10→8，配色改为白底 + 连线同色描边 + 黑色符号。
- 折叠某节点后视口自动居中到该节点，避免树收缩导致节点移出视野。
- 布局以始祖为水平基准线整体居中（始祖 x = 0），调节间距时两侧对称延展、始祖恒定不漂移。
- 间距/字号调整不再触发自动重定位或缩放，保持当前视图与缩放比例稳定。
- 默认缩放改为恒定 1:1（viewBox 可视宽 = 容器像素宽），元素像素尺寸不再随节点数量变化。
- 首屏加载自动定位到始祖并应用默认缩放。

## [1.0.0] - 2026-09-09

### 构建发布（P0 组件化落地）

- 接入 `vite-plugin-dts`，`npm run build` 自动生成 `dist/index.d.ts` 及各模块类型声明。
- 产物命名规范化为 `index.es.mjs`（ESM）+ `index.umd.cjs`（CJS），`exports`/`main`/`module`/`types` 同步适配。
- 布局 Worker 改为 `?worker&inline` **内联 Blob**，消除库发布后 `assets/*` 绝对路径解析失效问题。
- 补齐发布元数据：`license`(MIT)、`author`、`repository`、`engines`(node>=18)、`unpkg`、`jsdelivr`。
- 新增 `.npmignore` 与 `files` 白名单，`prepublishOnly` 钩子（typecheck + test + build）。
- 新增 README：安装、快速开始、完整 API 表（Props/Emits/Slots/Expose）、主题变量与类型定义。

### 性能与渲染

- 实现视口虚拟渲染：仅绘制可见节点/连线（`useVirtualRender`），支持二分视口裁剪。
- 文本降级阈值 `textDegradeThreshold`：可见节点超限自动隐藏文字以保帧率。
- 布局算法接入 WebWorker 异步计算，Worker 不可用时自动降级主线程同步布局。

### 交互

- 拖拽平移与滚轮缩放（以鼠标为中心），`usePanZoom`。
- 节点点击折叠/展开，支持受控 `v-model:collapsed` 与折叠徽标（+ / −）。
- 全局折叠开关 `enableFold`，徽标位置与吊线起始圆视觉融合。
- 修复 `setPointerCapture` 造成的 `pointerup` target 重定向导致点击误判空白的问题。
- 修复点击空白误触发 `fitView` 重置视口的行为，保留用户自定义缩放。
- 修复挂载时 `getView` 快照死值导致拖拽瞬间放大的缺陷。
- 悬停分支高亮 `hoverHighlight`：60ms 防抖、祖先回溯 + 后代搜集，高亮连线加粗用 `--ftc-edge-hl-color`。
- 指针样式：常态为标准箭头，拖拽中抓手。

### 渲染与外观

- 节点默认渲染（`DefaultNode`）：姓名竖排、配偶列、排行/承继标签。
- 世系标尺 `GenRuler` 竖版排版，横向跟随视口定位缩放。
- 双向排版方向 `direction`（ltr/rtl）。
- 去掉节点矩形背景与边框，仅保留文字与图形，主题由 `--ftc-*` CSS 变量控制。

### 质量

- 全套单元测试（Vitest + jsdom）：core 布局/校验、composables 虚拟渲染、组件级交互回归，共 49 例。
- `vue-tsc --noEmit` 类型门禁。

## [0.1.0] - 初始化

- 项目骨架：Vue 3 + TypeScript + Vite、Vitest 测试框架搭建。
- `core` 目录：数据类型定义、宝塔吊线布局纯函数、Worker 入口、数据校验。
- 主组件 `FamilyTreeChart` 定义 Props / Emits / Slots，含受控状态与命令式 API。
- demo 演示页与控制面板（方向、排行、承继、间距、层距、字号等）。