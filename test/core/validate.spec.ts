import { describe, it, expect } from 'vitest'
import { validateFamily, countNodes } from '../../src/core/validate'
import type { FamilyNode } from '../../src/core/types'

const mk = (id: string, gender: 'm' | 'f' = 'm', children: FamilyNode[] = []): FamilyNode =>
  ({ id, name: id, gender, children })

describe('validateFamily', () => {
  it('合法树不抛错', () => {
    const tree = mk('1', 'm', [mk('2', 'f', [mk('3', 'm')]), mk('4', 'm')])
    expect(() => validateFamily(tree)).not.toThrow()
  })

  it('空入参抛 TypeError', () => {
    expect(() => validateFamily(null)).toThrow(TypeError)
  })

  it('缺少 id 抛 TypeError', () => {
    expect(() => validateFamily({ name: 'A', gender: 'm' })).toThrow(/id/)
  })

  it('重复 id 抛错', () => {
    const dup = mk('1', 'm', [mk('1', 'f')])
    expect(() => validateFamily(dup)).toThrow(/重复/)
  })

  it('非法 gender 抛错', () => {
    expect(() => validateFamily({ id: '1', name: 'A', gender: 'x' } as unknown as FamilyNode))
      .toThrow(/gender/)
  })

  it('children 非数组抛错', () => {
    expect(() => validateFamily({ id: '1', name: 'A', gender: 'm', children: {} as never }))
      .toThrow(/children/)
  })
})

describe('countNodes', () => {
  it('计数整棵树', () => {
    const tree = mk('1', 'm', [mk('2', 'f', [mk('3', 'm')]), mk('4', 'm', [mk('5', 'f'), mk('6', 'f')])])
    expect(countNodes(tree)).toBe(6)
  })

  it('null/undefined 返回 0', () => {
    expect(countNodes(null)).toBe(0)
    expect(countNodes(undefined)).toBe(0)
  })
})