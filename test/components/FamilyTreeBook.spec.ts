// 谱书组件测试：姓名展示变换与按页 SVG 导出
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FamilyTreeBook from '../../src/components/FamilyTreeBook.vue'
import type { FamilyNode } from '../../src/core/types'

describe('FamilyTreeBook', () => {
  it('nameFormatter 参与谱书排版，getPageSvg 返回独立 SVG 且不修改原树', () => {
    const data: FamilyNode = {
      id: 'a',
      name: '周邦',
      gender: 'm',
      children: [{ id: 'b', name: '廷芬', gender: 'm' }]
    }
    const w = mount(FamilyTreeBook, {
      props: { data, nameFormatter: () => '隐' }
    })
    const exposed = (w.vm.$ as unknown as { exposed: Record<string, unknown> }).exposed
    const getPageSvg = exposed.getPageSvg as (index: number) => string
    const svg = getPageSvg(0)
    expect(svg).toContain('<svg')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('>隐</tspan>')
    expect(() => getPageSvg(-1)).toThrow(RangeError)
    expect(() => getPageSvg(1)).toThrow(RangeError)
    expect(data.name).toBe('周邦')
    expect(data.children![0].name).toBe('廷芬')
  })
})
