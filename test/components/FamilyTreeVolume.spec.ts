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
  it('每叶渲染一张筒子页，封面扉页总目不编叶码', () => {
    const w = mount(FamilyTreeVolume, { props: { plan } })
    const { result } = exposed(w)
    expect(result.pages.length).toBeGreaterThan(0)
    expect(w.findAll('.ftc-volume-page').length).toBe(result.pages.length)
    expect(result.pages[0].chapterKind).toBe('cover')
    expect(result.pages[0].leafNumber).toBe('')
    expect(result.pages[1].chapterKind).toBe('titlePage')
    expect(result.pages[2].chapterKind).toBe('toc')
    expect(result.pages[2].leafNumber).toBe('')
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

  it('世系图姓名竖排：一字一行、纵向排布于节点中心列', () => {
    const w = mount(FamilyTreeVolume, { props: { plan } })
    const { result } = exposed(w)
    const treePage = result.pages.find(p => p.tree)
    expect(treePage).toBeTruthy()
    // 取景对齐版框上沿，图幅自上方起排
    expect(w.find('.ftc-volume-tree').attributes('preserveAspectRatio')).toContain('YMin')
    const expected = Array.from(treePage!.tree!.nodes[0].name).length
    const spans = w.find('.ftc-volume-tree text').findAll('tspan')
    expect(spans.length).toBe(expected)
    expect(new Set(spans.map(s => s.attributes('x'))).size).toBe(1)
    const ys = spans.map(s => Number(s.attributes('y')))
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
  })

  it('正文字体字号应用于正文与署名，不改变章节标题', () => {
    const bodyPlan = createVolumePlan({
      title: '周氏宗谱',
      tree,
      fonts: { bodySize: 24, headingSize: 40, bodyFontFamily: 'KaiTi' },
      chapters: [
        {
          id: 'preface',
          kind: 'preface',
          title: '序',
          content: {
            type: 'text',
            blocks: [
              { kind: 'heading', text: '序' },
              { kind: 'paragraph', text: '家之有谱，犹国之有史。' },
              { kind: 'signature', text: '维城谨撰' }
            ]
          }
        }
      ]
    })
    const w = mount(FamilyTreeVolume, { props: { plan: bodyPlan } })
    const texts = w.findAll('.ftc-volume-text text')
    const heading = texts.find(t => t.text() === '序')!
    const body = texts.find(t => t.text().includes('家之有谱'))!
    const signature = texts.find(t => t.text() === '维城谨撰')!
    expect(body.element.style.fontSize).toBe('24px')
    expect(body.element.style.fontFamily).toBe('KaiTi')
    expect(signature.element.style.fontSize).toBe('24px')
    expect(signature.element.style.fontFamily).toBe('KaiTi')
    expect(heading.element.style.fontSize).toBe('40px')
    expect(heading.element.style.fontFamily).toBe('')
  })

  it('世系录按章节参数应用姓名字体、字重与传文字体', () => {
    const styledTree: FamilyNode = {
      id: 'styled',
      name: '周邦',
      gender: 'm',
      bio: '生于嘉庆丁丑年。'
    }
    const styledPlan = createVolumePlan({
      title: '周氏宗谱',
      tree: styledTree,
      chapters: [
        {
          id: 'register',
          content: {
            type: 'register',
            root: styledTree,
            options: {
              nameSize: 24,
              bioSize: 16,
              nameFontFamily: 'KaiTi',
              nameFontWeight: 600,
              bioFontFamily: 'SimHei'
            }
          }
        }
      ]
    })
    const w = mount(FamilyTreeVolume, { props: { plan: styledPlan } })
    const texts = w.findAll('.ftc-volume-register text')
    const name = texts.find(t => t.text() === '周邦')!
    const bio = texts.find(t => t.text() === '生于嘉庆丁丑年。')!
    expect(name.element.style.fontSize).toBe('24px')
    expect(name.element.style.fontFamily).toBe('KaiTi')
    expect(name.element.style.fontWeight).toBe('600')
    expect(bio.element.style.fontSize).toBe('16px')
    expect(bio.element.style.fontFamily).toBe('SimHei')
  })

  it('本幅所有世代均靠近右侧版框显示标签，同世去重且坐标有效', () => {
    const w = mount(FamilyTreeVolume, { props: { plan } })
    const { result } = exposed(w)
    const pageIndex = result.pages.findIndex(p => p.tree || p.treeLeft)
    const treePage = result.pages[pageIndex]
    const groups = w.findAll('.ftc-volume-page')[pageIndex].findAll('.ftc-volume-leaf-gen')
    expect(groups.length).toBeGreaterThan(0)
    for (let gi = 0; gi < groups.length; gi++) {
      const tile = gi === 0 ? treePage.tree : treePage.treeLeft
      const rightEdge = gi === 0 ? treePage.frame.right - 5 : treePage.spine.left - 6
      const depths = new Set(tile!.nodes.map(n => n.depth))
      const rects = groups[gi].findAll('rect')
      expect(rects.length).toBe(depths.size)
      expect(groups[gi].text()).toContain('第一世')
      expect(groups[gi].text()).toContain('第三世')
      for (const rect of rects) {
        const x = Number(rect.attributes('x'))
        const y = Number(rect.attributes('y'))
        const width = Number(rect.attributes('width'))
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
        expect(x + width).toBeCloseTo(rightEdge - 8, 6)
      }
    }
  })

  it('世系图辅助信息可按开关显隐，配偶可切换某氏格式', () => {
    const rich: FamilyNode = {
      id: 'r',
      name: '始祖',
      gender: 'm',
      children: [
        { id: 's1', name: '长男', gender: 'm' },
        { id: 's2', name: '次男', gender: 'm', spouse: ['王秀英'], inherit: '过继' }
      ]
    }
    const textsOf = (tiles?: Record<string, unknown>) => {
      const p = createVolumePlan({
        title: '谱',
        clanName: '堂',
        tree: rich,
        ...(tiles
          ? {
              chapters: [
                {
                  id: 'treeDiagram',
                  kind: 'treeDiagram' as const,
                  content: { type: 'tree' as const, root: rich, tiles }
                }
              ]
            }
          : {})
      })
      return mount(FamilyTreeVolume, { props: { plan: p } })
        .findAll('.ftc-volume-tree text')
        .map(t => t.text())
    }
    // 默认：排行、承继、配偶全名
    const def = textsOf()
    expect(def).toContain('次子')
    expect(def).toContain('过继')
    expect(def).toContain('王秀英')
    // 关闭排行承继 + 某氏格式
    const off = textsOf({ showRank: false, showInherit: false, spouseFormat: 'surname' })
    expect(off).not.toContain('次子')
    expect(off).not.toContain('过继')
    expect(off).toContain('王氏')
  })

  it('各幅世系图统一缩放比例，字号大小一致', () => {
    const wide: FamilyNode = {
      id: 'root',
      name: '始祖',
      gender: 'm',
      children: Array.from({ length: 9 }, (_, i) => ({
        id: `c${i}`,
        name: `男${i + 1}`,
        gender: 'm' as const,
        ...(i % 2 === 0 ? { children: [{ id: `g${i}`, name: `孙${i + 1}`, gender: 'm' as const }] } : {})
      }))
    }
    const p = createVolumePlan({
      title: '谱',
      clanName: '堂',
      tree: wide,
      chapters: [
        {
          id: 'treeDiagram',
          kind: 'treeDiagram' as const,
          content: { type: 'tree' as const, root: wide, tiles: { maxNodesPerTile: 4 } }
        }
      ]
    })
    const w = mount(FamilyTreeVolume, { props: { plan: p } })
    const svgs = w.findAll('.ftc-volume-tree')
    expect(svgs.length).toBeGreaterThan(1)
    const ratios = svgs.map(svg => {
      const width = Number(svg.attributes('width'))
      const vbWidth = Number(svg.attributes('viewBox')!.split(/\s+/)[2])
      return width / vbWidth
    })
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 6)
  })

  it('锁定显示字号：间距变化只改分页，缩放比例恒为 1', () => {
    const wide: FamilyNode = {
      id: 'root',
      name: '始祖',
      gender: 'm',
      children: Array.from({ length: 9 }, (_, i) => ({
        id: `c${i}`,
        name: `男${i + 1}`,
        gender: 'm' as const,
        ...(i % 2 === 0 ? { children: [{ id: `g${i}`, name: `孙${i + 1}`, gender: 'm' as const }] } : {})
      }))
    }
    const measure = (gapX: number) => {
      const p = createVolumePlan({
        title: '谱',
        clanName: '堂',
        tree: wide,
        chapters: [
          {
            id: 'treeDiagram',
            kind: 'treeDiagram' as const,
            content: { type: 'tree' as const, root: wide, tiles: { gapX, mainSize: 20, auxSize: 12 } }
          }
        ]
      })
      const w = mount(FamilyTreeVolume, { props: { plan: p } })
      const { result } = exposed(w)
      const ratios = w.findAll('.ftc-volume-tree').map(svg => {
        const width = Number(svg.attributes('width'))
        const vbWidth = Number(svg.attributes('viewBox')!.split(/\s+/)[2])
        return width / vbWidth
      })
      return {
        ratios,
        tiles: result.pages.reduce((n, pg) => n + (pg.tree ? 1 : 0) + (pg.treeLeft ? 1 : 0), 0)
      }
    }
    const narrow = measure(16)
    const loose = measure(120)
    // 无论间距宽窄，显示字号都等于设定字号（不再随间距整体缩放）
    for (const r of [...narrow.ratios, ...loose.ratios]) expect(r).toBeCloseTo(1, 6)
    // 间距拉宽后改为自动多切幅，而不是缩小字号
    expect(loose.tiles).toBeGreaterThan(narrow.tiles)
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
