import { describe, it, expect } from 'vitest'
import { runLayout } from '../src/core/layout'
import type { FamilyNode } from '../src/core/types'

// 父 P 有 3 个子：A(横向2子+孙) B(叶) C(横向2子+孙)
const root: FamilyNode = {
  id: 'r', name: '始祖', gender: 'm',
  children: [
    { id: 'A', name: '甲', gender: 'm', children: [
        { id: 'A1', name: '甲一', gender: 'm', children: [
            { id: 'A11', name: '甲一一', gender: 'm' }, { id: 'A12', name: '甲一二', gender: 'm' }] },
        { id: 'A2', name: '甲二', gender: 'm', children: [
            { id: 'A21', name: '甲二一', gender: 'm' }, { id: 'A22', name: '甲二二', gender: 'm' }, { id: 'A23', name: '甲二三', gender: 'm' }] }
      ] },
    { id: 'B', name: '乙', gender: 'm' },
    { id: 'C', name: '丙', gender: 'm', children: [
        { id: 'C1', name: '丙一', gender: 'm', children: [
            { id: 'C11', name: '丙一一', gender: 'm' }, { id: 'C12', name: '丙一二', gender: 'm' }] },
        { id: 'C2', name: '丙二', gender: 'm' }
      ] }
  ]
}

function deepNode(id: string, name: string, kids: FamilyNode[]): FamilyNode {
  return { id, name, gender: 'm', children: kids }
}
function famA(): FamilyNode {
  return deepNode('A', '甲', [
    deepNode('A1', '甲一', [
      { id: 'A11', name: '甲一', gender: 'm' }, { id: 'A12', name: '甲一', gender: 'm' }]),
    deepNode('A2', '甲二', [
      { id: 'A21', name: '甲二', gender: 'm' }, { id: 'A22', name: '甲二', gender: 'm' }, { id: 'A23', name: '甲二', gender: 'm' }])
  ])
}
function famC(): FamilyNode {
  return deepNode('C', '丙', [
    deepNode('C1', '丙一', [{ id: 'C11', name: '丙一', gender: 'm' }, { id: 'C12', name: '丙一', gender: 'm' }]),
    { id: 'C2', name: '丙二', gender: 'm' }
  ])
}

function treeWith(extra: FamilyNode[]): FamilyNode {
  return { id: 'r', name: '始祖', gender: 'm', children: extra }
}

describe('紧凑宝塔树叶子（轮廓避让）：只占卡片实际宽度、不虚撑有子兄弟间距', () => {
  it('深子树之间夹叶子 B：A→C 间距不变（B 坐在同层空档，深层兄弟仍直接避让）', () => {
    const gap = 100
    const withLeaf = runLayout(treeWith([famA(), { id: 'B', name: '乙', gender: 'm' }, famC()]), gap, 96, [], 12)
    const noLeaf = runLayout(treeWith([famA(), famC()]), gap, 96, [], 12)
    const a1 = withLeaf.nodes.find(n => n.id === 'A')!
    const b1 = withLeaf.nodes.find(n => n.id === 'B')!
    const c1 = withLeaf.nodes.find(n => n.id === 'C')!
    const a2 = noLeaf.nodes.find(n => n.id === 'A')!
    const c2 = noLeaf.nodes.find(n => n.id === 'C')!
    // A、C 两棵深子树的相对位置完全由它们的深层轮廓避让决定，叶子 B 不参与深层，故间距不变
    expect(Math.abs((c1.x - a1.x) - (c2.x - a2.x))).toBe(0)
    // B 仍按子序落在 A、C 之间（同层），且不与二者卡片重叠
    expect(a1.x).toBeLessThan(b1.x)
    expect(b1.x).toBeLessThan(c1.x)
    const HW = 16
    expect(b1.x - HW).toBeGreaterThanOrEqual(a1.x + HW)
    expect(c1.x - HW).toBeGreaterThanOrEqual(b1.x + HW)
  })

  it('同级叶子间保持统一列距（相邻叶子间距相等）', () => {
    const t = runLayout(treeWith([{ id: 'D', name: '丁', gender: 'm' }, { id: 'E', name: '戊', gender: 'm' }, { id: 'F', name: '己', gender: 'm' }]), 100, 96, [], 12)
    const d = t.nodes.find(n => n.id === 'D')!
    const e = t.nodes.find(n => n.id === 'E')!
    const f = t.nodes.find(n => n.id === 'F')!
    expect(Math.abs((e.x - d.x) - (f.x - e.x))).toBeLessThan(0.5)
  })
})