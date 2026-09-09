// 默认节点渲染组件单测：姓名竖排、配偶列、排行/承继标签、折叠徽标、文本降级
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DefaultNode from '../../src/components/DefaultNode.vue'
import type { LayoutNode, Direction } from '../../src/core/types'

const textMain = { size: 12, color: '#333', font: '' }
const textAux = { size: 10, color: '#999', font: '' }

function mkNode(over: Partial<LayoutNode> = {}): LayoutNode {
  return {
    id: 'n1',
    name: '李小明',
    spouse: null,
    x: 0,
    y: 0,
    depth: 0,
    hasChildren: false,
    collapsed: false,
    rank: null,
    inherit: null,
    ...over
  }
}

function mountNode(node: LayoutNode, opts: Partial<{
  direction: Direction
  spGap: number
  textDegraded: boolean
  showRank: boolean
  showInherit: boolean
  enableFold: boolean
}> = {}) {
  return mount(DefaultNode, {
    props: {
      node,
      direction: opts.direction ?? 'ltr',
      spGap: opts.spGap ?? 6,
      textMain,
      textAux,
      textDegraded: opts.textDegraded ?? false,
      showRank: opts.showRank,
      showInherit: opts.showInherit,
      enableFold: opts.enableFold
    }
  })
}

describe('DefaultNode', () => {
  it('竖排输出姓名：每个汉字一个 tspan', () => {
    const w = mountNode(mkNode({ name: '李小明' }))
    const texts = w.findAll('text.ftc-node-text tspan')
    expect(texts.length).toBe(3)
    expect(texts.map(t => t.text()).join('')).toBe('李小明')
  })

  it('渲染配偶列（多任横向摊开）', () => {
    const w = mountNode(mkNode({ spouse: ['刘氏', '张氏'] }))
    const spouseGroups = w.findAll('text.ftc-node-spouse')
    expect(spouseGroups.length).toBe(2)
    // 每任配偶竖排成字
    expect(spouseGroups[0].findAll('tspan').length).toBe(2) // 刘氏
    expect(spouseGroups[1].findAll('tspan').length).toBe(2) // 张氏
  })

  it('渲染排行与承继标签', () => {
    const w = mountNode(mkNode({ rank: '长子', inherit: '承继' }))
    expect(w.find('text.ftc-node-rank').exists()).toBe(true)
    expect(w.find('text.ftc-node-inherit').exists()).toBe(true)
  })

  it('showRank/showInherit=false 时隐藏对应标签', () => {
    const w = mountNode(mkNode({ rank: '长子', inherit: '承继' }), { showRank: false, showInherit: false })
    expect(w.find('text.ftc-node-rank').exists()).toBe(false)
    expect(w.find('text.ftc-node-inherit').exists()).toBe(false)
  })

  it('启用折叠且节点有子节点时渲染折叠/展开按钮，状态反馈正确', () => {
    // 折叠态 → '+'
    const collapsed = mountNode(mkNode({ collapsed: true, hasChildren: true }), { enableFold: true })
    expect(collapsed.find('g.ftc-fold-badge').exists()).toBe(true)
    expect(collapsed.find('g.ftc-fold-badge text').text()).toBe('+')
    // 展开态 → '−'
    const expanded = mountNode(mkNode({ collapsed: false, hasChildren: true }), { enableFold: true })
    expect(expanded.find('g.ftc-fold-badge').exists()).toBe(true)
    expect(expanded.find('g.ftc-fold-badge text').text()).toBe('−')
  })

  it('无子节点的节点不渲染折叠按钮', () => {
    const w = mountNode(mkNode({ collapsed: false, hasChildren: false }), { enableFold: true })
    expect(w.find('g.ftc-fold-badge').exists()).toBe(false)
  })

  it('enableFold=false 时隐藏折叠按钮', () => {
    const w = mountNode(mkNode({ collapsed: true, hasChildren: true }), { enableFold: false })
    expect(w.find('g.ftc-fold-badge').exists()).toBe(false)
  })

  it('未折叠节点不渲染折叠徽标', () => {
    const w = mountNode(mkNode({ collapsed: false }))
    expect(w.find('g.ftc-fold-badge').exists()).toBe(false)
  })

  it('文本降级时不渲染姓名/配偶/标签文字，仅保留卡片', () => {
    const w = mountNode(mkNode({ spouse: ['刘氏'], rank: '长子' }), { textDegraded: true })
    expect(w.find('text.ftc-node-text').exists()).toBe(false)
    expect(w.find('text.ftc-node-spouse').exists()).toBe(false)
    expect(w.find('text.ftc-node-rank').exists()).toBe(false)
    expect(w.find('rect.ftc-node-rect').exists()).toBe(true)
  })

  it('根节点卡片带 root 类，折叠节点带 collapsed 类', () => {
    const root = mountNode(mkNode({ depth: 0 }))
    expect(root.find('rect.ftc-node-rect').classes()).toContain('root')
    const folded = mountNode(mkNode({ depth: 2, collapsed: true }))
    expect(folded.find('rect.ftc-node-rect').classes()).toContain('collapsed')
  })
})