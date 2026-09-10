<!-- 默认节点渲染：姓名竖排 + 字典活配偶列 + 排行/承继标签 + 折叠徽标 -->
<script setup lang="ts">
import { computed } from 'vue'
import type { LayoutNode, Direction } from '../core/types'

interface TextStyleCfg {
  size: number
  color: string
  font: string
}

const props = defineProps<{
  node: LayoutNode
  direction: Direction
  spGap: number
  textMain: TextStyleCfg
  textAux: TextStyleCfg
  textDegraded: boolean
  showRank?: boolean
  showInherit?: boolean
  /** 全局开关：是否允许折叠/展开 */
  enableFold?: boolean
}>()

const SP_W = 12
const HH = 24
/** 文字内容区与上下连接线的统一垂直净距（与 layout.ts 的 PADDING_V 保持一致） */
const PAD_V = 5
/** 首字纵向锚点：= PAD_V + size/2，使首字上沿恒等于「卡顶 + PAD_V」，
 *  与布局端 nameOrigin 公式一致；字号增大文字向下伸展，与上连接线间距恒定 */
const NAME_TOP = computed(() => PAD_V + Math.round(props.textMain.size / 2))
/** 行距 = 1.05 × 字号（与布局端 lineH 公式一致） */
const LINE_H = computed(() => Math.round(props.textMain.size * 1.05))

// 卡左右半宽随内容自适应（竖排姓名列 + 配偶列），对齐基准保持在姓名列中线
const layout = computed(() => {
  const n = props.node
  const nameHW = props.textMain.size / 2 + 4
  const spouseBase = props.textMain.size / 2 + props.spGap
  const spouseHW = n.spouse && n.spouse.length
    ? spouseBase + (n.spouse.length - 1) * SP_W + props.textAux.size / 2 + 4
    : 0
  const ltr = props.direction !== 'rtl'
  const leftHW = ltr ? nameHW : Math.max(nameHW, spouseHW)
  const rightHW = ltr ? Math.max(nameHW, spouseHW) : nameHW
  const sign = ltr ? 1 : -1
  const spouseX: number[] = []
  if (n.spouse) {
    for (let s = 0; s < n.spouse.length; s++) spouseX.push(sign * (spouseBase + s * SP_W))
  }
  return { nameHW, spouseBase, spouseHW, leftHW, rightHW, spouseX }
})

// 竖排姓名：行距随字号（LINE_H），锚点随字号下移逐字下落（文字向下、不向上溢出）
const nameTspans = computed(() => {
  const n = props.node
  const name = n.name || ''
  return name.split('').map((ch, i) => ({ ch, y: Math.round(-HH + NAME_TOP.value + i * LINE_H.value) }))
})

// 排行/承继：节点正上方吊线旁竖排
const TITLE_ROW_H = 10
function titleTspans(text: string) {
  const len = text.length
  return text
    .split('')
    .map((ch, i) => ({ ch, y: Math.round(-HH - 15 + (i - (len - 1) / 2) * TITLE_ROW_H) }))
}

// 配偶竖排：行距随辅助字号
const spousePlans = computed(() => {
  const n = props.node
  if (!n.spouse) return []
  const spH = Math.round(props.textAux.size * 1.1)
  return n.spouse.map((spName, sIdx) => ({
    x: layout.value.spouseX[sIdx],
    chars: spName.split('').map((ch, i) => ({ ch, y: Math.round(-HH + NAME_TOP.value + i * spH) }))
  }))
})

// 折叠/展开按钮锚点：直接取布局写入的吊线顶点 dropY（默认卡底 HH），
// 与吊线同源同值，节点位置/字号/层级变化时按钮与吊线顶点始终同步
const others = computed(() => ({
  x: 0,                                      // 吊线沿节点中央向下
  y: props.node.dropY ?? HH                   // 吊线顶点（布局单一来源）
}))
</script>

<template>
  <g>
    <!-- 透明命中热区：卡片矩形 fill:none 且文字 pointer-events:none 时不参与 hit-test，
         该热区保证节点 g 可被 mouseenter/click 命中（高亮、折叠依赖它） -->
    <rect
      :x="-layout.leftHW - 4"
      :y="-HH - 4"
      :width="layout.leftHW + layout.rightHW + 8"
      :height="HH * 2 + 8"
      :rx="Math.min(7, (layout.leftHW + layout.rightHW) / 2)"
      fill="transparent"
      pointer-events="all"
    />
    <!-- 卡片背景：宽随内容自适应，圆角 -->
    <rect
      :x="-layout.leftHW"
      :y="-HH"
      :width="layout.leftHW + layout.rightHW"
      :height="HH * 2"
      :rx="Math.min(7, (layout.leftHW + layout.rightHW) / 2)"
      :class="['ftc-node-rect', node.depth === 0 && 'root', node.collapsed && 'collapsed']"
    />
    <template v-if="!textDegraded">
      <!-- 竖排姓名 -->
      <text class="ftc-node-text" fill="textMain" text-anchor="middle">
        <tspan
          v-for="(t, i) in nameTspans"
          :key="i"
          x="0"
          :y="t.y"
          dominant-baseline="central"
          :style="{ fontSize: textMain.size + 'px', fill: textMain.color, fontFamily: textMain.font || undefined }"
        >{{ t.ch }}</tspan>
      </text>

      <!-- 排行标签（男：长子/次子… 女：长女/次女…） -->
      <text v-if="node.rank && showRank !== false" class="ftc-node-rank" text-anchor="middle"
            transform="translate(8,0)">
        <tspan
          v-for="(t, i) in titleTspans(node.rank)"
          :key="i"
          x="0"
          :y="t.y"
          dominant-baseline="central"
          style="font-size:9px"
        >{{ t.ch }}</tspan>
      </text>

      <!-- 承继标签（继承/过继/兼祧/养子…），排行对面 -->
      <text v-if="node.inherit && showInherit !== false" class="ftc-node-inherit" text-anchor="middle"
            transform="translate(-8,0)">
        <tspan
          v-for="(t, i) in titleTspans(node.inherit)"
          :key="i"
          x="0"
          :y="t.y"
          dominant-baseline="central"
          style="font-size:9px"
        >{{ t.ch }}</tspan>
      </text>

      <!-- 配偶：竖排于姓名列侧，多任按列横向摊开 -->
      <text
        v-for="(sp, s) in spousePlans"
        :key="s"
        class="ftc-node-spouse"
        text-anchor="middle"
        :style="{ fontSize: textAux.size + 'px', fill: textAux.color, fontFamily: textMain.font || undefined }"
      >
        <tspan v-for="(c, i) in sp.chars" :key="i" :x="sp.x" :y="c.y" dominant-baseline="central">{{ c.ch }}</tspan>
      </text>
    </template>

    <!-- 折叠/展开按钮：置于名字列底部，双状态视觉反馈（折叠=+，展开=−） -->
    <g v-if="enableFold !== false && node.hasChildren" class="ftc-fold-badge">
      <circle :cx="others.x" :cy="others.y" :r="6" class="ftc-fold-dot" />
      <text :x="others.x" :y="others.y + 0.5" text-anchor="middle" dominant-baseline="middle" font-size="8" class="ftc-fold-text">{{ node.collapsed ? '+' : '−' }}</text>
    </g>
  </g>
</template>

<style scoped>
.ftc-node-rect {
  fill: none;
  stroke: none;
}
.ftc-node-rect.root {
  fill: none;
  stroke: none;
}
.ftc-node-rect.collapsed {
  stroke-width: 1.4;
}
.ftc-node-text { pointer-events: none; user-select: none; }
.ftc-node-rank {
  fill: var(--ftc-rank-color, #A58A70);
  pointer-events: none; user-select: none;
}
.ftc-node-inherit {
  fill: var(--ftc-inherit-color, #B0594F);
  pointer-events: none; user-select: none;
}
.ftc-node-spouse { pointer-events: none; user-select: none; }
/* 折叠/展开按钮：需可命中，故显式允许指针事件（徽标位于热区外） */
.ftc-fold-badge { pointer-events: all; cursor: pointer; }
/* 背景白色、描边与连线同色（--ftc-edge-color 或 #A97F4F）、图标黑色 */
.ftc-fold-dot { fill: #FFFFFF; stroke: var(--ftc-edge-color, #A97F4F); stroke-width: 1.2; }
.ftc-fold-text { fill: var(--ftc-edge-color, #A97F4F); font-weight: 700; }
</style>