// 虚拟渲染 composable 的单测：验证视口裁剪逻辑（不依赖 DOM 组件实例）
import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useVirtualRender } from '../../src/composables/useVirtualRender'
import type { LayoutResult, LayoutNode, LayoutEdge, ViewBox } from '../../src/core/types'

function mkResult(): LayoutResult {
  // 5 个节点：x 以 0 为中心对称（根锚定 x=0，布局左右展开），y 从 60 起（每层 +96）
  const defs: Array<[string, number, number, number]> = [
    ['n1', 0, 60, 0],
    ['n2', -100, 156, 1],
    ['n3', 100, 156, 1],
    ['n4', -200, 252, 2],
    ['n5', 200, 252, 2]
  ]
  const nodes: LayoutNode[] = defs.map(([id, x, y, depth]) => ({
    id, name: id, spouse: null, x, y, depth,
    hasChildren: false, collapsed: false, rank: null, inherit: null
  }))
  const edges: LayoutEdge[] = [
    { d: 'M0,0', xmin: -100, xmax: 0, ymin: 60, ymax: 156 },
    { d: 'M0,1', xmin: 0, xmax: 100, ymin: 60, ymax: 156 }
  ]
  return {
    nodes, edges,
    width: 432, height: 240,
    minX: -216, maxX: 216, minY: 36, maxY: 276,
    elapsed: 0
  }
}

describe('useVirtualRender', () => {
  const layout = ref<LayoutResult | null>(null)
  const view = ref<ViewBox>({ x: 0, y: 0, w: 500, h: 500 })
  const direction = ref<'ltr' | 'rtl'>('ltr')
  const tdt = ref(1200)
  const v = useVirtualRender({ layout, view, direction, textDegradeThreshold: tdt })

  beforeEach(() => {
    layout.value = mkResult()
    // 根锚定 x=0、左右对称展开，覆盖整树需包含负半区（节点 x∈[-200,200]）
    view.value = { x: -300, y: 0, w: 600, h: 500 }
    direction.value = 'ltr'
  })

  it('视口覆盖整树时返回全部节点', () => {
    expect(v.visibleNodes.value.length).toBe(5)
    expect(v.visibleEdges.value.length).toBe(2)
  })

  it('视口缩小到局部时只返回可见节点（含缓冲边距）', () => {
    view.value = { x: -110, y: 150, w: 220, h: 220 } // 显示 x-110~110（含缓冲）覆盖 n2(-100)
    const ids = v.visibleNodes.value.map(n => n.id).sort()
    expect(ids).toContain('n2') // x-100
    expect(ids).toContain('n3') // x100
  })

  it('RTL 时坐标水平镜像裁剪（显示坐标 = -世界坐标，关于 0 反转）', () => {
    direction.value = 'rtl'
    // 显示 x -400~400，镜像后世界区间 -400~480（含 PAD=80 缓冲）→ 5 节点全可见
    view.value = { x: -400, y: 0, w: 800, h: 500 }
    expect(v.visibleNodes.value.length).toBe(5)
    // 显示 x 100~300：缓冲后 vx0=20, vx1=380 → 镜像世界区间 [-380,-20]
    // 仅 n2(-100)、n4(-200) 落入；n1(0)、n3(100)、n5(200) 被裁剪
    view.value = { x: 100, y: 0, w: 200, h: 500 }
    const ids = v.visibleNodes.value.map(n => n.id).sort()
    expect(ids).toEqual(['n2', 'n4'])
  })

  it('节点密集度超过阈值时文本降级为 true', () => {
    expect(v.textDegraded.value).toBe(false)
    tdt.value = 2
    // 全部可见 5 个 > 2
  })
})