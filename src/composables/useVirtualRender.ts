// 视口虚拟渲染：按当前 viewBox 裁剪可见节点与连线，只渲染可见区域
import { computed, shallowRef, watch, type Ref } from 'vue'
import type {
  LayoutResult,
  LayoutNode,
  LayoutEdge,
  ViewBox,
  Direction
} from '../core/types'

export interface VirtualRenderState {
  /** 未排序的原始节点/连线 */
  layout: Ref<LayoutResult | null>
  /** 当前视口（世界坐标） */
  view: Ref<ViewBox>
  /** 排版方向 */
  direction: Ref<Direction>
  /** 文本降级阈值：可见节点超过此数时只画矩形不画文字 */
  textDegradeThreshold: Ref<number>
}

/** 缓冲边距：略超出视口的部分也渲染，避免边缘闪烁 */
const PAD = 80

/** 在按 x 升序的数组上二分，返回第一个 x >= lo 的下标 */
function lowerBoundX(nodes: { x: number }[], lo: number): number {
  let a = 0
  let b = nodes.length
  while (a < b) {
    const m = (a + b) >> 1
    if (nodes[m].x < lo) a = m + 1
    else b = m
  }
  return a
}

/** 在按 ymin 升序的数组上二分，返回第一个 ymin >= lo 的下标 */
function lowerBoundY(edges: { ymin: number }[], lo: number): number {
  let a = 0
  let b = edges.length
  while (a < b) {
    const m = (a + b) >> 1
    if (edges[m].ymin < lo) a = m + 1
    else b = m
  }
  return a
}

/**
 * 虚拟渲染 hooks：输入布局结果与视口，输出当前仅可见的节点/连线数组。
 * 依赖的下标数组（nodes 按 x、edges 按 ymin 升序）必须在 layout 更新时排序
 *（由组件在 applyLayout 时构建，避免每次渲染重复排序）。
 */
export function useVirtualRender(state: VirtualRenderState) {
  // 排好序的下标数组：仅在布局结果变化时重建
  const sorted = shallowRef<{
    nodes: LayoutNode[]
    edges: LayoutEdge[]
  } | null>(null)

  watch(
    () => state.layout.value,
    (r) => {
      if (!r) {
        sorted.value = null
        return
      }
      sorted.value = {
        // 不可变快照（普通数组引用），供二分使用；nodes 按 x、edges 按 ymin 升序
        nodes: [...r.nodes].sort((a, b) => a.x - b.x),
        edges: [...r.edges].sort((a, b) => a.ymin - b.ymin)
      }
    },
    { immediate: true }
  )

  // 可见节点（经 RTL 坐标镜像后裁剪）
  const visibleNodes = computed(() => {
    const r = state.layout.value
    const s = sorted.value
    if (!r || !s) return []
    const v = state.view.value
    const rtl = state.direction.value === 'rtl'
    const VW = r.width
    const vx0 = v.x - PAD
    const vx1 = v.x + v.w + PAD
    const vy0 = v.y - PAD
    const vy1 = v.y + v.h + PAD
    // RTL：坐标层水平反转，lo/hi 为镜像后的可见世界区间
    const lo = rtl ? VW - vx1 : vx0
    const hi = rtl ? VW - vx0 : vx1
    const out: LayoutNode[] = []
    const idx = lowerBoundX(s.nodes, lo)
    for (let i = idx; i < s.nodes.length; i++) {
      const n = s.nodes[i]
      if (n.x > hi) break
      if (n.y < vy0 || n.y > vy1) continue
      out.push(n)
    }
    return out
  })

  // 可见连线（按 ymin 二分）
  const visibleEdges = computed(() => {
    const r = state.layout.value
    const s = sorted.value
    if (!r || !s) return []
    const v = state.view.value
    const rtl = state.direction.value === 'rtl'
    const VW = r.width
    const vx0 = v.x - PAD
    const vx1 = v.x + v.w + PAD
    const vy0 = v.y - PAD
    const vy1 = v.y + v.h + PAD
    const lo = rtl ? VW - vx1 : vx0
    const hi = rtl ? VW - vx0 : vx1
    const out: LayoutEdge[] = []
    const idx = lowerBoundY(s.edges, vy0)
    for (let i = idx; i < s.edges.length; i++) {
      const ed = s.edges[i]
      if (ed.ymin > vy1) break
      if (ed.ymax < vy0) continue
      if (ed.xmax < lo || ed.xmin > hi) continue
      out.push(ed)
    }
    return out
  })

  // 文本降级：可见节点过密时只画矩形，加速渲染
  const textDegraded = computed(
    () => visibleNodes.value.length > state.textDegradeThreshold.value
  )

  return { visibleNodes, visibleEdges, textDegraded }
}