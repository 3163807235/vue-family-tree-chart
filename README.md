# family-tree-chart

面向家谱场景的「宝塔吊线图」Vue 3 组件：基于 WebWorker 布局计算 + SVG 视口虚拟渲染，支持万级节点流畅交互、拖拽缩放、节点折叠、悬停分支高亮。

## 特性

- ⚡ **高性能**：WebWorker 异步布局 + 视口二分虚拟渲染，仅渲染可见节点/连线；文字自动降级。
- 🖱️ **丰富交互**：拖拽平移、滚轮以鼠标为中心缩放、节点点击折叠/展开、悬停高亮祖先链整条分支。
- 🎨 **强定制**：`--ftc-*` CSS 变量主题、主/辅文字样式、排版方向（ltr/rtl）、世系标尺。
- 📖 **谱牒版刻**：`FamilyTreeBook` 谱书（牒记式竖排筒子页）与 `FamilyTreeVolume` 成册（封面/扉页/总目/十二章体/图版），句读可开关、可着色。
- 📦 **TypeScript 友好**：完整类型导出，数据校验、受控属性、命令式 API 齐备。

## 安装

```bash
npm install family-tree-chart
```

## 快速开始

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FamilyTreeChart } from 'family-tree-chart'
import 'family-tree-chart/style.css'
import type { FamilyNode } from 'family-tree-chart'

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
| `spGap` | `number` | `7` | 配偶文字与姓名列间距 |
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
| `spouseFormat` | `'full' \| 'surname'` | `'full'` | 配偶文字格式：完整姓名 / 某氏（如「王芳」→「王氏」），仅影响展示 |

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

## 谱书（FamilyTreeBook）

按牒记式古籍行款把 `FamilyNode` 树排成 A3 横版筒子页（四周双边版框、乌丝栏界格、版心双鱼尾与竖排谱名、竖排从右至左），支持跨半叶折页、翻页续传。

```vue
<script setup lang="ts">
import { FamilyTreeBook } from 'family-tree-chart'
import 'family-tree-chart/style.css'
import type { FamilyNode } from 'family-tree-chart'

const data: FamilyNode = { id: 'root', name: '周邦', gender: 'm', children: [] }
</script>

<template>
  <FamilyTreeBook :data="data" title="周氏宗谱" running-title="世系简录" :enable-punct="true" />
</template>
```

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `data` | `FamilyNode` | -（必填） | 家谱根节点 |
| `pageWidth` / `pageHeight` | `number` | `1587` / `1123` | 纸张尺寸（A3 横版，96dpi） |
| `margin` | `number` | `64` | 版框距左右纸边 |
| `topMargin` / `bottomMargin` | `number` | `76` / `56` | 天头 / 地脚 |
| `nameSize` / `bioSize` | `number` | `28` / `14` | 姓名字号 / 传文字号 |
| `bioLineSpacing` | `number` | `1.15` | 传文行距倍数 |
| `nameFontFamily` / `bioFontFamily` | `string` | `''` | 姓名字体 / 传文字体（空串随系统） |
| `nameFontWeight` | `string \| number` | `'bold'` | 姓名字重 |
| `gridColWidth` | `number` | `40` | 乌丝栏格宽 |
| `spineWidth` | `number` | `60.47` | 版心宽度（16mm） |
| `title` | `string` | `''` | 版心竖排谱名 |
| `runningTitle` | `string` | `''` | 书眉（仅章首叶） |
| `enablePunct` | `boolean` | `true` | 句读开关：开＝标点下沉前字右下角（古籍句读式紧凑排版），关＝标点格内居中 |
| `punctColor` | `string` | `''` | 句读点颜色（空串随正文墨色） |

## 成册（FamilyTreeVolume）

把整部家谱编排为完整成册：封面、扉页、总目、各体章节（序跋、凡例、恩荣录、字辈谱、世系图、世系录、传记、艺文、后记）与图版，一叶一筒子页。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FamilyTreeVolume, createVolumePlan } from 'family-tree-chart'
import 'family-tree-chart/style.css'

const plan = ref(createVolumePlan({
  title: '周氏宗谱',
  clanName: '汝南堂',
  tree: data,
  punct: { enable: true, color: '#9c2b2b' },   // 句读开关与颜色
  toc: { maxLevel: 1 },                        // 总目层级：0=仅卷，1=卷+节
  pageSetup: { bindingType: 'staple', stapleCount: 2 }
}))
</script>

<template>
  <FamilyTreeVolume :plan="plan" @navigate="({ chapterId }) => console.log(chapterId)" />
</template>
```

| 名称 | 类型 | 说明 |
|------|------|------|
| `plan` | `VolumePlan` | 成册计划（`createVolumePlan` 产出，可序列化） |
| `customRenderers` | `Record<string, CustomRenderer>` | 自定义章节渲染器，键为章节 id 或 kind |

事件：`navigate`（`{ leafIndex, chapterId }`，点击总目条目/章节跳转）、`page-click`（`{ leafIndex }`）。

**总目版式**：一叶 40 格（筒子页左右半叶各 20 格），首叶最外两格合为「总目」章名；条目一格一条——标题竖排于格上、叶码竖排齐底、两者间以竖直虚线相连，不画乌丝栏列分隔线。**卷次（「卷一」「卷二」）仅在整谱分册装订时由 `ChapterSpec.ordinal` 显式给出，单册不自动编号、总目不冠卷次。**

成册计划相关 API：`createChapter` / `insertChapter` / `removeChapter` / `moveChapter` / `setChapterEnabled` / `appendPreface`。

## 主题（CSS 变量）

```css
.family-tree-chart-container {
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

**PolyForm Noncommercial License 1.0.0** —— 仅限非商业用途，全文见 [LICENSE](./LICENSE)。

允许：个人学习、研究、实验、兴趣项目、教学与科研机构、慈善/公共机构等非商业场景使用、修改与分发（须保留许可声明）。

不允许：任何商业目的的使用（包括但不限于商业产品集成、SaaS 付费服务、企业内部商业运营、外包交付等）。

商业使用需另行获得授权，请联系 <3163807235@qq.com>。

> 注：v1.3.0 及更早版本按 MIT 协议发布，其授权不可撤销；自本文件生效之日起的新版本采用上述非商业许可。
