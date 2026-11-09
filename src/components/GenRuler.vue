<!-- 世系标尺：随视口垂直定位的「第X世」标签，缩放时等比缩放 -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import type { ViewBox } from '../core/types'

interface RulerLine {
  depth: number
  y: number
}

const props = defineProps<{
  /** 每世深度对应的世界坐标 y；元素下标即深度 */
  depths: number[]
  /** 当前视口（世界坐标） */
  view: ViewBox
  /** 深度偏移：第几世 = depth + 1 + offset（用于片段起始世号），默认 0 */
  offset?: number
  /** 基准字号（世界缩放前），默认 12 */
  baseFontSize?: number
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const containerH = ref(0)

/** 中文数字（1-99） */
const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
function cnNum(n: number): string {
  if (n <= 10) return n === 10 ? '十' : CN[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  let s = tens === 1 ? '十' : CN[tens] + '十'
  if (ones) s += CN[ones]
  return s
}

const lines = computed<RulerLine[]>(() => {
  const out: RulerLine[] = []
  for (let d = 0; d < props.depths.length; d++) {
    const y = props.depths[d]
    if (y === undefined) continue
    out.push({ depth: d, y })
  }
  return out
})

// 缩放系数：世界比 → 屏幕比
const k = computed(() => containerH.value / Math.max(1, props.view.h))

const rowStyle = computed(() => {
  const fs = Math.max(4, Math.round((props.baseFontSize ?? 12) * k.value))
  const padV = Math.max(1, Math.round(8 * k.value))
  const padH = Math.max(1, Math.round(6 * k.value))
  const rad = Math.max(2, Math.round(6 * k.value))
  const bw = Math.max(0.5, Math.round(1 * k.value * 10) / 10)
  // 竖排字距（writing-mode vertical 下沿垂直主轴向生效）
  const ls = Math.max(2, Math.round(fs * 0.4))
  return {
    fs, bw, rad, ls,
    pad: `${padV}px ${padH}px`
  }
})

function labelOf(depth: number): string {
  return '第' + cnNum(depth + 1 + (props.offset ?? 0)) + '世'
}

function topOf(line: RulerLine): string {
  return Math.round((line.y - props.view.y) * k.value) + 'px'
}

function measure() {
  if (containerRef.value) {
    containerH.value = containerRef.value.getBoundingClientRect().height
  }
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
})
// view 或容器尺寸驱动重新测量（节流避免每帧都测）
watch(
  () => [props.view.w, props.view.h, props.view.x, props.view.y],
  () => measure(),
  { flush: 'post' }
)
</script>

<template>
    <div ref="containerRef" class="ftc-ruler-layer">
      <div
        v-for="line in lines"
        :key="line.depth"
        class="ftc-ruler-row"
        :style="{
          top: topOf(line),
          fontSize: rowStyle.fs + 'px',
          padding: rowStyle.pad,
          borderRadius: rowStyle.rad + 'px',
          borderWidth: rowStyle.bw + 'px',
          letterSpacing: rowStyle.ls + 'px'
        }"
      >
        <span class="ftc-ruler-label">{{ labelOf(line.depth) }}</span>
      </div>
    </div>
  </template>

  <style scoped>
  .ftc-ruler-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .ftc-ruler-row {
    position: absolute;
    left: 8px;
    color: var(--ftc-ruler-color, #9C3E28);
    background: var(--ftc-ruler-bg, #FFF2DE);
    border: solid var(--ftc-ruler-border, #D9A46A);
    border-width: inherit;
    border-radius: inherit;
    line-height: 1;
    white-space: nowrap;
    font-family: var(--ftc-font-family, 'PingFang SC', 'Microsoft YaHei', sans-serif);
    font-weight: 600;
    /* 竖版排版：文字自上而下逐字排列 */
    writing-mode: vertical-rl;
    /* 竖排后文字块变高，top 原指块顶；上移半高使其以节点 y 为垂直中心 */
    transform: translateY(-50%);
  }
  </style>