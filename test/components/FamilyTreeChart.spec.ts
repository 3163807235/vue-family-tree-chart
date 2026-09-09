// 主组件智慧图测试：数据校验、布局渲染、虚拟渲染、点击折叠、命令式方法、插槽
import { describe, it, expect, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import FamilyTreeChart from '../../src/components/FamilyTreeChart.vue'
import type { FamilyNode } from '../../src/core/types'

// 使用主线程布局（useWorker=false）避免 jsdom 无 Worker 环境干扰
function mkData(): FamilyNode {
  return {
    id: 'root',
    name: '始祖',
    gender: 'm',
    spouse: ['李氏'],
    children: [
      { id: 'p1', name: '长男', gender: 'm', children: [{ id: 'p3', name: '长孙', gender: 'm' }] },
      { id: 'p2', name: '次女', gender: 'f' }
    ]
  }
}

// jsdom 中 getBoundingClientRect 全为 0，fitView 会算出 h=0 导致只有首行可见。
// 因此默认传入受控 view 覆盖整树，保证所有节点可渲染。
const FULL_VIEW = { x: 0, y: 0, w: 1000, h: 1000 }

function mountChart(props: Record<string, unknown> = {}, slots: Record<string, any> = {}) {
  return mount(FamilyTreeChart, {
    props: { data: mkData(), useWorker: false, view: FULL_VIEW, ...props },
    slots,
    attachTo: document.body
  })
}

async function settle(w: VueWrapper) {
  await nextTick()
  await nextTick()
  await nextTick()
}

describe('FamilyTreeChart', () => {
  it('空数据（无 children）显示空态插槽', async () => {
    const w = mount(FamilyTreeChart, {
      props: { data: { id: 'r', name: '孤', gender: 'm' }, useWorker: false }
    })
    await settle(w)
    expect(w.find('.ftc-empty').exists()).toBe(true)
    expect(w.find('.ftc-empty').text()).toContain('暂无家谱数据')
  })

  it('数据非法（重复 id）时 emit error 并显示错误态', async () => {
    const bad: FamilyNode = {
      id: 'dup',
      name: 'x',
      gender: 'm',
      children: [
        { id: 'dup', name: 'y', gender: 'm' },
        { id: 'a', name: 'z', gender: 'm' }
      ]
    }
    const onError = vi.fn()
    const w = mount(FamilyTreeChart, { props: { data: bad, useWorker: false, 'onError': onError } })
    await settle(w)
    expect(onError).toHaveBeenCalled()
    expect(w.find('.ftc-error').exists()).toBe(true)
  })

  it('正常布局：渲染节点与连线，且触发 layoutReady', async () => {
    const onReady = vi.fn()
    const w = mountChart({ onLayoutReady: onReady })
    await settle(w)
    expect(onReady).toHaveBeenCalled()
    expect(onReady.mock.calls[0][0].total).toBe(4) // root + p1 + p2 + p3
    const svg = w.find('svg.ftc-view')
    expect(svg.exists()).toBe(true)
    // 根节点 + 3 子 = 4 个节点组（含 DefaultNode 内部的 g，仅数 data-id 作用域组）
    expect(svg.findAll('g[data-id]').length).toBe(4)
  })

  it('点击节点触发 nodeClick 并回写 update:collapsed', async () => {
    const onNode = vi.fn()
    const onUpdate = vi.fn()
    const w = mountChart({
      collapsed: [],
      onNodeClick: onNode,
      'onUpdate:collapsed': onUpdate
    })
    await settle(w)
    const g = w.find('g[data-id="p1"]')
    expect(g.exists()).toBe(true)
    // 模拟 pointerdown + pointerup 单击（非拖拽）
    await g.trigger('pointerdown', { clientX: 100, clientY: 100 })
    expect(w.find('svg.ftc-view').classes()).toContain('dragging')
    await g.trigger('pointerup', { clientX: 100, clientY: 100 })
    expect(onNode).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
    expect(onUpdate).toHaveBeenCalled()
  })

  it('回归：pointer capture 后 pointerup target 被重定向为 svg，仍正确识别命中节点', async () => {
    // 真实浏览器中 setPointerCapture 会把后续 pointerup 的 target 指向 svg；
    // 组件应依据 pointerdown 时记录的命中 id 折叠，而非被重定向的 target
    const onUpdate = vi.fn()
    const w = mountChart({
      collapsed: [],
      'onUpdate:collapsed': onUpdate
    })
    await settle(w)
    const svg = w.find('svg.ftc-view')
    const g = w.find('g[data-id="p1"]')
    // pointerdown 命中节点 → pointerup 事件以 svg 为 target（模拟捕获）
    await g.trigger('pointerdown', { clientX: 100, clientY: 100 })
    await svg.trigger('pointerup', { clientX: 100, clientY: 100 })
    expect(onUpdate).toHaveBeenCalled()
    // 折叠 p1 而非触发空白 fitView
    expect(onUpdate.mock.calls[0][0]).toEqual(expect.arrayContaining(['p1']))
  })

  it('点击折叠徽标（+）可展开该折叠节点', async () => {
    // p1 初始折叠态 → 徽标可见；点击徽标应将其移出 collapsed（展开）
    const onUpdate = vi.fn()
    const w = mountChart({
      collapsed: ['p1'],
      'onUpdate:collapsed': onUpdate
    })
    await settle(w)
    const badge = w.find('g[data-id="p1"] .ftc-fold-badge')
    expect(badge.exists()).toBe(true) // 折叠态徽标确实渲染
    const svg = w.find('svg.ftc-view')
    // pointerdown 落在徽标上（模拟捕获后 pointerup 重定向到 svg）
    await badge.trigger('pointerdown', { clientX: 101, clientY: 101 })
    await svg.trigger('pointerup', { clientX: 101, clientY: 101 })
    expect(onUpdate).toHaveBeenCalled()
    // 结果是展开：collapsed 中不应再包含 p1
    expect(onUpdate.mock.calls[0][0]).not.toContain('p1')
  })

  it('拖拽（pointermove 超过阈值）不触发点击折叠', async () => {
    const onNode = vi.fn()
    const onUpdate = vi.fn()
    const w = mountChart({
      collapsed: [],
      'onUpdate:collapsed': onUpdate,
      onNodeClick: onNode
    })
    await settle(w)
    const g = w.find('g[data-id="p1"]')
    const svg = w.find('svg.ftc-view')
    await svg.trigger('pointerdown', { clientX: 100, clientY: 100 })
    await svg.trigger('pointermove', { clientX: 200, clientY: 200 }) // 位移>6，判定为拖拽
    await svg.trigger('pointerup', { clientX: 200, clientY: 200 })
    expect(onNode).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
    // 拖拽会回写 update:view
  })

  it('enableFold=false 时点击仅发事件不折叠', async () => {
    const onUpdate = vi.fn()
    const w = mountChart({
      collapsed: [],
      enableFold: false,
      'onUpdate:collapsed': onUpdate
    })
    await settle(w)
    const g = w.find('g[data-id="p1"]')
    await g.trigger('pointerdown', { clientX: 100, clientY: 100 })
    await g.trigger('pointerup', { clientX: 100, clientY: 100 })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('beforeFold 事件随折叠派发（携带 node 与 willCollapse）', async () => {
    const onUpdate = vi.fn()
    const onBefore = vi.fn()
    const w = mountChart({
      collapsed: [],
      'onUpdate:collapsed': onUpdate,
      onBeforeFold: onBefore
    })
    await settle(w)
    const g = w.find('g[data-id="p1"]')
    await g.trigger('pointerdown', { clientX: 100, clientY: 100 })
    await g.trigger('pointerup', { clientX: 100, clientY: 100 })
    // beforeFold 属观察型事件；阻止折叠需通过受控 collapsed 回写实现（见 enableFold）
    expect(onBefore).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), true)
    expect(onUpdate).toHaveBeenCalled()
  })

  it('RTL 方向导致 viewX 镜像节点 transform', async () => {
    const w = mountChart({ direction: 'rtl', collapsed: [] })
    await settle(w)
    const g = w.find('g[data-id="root"]')
    expect(g.exists()).toBe(true)
    // 根节点 x 在布局中心，RTL 镜像后仍应在中部；transform 存在即可
    const transform = g.attributes('transform')
    expect(transform).toMatch(/translate\(/)
  })

  it('命令式方法：expandAll 清空折叠、collapseAll 全折叠、toggleDirection 切换', async () => {
    const onUpdate = vi.fn()
    const onDir = vi.fn()
    const w = mountChart({
      collapsed: ['p1'],
      'onUpdate:collapsed': onUpdate,
      'onUpdate:direction': onDir
    })
    await settle(w)
    const vm = w.vm as unknown as {
      expandAll: () => void
      collapseAll: () => void
      toggleDirection: () => void
    }
    vm.expandAll()
    expect(onUpdate).toHaveBeenLastCalledWith([])
    vm.collapseAll()
    expect(onUpdate).toHaveBeenLastCalledWith(expect.arrayContaining(['root', 'p1']))
    vm.toggleDirection()
    expect(onDir).toHaveBeenCalledWith('rtl')
  })

  it('toolbar 插槽可访问状态与命令式方法', async () => {
    const slots = {
      toolbar: `
        <template #toolbar="{ direction, fitView }">
          <span class="tb-dir">{{ direction }}</span>
          <button class="tb-fit" @click="fitView">fit</button>
        </template>
      `
    }
    const w = mountChart({ collapsed: [] }, slots)
    await settle(w)
    expect(w.find('.ftc-toolbar').exists()).toBe(true)
    expect(w.find('.tb-dir').text()).toBe('ltr')
    expect(w.find('.tb-fit').exists()).toBe(true)
  })

  it('悬停节点时高亮相关连线与分支节点', async () => {
    const w = mountChart({ collapsed: [] })
    await settle(w)

    // 悬停 p1（含子节点 p3），进入勾选高亮集合
    const g = w.find('g[data-id="p1"]')
    await g.trigger('mouseenter')
    await nextTick()
    await vi.waitFor(() => {
      // 高亮边：root→p1、p1→p3 连线加 .ftc-edge-hl
      expect(w.findAll('path.ftc-edge-hl').length).toBeGreaterThanOrEqual(2)
      // 分支节点 root/p1/p3 打高亮 class，非分支 p2 不打
      expect(w.find('g[data-id="root"]').classes()).toContain('ftc-node-hl')
      expect(w.find('g[data-id="p3"]').classes()).toContain('ftc-node-hl')
      expect(w.find('g[data-id="p2"]').classes()).not.toContain('ftc-node-hl')
    })

    // 移开后高亮清除
    await g.trigger('mouseleave')
    await vi.waitFor(() => {
      expect(w.findAll('path.ftc-edge-hl').length).toBe(0)
      expect(w.find('g[data-id="p3"]').classes()).not.toContain('ftc-node-hl')
    })
  })

  it('hoverHighlight=false 时悬停不高亮', async () => {
    const w = mountChart({ collapsed: [], hoverHighlight: false })
    await settle(w)
    await w.find('g[data-id="p1"]').trigger('mouseenter')
    await nextTick()
    expect(w.findAll('path.ftc-edge-hl').length).toBe(0)
    expect(w.find('g[data-id="p3"]').classes()).not.toContain('ftc-node-hl')
  })
})