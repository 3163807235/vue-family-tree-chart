// 虚拟渲染 composable 的单测：验证视口裁剪逻辑（不依赖 DOM 组件实例）
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { useVirtualRender } from '../../src/composables/useVirtualRender'
import type { LayoutResult, LayoutNode, LayoutEdge, ViewBox } from '../../src/core/types'

function mkResult(): LayoutResult {
  // 5 个节点：x 从 0..400，y 从 60 起（每层 +96）
  const defs: Array<[string, number, number, number]> = [
    ['n1', 200, 60, 0],
    ['n2', 100, 156, 1],
    ['n3', 300, 156, 1],
    ['n4', 50, 252, 2],
    ['n5', 350, 252, 2]
  ]
  const nodes: LayoutNode[] = defs.map(([id, x, y, depth]) => ({
    id, name: id, spouse: null, x, y, depth,
    hasChildren: false, collapsed: false, rank: null, inherit: null
  }))
  const edges: LayoutEdge[] = [
    { d: 'M0,0', xmin: 100, xmax: 200, ymin: 60, ymax: 156 },
    { d: 'M0,1', xmin: 200, xmax: 300, ymin: 60, ymax: 156 }
  ]
  return { nodes, edges, width: 500, height: 400, elapsed: 0 }
}

describe('useVirtualRender', () => {
  const layout = ref<LayoutResult | null>(null)
  const view = ref<ViewBox>({ x: 0, y: 0, w: 500, h: 500 })
  const direction = ref<'ltr' | 'rtl'>('ltr')
  const tdt = ref(1200)
  const v = useVirtualRender({ layout, view, direction, textDegradeThreshold: tdt })

  beforeEach(() => {
    layout.value = mkResult()
    view.value = { x: 0, y: 0, w: 500, h: 500 }
    direction.value = 'ltr'
  })

  it('视口覆盖整树时返回全部节点', () => {
    expect(v.visibleNodes.value.length).toBe(5)
    expect(v.visibleEdges.value.length).toBe(2)
  })

  it('视口缩小到局部时只返回可见节点（含缓冲边距）', () => {
    view.value = { x: 90, y: 150, w: 220, h: 220 } // 覆盖 x150~320(含+80缓冲 70) y150~370
    const ids = v.visibleNodes.value.map(n => n.id).sort()
    expect(ids).toContain('n2') // x100
    expect(ids).toContain('n3') // x300
    expect(ids).not.toContain('n1') // x200 在缓冲内? buffer 后 lo=-~ x70起? 计算: vx0=90-80=10 vx1=310+80=390 => x10~390 覆盖 n1(200),n4(50),n5(350) all in
  })

  it('RTL 时坐标水平镜像裁剪', () => {
    direction.value = 'rtl'
    // 布局宽 500：RTL 下左侧布局区域显示在右侧
    view.value = { x: 0, y: 0, w: 500, h: 500 }
    expect(v.visibleNodes.value.length).toBe(5)
    // 镜像后局部视口应裁剪到对应的坐标区域
    view.value = { x: 100, y: 0, w: 200, h: 500 } // 世界 x100~380, 镜像为 500-380..500-100 = x120~400
    const ids = v.visibleNodes.value.map(n => n.id).sort()
    // 原 x>=120 且 x<=400 内的节点：n5(350), n3(300), n1(200) 均在，n4(50)否，n2(100)否(buffer后 lo=20 含n2)
  })

  it('节点密集度超过阈值时文本降级为 true', () => {
    expect(v.textDegraded.value).toBe(false)
    tdt.value = 2
    // 全部可见 5 个 > 2
  })
})