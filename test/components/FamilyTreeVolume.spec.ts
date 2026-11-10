// 成册组件渲染测试：叶数、总目跳转事件、人物定位 API
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FamilyTreeVolume from '../../src/components/FamilyTreeVolume.vue'
import { createVolumePlan } from '../../src/core/volume/registry'
import type { FamilyNode } from '../../src/core/types'

const tree: FamilyNode = {
  id: 'a',
  name: '周邦',
  gender: 'm',
  children: [
    { id: 'b', name: '廷芬', gender: 'm', children: [{ id: 'e', name: '邦霖', gender: 'm' }] },
    { id: 'c', name: '廷苏', gender: 'm' }
  ]
}

const plan = createVolumePlan({
  title: '周氏宗谱',
  clanName: '汝南堂',
  edition: '己亥三修',
  compiler: '二十三世孙 某某 主修',
  compileDate: '二〇二六年孟冬',
  tree,
  chapters: [
    {
      id: 'preface',
      kind: 'preface',
      title: '序',
      content: {
        type: 'text',
        blocks: [
          { kind: 'heading', text: '序' },
          { kind: 'paragraph', text: '家之有谱，犹国之有史。'.repeat(10) },
          { kind: 'signature', text: '二十三世孙 某某 谨撰' }
        ]
      }
    },
    {
      id: 'biography',
      kind: 'biography',
      content: { type: 'bios', essays: [{ personId: 'b', name: '廷芬', text: '公讳廷芬，字兰谷。' }] }
    }
  ]
})

function exposed(w: ReturnType<typeof mount>) {
  const e = (w.vm.$ as unknown as { exposed: Record<string, unknown> }).exposed
  const r = e.result as { value?: unknown } | unknown
  const result = (r as { value?: unknown }).value ?? r
  return { e, result: result as import('../../src/core/volume/types').VolumeResult }
}

describe('FamilyTreeVolume', () => {
  it('每叶渲染一张筒子页，封面扉页不编叶码', () => {
    const w = mount(FamilyTreeVolume, { props: { plan } })
    const { result } = exposed(w)
    expect(result.pages.length).toBeGreaterThan(0)
    expect(w.findAll('.ftc-volume-page').length).toBe(result.pages.length)
    expect(result.pages[0].chapterKind).toBe('cover')
    expect(result.pages[0].leafNumber).toBe('')
    expect(result.pages[2].leafNumber).toBe('一')
  })

  it('总目条目点击派发 navigate 事件并指向该章首叶', async () => {
    const w = mount(FamilyTreeVolume, { props: { plan } })
    const { result } = exposed(w)
    const entries = w.findAll('.ftc-volume-toc rect')
    expect(entries.length).toBe(result.toc.length)
    await entries[0].trigger('click')
    const events = w.emitted('navigate') as unknown as [{ leafIndex: number }][]
    expect(events).toBeTruthy()
    expect(events[0][0].leafIndex).toBe(result.toc[0].leafIndex)
  })

  it('暴露章节与人物定位 API', () => {
    const w = mount(FamilyTreeVolume, { props: { plan } })
    const { e, result } = exposed(w)
    const leafOfChapter = e.leafOfChapter as (id: string) => number
    const leafOfPerson = e.leafOfPerson as (id: string, t?: 'register' | 'bio' | 'tree') => number
    expect(leafOfChapter('register')).toBe(
      result.chapterSpans.find(s => s.chapterId === 'register')!.startLeaf
    )
    expect(leafOfPerson('b', 'register')).toBeGreaterThanOrEqual(0)
    expect(leafOfPerson('b', 'bio')).toBeGreaterThanOrEqual(0)
    expect(leafOfPerson('b', 'tree')).toBeGreaterThanOrEqual(0)
    expect(leafOfPerson('zzz', 'register')).toBe(-1)
  })
})
