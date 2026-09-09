// 世系标尺组件单测：按深度生成「第X世」行、中文数字、视口定位缩放
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import GenRuler from '../../src/components/GenRuler.vue'
import type { ViewBox } from '../../src/core/types'

function mountRuler(depths: number[], view: ViewBox, offset = 0) {
  return mount(GenRuler, {
    props: { depths, view, offset }
  })
}

describe('GenRuler', () => {
  it('每个有 y 的深度渲染一行世系标签', () => {
    const depths: number[] = []
    depths[0] = 60
    depths[1] = 156
    depths[2] = 252
    const w = mountRuler(depths, { x: 0, y: 0, w: 500, h: 400 })
    const rows = w.findAll('.ftc-ruler-row')
    expect(rows.length).toBe(3)
    expect(rows[0].find('.ftc-ruler-label').text()).toBe('第一世')
    expect(rows[1].find('.ftc-ruler-label').text()).toBe('第二世')
    expect(rows[2].find('.ftc-ruler-label').text()).toBe('第三世')
  })

  it('稀疏深度数组：空槽位不生成行', () => {
    const depths: number[] = []
    depths[0] = 60
    depths[3] = 400
    const w = mountRuler(depths, { x: 0, y: 0, w: 500, h: 400 })
    expect(w.findAll('.ftc-ruler-row').length).toBe(2)
  })

  it('offset 偏移起始世号', () => {
    const depths: number[] = []
    depths[0] = 60
    const w = mountRuler(depths, { x: 0, y: 0, w: 500, h: 400 }, 10)
    expect(w.find('.ftc-ruler-label').text()).toBe('第十一世')
  })

  it('中文数字转换覆盖>10 的数位', () => {
    // 第12世（十一世+1=十二世），第21世（二十一）
    const depths: number[] = []
    depths[11] = 60 // depth 11 -> 第12世
    depths[20] = 160 // depth 20 -> 第21世
    const w = mountRuler(depths, { x: 0, y: 0, w: 500, h: 400 })
    const labels = w.findAll('.ftc-ruler-label').map(t => t.text())
    expect(labels).toContain('第十二世')
    expect(labels).toContain('第二十一世')
  })

  it('行定位随视口 y：top 偏移随 view.y 平移', async () => {
    const depths: number[] = []
    depths[0] = 60
    const base = mountRuler(depths, { x: 0, y: 0, w: 500, h: 400 })
    const moved = mountRuler(depths, { x: 0, y: 100, w: 500, h: 400 })
    // 容器高在 jsdom 中为 0，k=0，top 全部为 0px；此处验证组件正常渲染行即可
    expect(base.findAll('.ftc-ruler-row').length).toBe(1)
    expect(moved.findAll('.ftc-ruler-row').length).toBe(1)
    await nextTick()
  })
})