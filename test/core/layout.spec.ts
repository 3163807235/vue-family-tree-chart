import { describe, it, expect } from 'vitest'
import { runLayout } from '../../src/core/layout'
import type { FamilyNode } from '../../src/core/types'

const mk = (id: string, name: string, gender: 'm' | 'f', children: FamilyNode[] = []): FamilyNode =>
  ({ id, name, gender, children })

describe('runLayout', () => {
  it('根节点位于顶层（depth=0），y 为顶部基准', () => {
    const root = mk('1', 'A', 'm')
    const r = runLayout(root, 100, 96, [])
    expect(r.nodes.length).toBe(1)
    expect(r.nodes[0].depth).toBe(0)
    expect(r.nodes[0].x).toBeGreaterThan(0) // 叶子左锚定于卡宽范围
    expect(r.nodes[0].y).toBe(60) // BASE_Y
  })

  it('生成父子之间的吊线连线，边数 = 子女总数（宝塔汇聚于父）', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm'),
      mk('3', 'C', 'f')
    ])
    const r = runLayout(root, 100, 96, [])
    expect(r.edges.length).toBe(2)
    // 父节点应位于两个子女中心
    const a = r.nodes.find(n => n.id === '1')!
    const xMid = (a.x - 0) // 父 x 应为两子均值推导，这里验证父卡在子区间内
    const children = r.nodes.filter(n => n.id !== '1')
    expect(children[0].x).toBeLessThan(children[1].x)
    expect(xMid).toBeGreaterThanOrEqual(0)
    expect(a.x).toBe((children[0].x + children[1].x) / 2)
  })

  it('兄弟按 children 顺序从左到右排列（长子居左）', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm'),
      mk('3', 'C', 'm'),
      mk('4', 'D', 'm')
    ])
    const r = runLayout(root, 100, 96, [])
    const ids = r.nodes.filter(n => n.id !== '1').sort((a, b) => a.x - b.x).map(n => n.id)
    expect(ids).toEqual(['2', '3', '4'])
  })

  it('折叠节点不铺开其子孙，但自身保留', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm', [mk('5', 'E', 'f')]),
      mk('3', 'C', 'm')
    ])
    const r = runLayout(root, 100, 96, ['2'])
    const ids = r.nodes.map(n => n.id)
    expect(ids).toContain('1')
    expect(ids).toContain('2')
    expect(ids).not.toContain('5') // E 是 B 的子孙，被折叠去除
    expect(ids).toContain('3')
    expect(r.nodes.find(n => n.id === '2')!.collapsed).toBe(true)
  })

  it('折叠空数组等同于全部展开', () => {
    const root = mk('1', 'A', 'm', [mk('2', 'B', 'm', [mk('3', 'C', 'm')])])
    expect(runLayout(root, 100, 96, []).nodes.length).toBe(3)
  })

  it('为非根节点生成排行标签（长子/长女/次子…）', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm'),
      mk('3', 'C', 'f'),
      mk('4', 'D', 'm')
    ])
    const r = runLayout(root, 100, 96, [])
    const rank = (id: string) => r.nodes.find(n => n.id === id)!.rank
    expect(rank('2')).toBe('长子')
    expect(rank('3')).toBe('长女')
    expect(rank('4')).toBe('次子')
  })

  it('gapX 增大使多列布局更宽', () => {
    const wideRoot = mk('1', 'A', 'm', [
      mk('2', 'B', 'm', [mk('5', 'E', 'f')]),
      mk('3', 'C', 'm', [mk('6', 'F', 'f')]),
      mk('4', 'D', 'm', [mk('7', 'G', 'f')])
    ])
    const tight = runLayout(wideRoot, 80, 70, [])
    const loose = runLayout(wideRoot, 160, 140, [])
    expect(loose.width).toBeGreaterThan(tight.width)
  })

  it('gapY 增大使深层布局更高', () => {
    const deepRoot = mk('1', 'A', 'm', [mk('2', 'B', 'm', [mk('3', 'C', 'm', [mk('4', 'D', 'm')])])])
    expect(runLayout(deepRoot, 80, 70, []).height)
      .toBeLessThan(runLayout(deepRoot, 80, 140, []).height)
  })
})