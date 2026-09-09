# vue-family-tree-chart

面向家谱场景的「宝塔吊线图」Vue 3 组件：基于 WebWorker 布局计算 + SVG 视口虚拟渲染，支持万级节点流畅交互、拖拽缩放、节点折叠、悬停分支高亮。

## 特性

- ⚡ **高性能**：WebWorker 异步布局 + 视口二分虚拟渲染，仅渲染可见节点/连线；文字自动降级。
- 🖱️ **丰富交互**：拖拽平移、滚轮以鼠标为中心缩放、节点点击折叠/展开、悬停高亮祖先链整条分支。
- 🎨 **强定制**：`--ftc-*` CSS 变量主题、主/辅文字样式、排版方向（ltr/rtl）、世系标尺。
- 📦 **TypeScript 友好**：完整类型导出，数据校验、受控属性、命令式 API 齐备。

## 安装

```bash
npm install vue-family-tree-chart
```

## 快速开始

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FamilyTreeChart } from 'vue-family-tree-chart'
import 'vue-family-tree-chart/style.css'
import type { FamilyNode } from 'vue-family-tree-chart'

const data = ref<FamilyNode>({
  id: 'root',
  name: '始',
  gender: 'm',
  children: [
    { id: 'a', name: '长', gender: 'm' },
    { id: 'b', name: '次', gender: 'f', spouse: ['某氏'] }
  ]
})
const collapsed = ref<string[]>([])
</script>

<template>
  <FamilyTreeChart :data="data" v-model:collapsed="collapsed" />
</template>
```

> 数据 `children` 的顺序即长幼顺序；`spouse` 为配偶名数组。

## Props

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `data` | `FamilyNode` | `-`（必填） | 家谱根节点 |
| `collapsed` | `string[]` | `[]` | 受控：折叠节点 id 集合（`v-model:collapsed`） |
| `view` | `ViewBox` | 内部 | 受控：视口 `{x,y,w,h}`（`v-model:view`） |
| `gapX` | `number` | `100` | 横向单元间距 |
| `gapY` | `number` | `96` | 纵向层间距（`70~180`） |
| `spGap` | `number` | `6` | 配偶文字与姓名列间距 |
| `direction` | `'ltr' \| 'rtl'` | `'ltr'` | 排版方向（`v-model:direction`） |
| `showRank` | `boolean` | `true` | 显示排行标签 |
| `showInherit` | `boolean` | `true` | 显示承继标签 |
| `mainStyle` | `Partial<TextStyle>` | - | 主节点文字样式 |
| `auxStyle` | `Partial<TextStyle>` | - | 配偶辅助文字样式 |
| `useWorker` | `boolean` | `true` | 启用 WebWorker 布局 |
| `textDegradeThreshold` | `number` | `1200` | 可见节点超过此数不渲染文字 |
| `showRuler` | `boolean` | `true` | 显示世系标尺 |
| `enableFold` | `boolean` | `true` | 允许节点折叠/展开 |
| `interactive` | `boolean` | `true` | 启用平移/缩放交互 |
| `hoverHighlight` | `boolean` | `true` | 悬停高亮相关分支 |

## Emits

| 事件 | 载荷 | 说明 |
|------|------|------|
| `update:collapsed` | `string[]` | 折叠集合变化 |
| `update:view` | `ViewBox` | 视口变化 |
| `update:direction` | `Direction` | 排版方向变化 |
| `nodeClick` | `FamilyNode` | 节点单击 |
| `nodeDblclick` | `FamilyNode` | 节点双击 |
| `beforeFold` | `(node, willCollapse)` | 折叠前钩子（可自定义拦截） |
| `metrics` | `PerfMetrics` | 性能指标更新 |
| `layoutReady` | `{width,height,total}` | 布局完成 |
| `error` | `Error` | 数据错误 |

## 命令式方法（expose）

| 方法 | 说明 |
|------|------|
| `fitView()` | 适配整树到视口 |
| `focusNode(id)` | 聚焦到指定节点 |
| `expandAll()` | 展开全部 |
| `collapseAll()` | 折叠全部节点 |
| `toggleDirection()` | 切换 ltr/rtl |

```vue
<script setup>
const chart = ref()
onMounted(() => chart.value.fitView())
</script>
<template>
  <FamilyTreeChart ref="chart" :data="data" />
</template>
```

## Slots

| 名称 | 载荷 | 说明 |
|------|------|------|
| `empty` | - | 空数据时的展示 |
| `error` | `{ error }` | 数据错误时的展示 |
| `overload` | `{ total }` | 节点数超限时的展示 |
| `toolbar` | `{ direction, gapX, gapY, collapsed, setDirection, toggleDirection, expandAll, collapseAll, fitView, focusNode }` | 自定义工具条 |
| `metrics` | `{ metrics }` | 自定义性能浮层 |

## 主题（CSS 变量）

```css
.vue-family-tree-chart-container {
  --ftc-bg: #FCF7EC;          /* 背景 */
  --ftc-text-color: #4A3222;  /* 正文/节点文字 */
  --ftc-edge-color: #A97F4F;  /* 连线 */
  --ftc-edge-hl-color: #C0392B; /* 高亮连线 */
  --ftc-hint-color: #9A7D5C;  /* 提示文字 */
}
```

## 类型

```ts
interface FamilyNode {
  id: string
  name: string
  gender: 'm' | 'f'
  spouse?: string[]
  inherit?: '承继' | '过继' | '兼祧'
  children?: FamilyNode[]
}

interface ViewBox { x: number; y: number; w: number; h: number }
interface TextStyle { size: number; color: string; font: string }
```

## 浏览器支持

现代浏览器（Chromium / Firefox / Safari）。依赖 `WebWorker`、`PointerEvent`、`setPointerCapture`、SVG。
- Worker 不可用时自动降级为主线程布局。
- 如应用中禁用 Worker（内联环境），设 `:use-worker="false"`。

## 开发与测试

```bash
npm install
npm run dev        # 运行 demo
npm test           # 单元测试（Vitest）
npm run typecheck  # vue-tsc 类型检查
npm run build      # 打包库（ESM + UMD + 类型 + 样式）
```

## License

MIT