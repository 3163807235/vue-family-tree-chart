<script setup lang="ts">
import { ref, reactive } from 'vue'
import { FamilyTreeChart } from '../src'
import type { FamilyNode, Direction, TextStyle } from '../src/core/types'

// 演示数据生成器（简化版，方便本地验证）
// 使用固定种子的伪随机数：保证每次刷新生成同一棵树，
// 避免因树宽不同导致 focusRoot 的 width/20 缩放比例不稳定、文字忽大忽小
const SURNAMES = '李王张刘陈杨赵黄'.split('')
const GIVEN = '世明文章志德永长兴启'.split('')
// 线性同余伪随机数（固定种子），替代 Math.random 使刷新后数据一致
let seed = 20260909
function rnd(): number {
  seed = (1103515245 * seed + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rnd() * arr.length)] }
function genFamily(target: number): FamilyNode {
  let counter = 0
  function mk(): FamilyNode {
    counter += 1
    const gender = rnd() < 0.5 ? 'm' : 'f'
    return {
      id: 'p' + counter,
      name: pick(SURNAMES) + pick(GIVEN),
      gender,
      spouse: rnd() < 0.35 ? (gender === 'm' ? ['刘氏', '张氏'] : ['赵氏']) : undefined,
      inherit: rnd() < 0.15 ? (['承继', '过继', '兼祧'] as const)[Math.floor(rnd() * 3)] : undefined,
      children: []
    }
  }
  const root = mk()
  const queue: FamilyNode[] = [root]
  let head = 0
  while (counter < target && head < queue.length) {
    const n = queue[head++]
    if ((n as unknown as { depth: number }).depth >= 8) continue
    const k = Math.max(1, Math.min(8, Math.round(2 + (rnd() * 2 - 1))))
    for (let i = 0; i < k && counter < target; i++) {
      const c = mk()
      ;(c as unknown as { depth: number }).depth = ((n as unknown as { depth: number }).depth || 0) + 1
      n.children!.push(c)
      queue.push(c)
    }
  }
  return root
}

const data = ref<FamilyNode>(genFamily(500))
const collapsed = ref<string[]>([])

// ===== 控制项状态（与原 HTML 一致），全部透传给组件 =====
const direction = ref<Direction>('ltr')
const showRank = ref(true)
const showInherit = ref(true)
const enableFold = ref(true)
const hoverHighlight = ref(true)
const gapX = ref(100)
const gapY = ref(96)
const spGap = ref(6)
const mainStyle = reactive<Partial<TextStyle>>({ size: 12, color: '#4A3222' })
const auxStyle = reactive<Partial<TextStyle>>({ size: 10, color: '#9A7D5C' })

// 步进辅助：范围限制
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

function onLayoutReady(info: { width: number; height: number; total: number }) {
  console.log('[demo] layoutReady', info)
}

function toggleRootFold() {
  collapsed.value = collapsed.value.includes('p1')
    ? collapsed.value.filter(x => x !== 'p1')
    : [...collapsed.value, 'p1']
}
</script>

<template>
  <div class="page">
    <h2>vue-family-tree-chart 本地验证</h2>

    <div class="panel">
      <button @click="data = genFamily(500)">重新生成 500</button>
      <button @click="collapsed = []">全部展开</button>
      <button @click="toggleRootFold()">折叠/展开始祖</button>

      <span class="sep"></span>
      <button :class="['tg', direction === 'ltr' && 'on']" @click="direction = 'ltr'">从左到右</button>
      <button :class="['tg', direction === 'rtl' && 'on']" @click="direction = 'rtl'">从右到左</button>
      <button :class="['tg', showRank && 'on']" @click="showRank = !showRank">排行</button>
      <button :class="['tg', showInherit && 'on']" @click="showInherit = !showInherit">承继</button>
      <button :class="['tg', enableFold && 'on']" @click="enableFold = !enableFold">折叠</button>
      <button :class="['tg', hoverHighlight && 'on']" @click="hoverHighlight = !hoverHighlight">高亮</button>

      <span class="sep"></span>
      <label class="ctl">间距
        <input type="range" min="56" max="400" v-model.number="gapX">
      </label>
      <label class="ctl">层距
        <input type="range" min="70" max="180" v-model.number="gapY">
      </label>
      <label class="ctl">配偶距
        <input type="range" min="0" max="30" v-model.number="spGap">
      </label>

      <span class="sep"></span>
      <label class="ctl">主字号
        <input type="range" min="8" max="24" v-model.number="mainStyle.size" style="width:80px">
      </label>
      <label class="ctl">辅字号
        <input type="range" min="8" max="20" v-model.number="auxStyle.size" style="width:80px">
      </label>
    </div>

    <div class="chart-wrap">
      <FamilyTreeChart
        :data="data"
        v-model:collapsed="collapsed"
        v-model:direction="direction"
        :gap-x="gapX"
        :gap-y="gapY"
        :sp-gap="spGap"
        :show-rank="showRank"
        :show-inherit="showInherit"
        :enable-fold="enableFold"
        :hover-highlight="hoverHighlight"
        :main-style="mainStyle"
        :aux-style="auxStyle"
        @layout-ready="onLayoutReady"
      />
    </div>
  </div>
</template>

<style>
html, body { margin: 0; height: 100%; font-family: sans-serif; }
#app { height: 100%; }
.page { display: flex; flex-direction: column; height: 100%; padding: 12px; box-sizing: border-box; overflow: hidden; }
.panel {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin-bottom: 8px; padding: 8px 10px; border: 1px solid #E4D5C0;
  border-radius: 6px; background: #FFFDF7;
}
.panel button { padding: 5px 10px; border: 1px solid #D8B48A; border-radius: 4px; background: #FFF; cursor: pointer; }
.panel button.on { background: #9C3E28; color: #FFF4E0; border-color: #7E2F1F; }
.panel .sep { width: 1px; height: 22px; background: #E0CDB4; margin: 0 2px; }
.panel .ctl { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #5A4632; }
.panel input[type=range] { width: 110px; }
.chart-wrap { flex: 1; min-height: 0; }
</style>