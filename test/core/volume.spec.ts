// 成册模型单元测试：章节编排、两遍法总目页码、前置页叶码、人物三向关联、文本流排
import { describe, it, expect } from 'vitest'
import type { FamilyNode } from '../../src/core/types'
import { assembleVolume } from '../../src/core/volume/assemble'
import { runBookLayout } from '../../src/core/bookLayout'
import {
  STANDARD_CHAPTER_ORDER,
  createChapter,
  createVolumePlan,
  insertChapter,
  moveChapter,
  removeChapter,
  setChapterEnabled
} from '../../src/core/volume/registry'
import { normalizeBinding, computeBindingOnSpine, toChineseNum, computeVolumeGeometry, tocLeafCount } from '../../src/core/volume/paginate'

const tree: FamilyNode = {
  id: 'a',
  name: '周邦',
  gender: 'm',
  bio: '始迁祖',
  children: [
    {
      id: 'b',
      name: '廷芬',
      gender: 'm',
      bio: '字兰谷，配陈氏',
      children: [{ id: 'e', name: '邦霖', gender: 'm', bio: '字时雨' }]
    },
    { id: 'c', name: '廷苏', gender: 'm', bio: '字慕泉' }
  ]
}

const prefaceText = '家之有谱，犹国之有史。'.repeat(100) // 1200 字，超一叶容量（首叶十九列约 874 字），须跨叶续排

function buildPlan() {
  return createVolumePlan({
    title: '测试宗谱',
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
            { kind: 'paragraph', text: prefaceText },
            { kind: 'signature', text: '二十三世孙 某某 谨撰' }
          ]
        }
      },
      {
        id: 'biography',
        kind: 'biography',
        content: {
          type: 'bios',
          essays: [{ personId: 'b', name: '廷芬', text: '公讳廷芬，字兰谷，性孝友。', author: '族孙 某某' }]
        }
      },
      {
        id: 'genPoem',
        kind: 'genPoem',
        content: { type: 'genPoem', poem: '周邦廷景\n维承世泽', note: '右派语十六字' }
      }
    ]
  })
}

describe('中文数字', () => {
  it('支持到千位，满足长篇家谱叶码', () => {
    expect(toChineseNum(1)).toBe('一')
    expect(toChineseNum(10)).toBe('十')
    expect(toChineseNum(11)).toBe('十一')
    expect(toChineseNum(20)).toBe('二十')
    expect(toChineseNum(99)).toBe('九十九')
    expect(toChineseNum(100)).toBe('一百')
    expect(toChineseNum(101)).toBe('一百零一')
    expect(toChineseNum(110)).toBe('一百一十')
    expect(toChineseNum(1001)).toBe('一千零一')
  })
})

describe('章节编排', () => {
  it('默认补齐全部标准章节且顺序固定', () => {
    const plan = createVolumePlan({ title: '宗谱', tree })
    expect(plan.chapters.map(c => c.kind)).toEqual(STANDARD_CHAPTER_ORDER)
  })

  it('按 kind 覆盖内容与章名', () => {
    const plan = buildPlan()
    const ch = plan.chapters.find(c => c.kind === 'register')!
    expect(ch.content.type).toBe('register')
    expect(plan.chapters.find(c => c.kind === 'preface')!.title).toBe('序')
  })

  it('增删重排与启停均为不可变操作', () => {
    const plan = buildPlan()
    const extra = createChapter('custom', { id: 'appendix', title: '捐资芳名' })
    const withExtra = insertChapter(plan, extra, 'postscript')
    expect(withExtra.chapters.length).toBe(plan.chapters.length + 1)
    expect(withExtra.chapters[withExtra.chapters.length - 2].id).toBe('appendix')
    // 原计划未被修改
    expect(plan.chapters.length).toBe(STANDARD_CHAPTER_ORDER.length)

    const moved = moveChapter(withExtra, 'appendix', 0)
    expect(moved.chapters[0].id).toBe('appendix')

    const removed = removeChapter(moved, 'appendix')
    expect(removed.chapters.some(c => c.id === 'appendix')).toBe(false)

    const disabled = setChapterEnabled(removed, 'biography', false)
    expect(disabled.chapters.find(c => c.id === 'biography')!.enabled).toBe(false)
  })
})

describe('成册装配', () => {
  it('封面扉页不编叶码，其后自「一」起', () => {
    const result = assembleVolume(buildPlan())
    expect(result.pages[0].chapterKind).toBe('cover')
    expect(result.pages[0].leafNumber).toBe('')
    expect(result.pages[1].chapterKind).toBe('titlePage')
    expect(result.pages[1].leafNumber).toBe('')
    expect(result.pages[2].leafNumber).toBe('一')
    // 叶序仍照常递增（供跳转定位）
    expect(result.pages.map(p => p.leafIndex)).toEqual(result.pages.map((_, i) => i))
    expect(result.totalLeaves).toBe(result.pages.length)
  })

  it('总目条目指向的叶序与叶码确实落在该章首叶（两遍法页码精确）', () => {
    const result = assembleVolume(buildPlan())
    expect(result.toc.length).toBeGreaterThan(0)
    for (const entry of result.toc) {
      const target = result.pages[entry.leafIndex]
      expect(target.chapterId, entry.title).toBe(entry.chapterId)
      expect(target.leafNumber, entry.title).toBe(entry.leafNumber)
      // 卷级条目落在章首叶；节级条目落在小节所在叶（可不在章首）
      if (entry.level === 0) expect(target.isChapterStart).toBe(true)
    }
  })

  it('章节叶区间与总目一致，叶码连续无跳号', () => {
    const result = assembleVolume(buildPlan())
    for (const span of result.chapterSpans) {
      const tocEntry = result.toc.find(t => t.chapterId === span.chapterId)
      if (tocEntry) expect(tocEntry.leafIndex).toBe(span.startLeaf)
      expect(result.pages[span.startLeaf].chapterId).toBe(span.chapterId)
      expect(result.pages[span.endLeaf].chapterId).toBe(span.chapterId)
    }
    const numbered = result.pages.filter(p => p.leafNumber !== '')
    expect(numbered.map(p => p.leafNumber)).toEqual(
      numbered.map((_, i) => toChineseNum(i + 1))
    )
  })

  it('筒子页左右半叶各编页码：右半奇数页、左半偶数页，前置页不编码', () => {
    const result = assembleVolume(buildPlan())
    const front = result.pages.filter(p => p.leafNumber === '')
    for (const p of front) {
      expect(p.pageNumberLeft).toBe('')
      expect(p.pageNumberRight).toBe('')
    }
    const numbered = result.pages.filter(p => p.leafNumber !== '')
    expect(numbered.length).toBeGreaterThan(0)
    numbered.forEach((p, i) => {
      // 第 n 叶 → 右半（正面）2n−1、左半（背面）2n
      expect(p.pageNumberRight).toBe(toChineseNum(i * 2 + 1))
      expect(p.pageNumberLeft).toBe(toChineseNum(i * 2 + 2))
    })
  })

  it('序文跨叶续排且文字无损', () => {
    const result = assembleVolume(buildPlan())
    const prefacePages = result.pages.filter(p => p.chapterId === 'preface')
    expect(prefacePages.length).toBeGreaterThan(1)
    const flowed = prefacePages
      .flatMap(p => p.text?.columns ?? [])
      .map(c => c.chars.map(ch => ch.ch).join(''))
      .join('')
    expect(flowed).toBe(prefaceText)
  })

  it('人物三向关联：世系录、传记、世系图叶码齐备', () => {
    const result = assembleVolume(buildPlan())
    const byId = new Map(result.personIndex.map(e => [e.personId, e]))
    for (const id of ['a', 'b', 'c', 'e']) {
      const entry = byId.get(id)
      expect(entry, id).toBeTruthy()
      expect(entry!.registerLeaf, id).toBeTruthy()
      expect(entry!.treeLeaf, id).toBeTruthy()
    }
    // 传记只覆盖廷芬一人
    expect(byId.get('b')!.bioLeaf).toBeTruthy()
    expect(byId.get('c')!.bioLeaf).toBeNull()
  })

  it('世系录复用牒记版式，章首叶保留书眉格', () => {
    const result = assembleVolume(buildPlan())
    const registerPages = result.pages.filter(p => p.chapterId === 'register')
    expect(registerPages.length).toBeGreaterThan(0)
    expect(registerPages[0].register!.hasHeader).toBe(true)
    expect(registerPages[0].gridXs.length).toBeGreaterThan(0)
  })

  it('停用章节后不再占叶，后续页码自动前移', () => {
    const base = assembleVolume(buildPlan())
    const plan = setChapterEnabled(buildPlan(), 'biography', false)
    const result = assembleVolume(plan)
    expect(result.chapterSpans.some(s => s.chapterId === 'biography')).toBe(false)
    expect(result.pages.length).toBeLessThan(base.pages.length)
    // 总目仍精确
    for (const entry of result.toc) {
      expect(result.pages[entry.leafIndex].leafNumber).toBe(entry.leafNumber)
    }
  })

  it('自定义渲染器可接管 custom 章节', () => {
    const plan = insertChapter(
      buildPlan(),
      createChapter('custom', { id: 'donors', title: '捐资芳名' })
    )
    const result = assembleVolume(plan, {
      customRenderers: {
        donors: (ch, ctx) => [
          {
            chapterId: ch.id,
            chapterKind: ch.kind,
            chapterTitle: ch.title,
            isChapterStart: true,
            runningTitle: ch.title,
            frame: ctx.geometry.frame,
            spine: ctx.geometry.spine,
            gridXs: [],
            plates: []
          }
        ]
      }
    })
    const span = result.chapterSpans.find(s => s.chapterId === 'donors')
    expect(span).toBeTruthy()
    expect(span!.leafCount).toBe(1)
  })
})

// ===== 世系图分幅：一叶一幅续排，节点不丢失、骑缝与续幅标记正确 =====
function chainTree(depth: number): FamilyNode {
  let leaf: FamilyNode = { id: `g${depth - 1}`, name: `${depth}世`, gender: 'm' }
  for (let i = depth - 2; i >= 0; i--) {
    leaf = { id: `g${i}`, name: `${i + 1}世`, gender: 'm', children: [leaf] }
  }
  return leaf
}

describe('正文标点句读', () => {
  /** 密集标点样文：连续标点、各类型标点、长短混排各一 */
  const denseText = '家之有谱，犹国之有史；谱之不修，则昭穆失序、亲疏混淆！'
    + '「慎终追远」，民德归厚矣。……——（凡例）《宗谱》数十万言，'
    + '“生卒失考”者，阙如也可，。'

  const buildPunctPlan = (bodySize?: number) =>
    createVolumePlan({
      title: '测试宗谱',
      clanName: '汝南堂',
      tree,
      ...(bodySize ? { fonts: { bodySize, headingSize: bodySize * 1.85 } } : {}),
      chapters: [
        {
          id: 'preface',
          kind: 'preface',
          title: '序',
          content: {
            type: 'text',
            blocks: [
              { kind: 'heading', text: '序' },
              { kind: 'paragraph', text: denseText }
            ]
          }
        }
      ]
    })

  const PUNCT = new Set(Array.from('，。、；：！？…—「」『』（）《》“”'))

  /** 句读点：墨迹小，须沉到前字右下角 */
  const SINK = new Set(Array.from('，。、'))

  const bodyColumns = (bodySize?: number) => {
    const result = assembleVolume(buildPunctPlan(bodySize))
    return result.pages
      .filter(p => p.chapterId === 'preface')
      .flatMap(p => p.text?.columns ?? [])
  }

  /** 取非列首的某标点（列首标点无前字可依，不移位） */
  const findPunct = (cols: ReturnType<typeof bodyColumns>, target: string) => {
    for (const col of cols) {
      for (let i = 1; i < col.chars.length; i++) {
        if (col.chars[i].ch === target) return col.chars[i]
      }
    }
    throw new Error(`未找到标点 ${target}`)
  }

  it('标点与正文同号；句读点右移上抬至前字右下角，其余标点居中', () => {
    const bodySize = 18.67
    const cols = bodyColumns()
    expect(cols.flatMap(c => c.chars).length).toBe(Array.from(denseText).length) // 全量入栏，标点不额外占格
    for (const col of cols) {
      col.chars.forEach((c, i) => {
        if (!PUNCT.has(c.ch)) {
          expect(c.dx, c.ch).toBeUndefined()
          expect(c.dy, c.ch).toBeUndefined()
          expect(c.size, c.ch).toBeUndefined()
          return
        }
        // 与正文同号，不缩号
        expect(c.size, c.ch).toBeCloseTo(bodySize, 1)
        if (i === 0) {
          // 列首标点无前字可依，留在格中
          expect(c.dx, c.ch).toBeUndefined()
          expect(c.dy, c.ch).toBeUndefined()
        } else if (SINK.has(c.ch)) {
          expect(c.dx, c.ch).toBeCloseTo(bodySize * 0.97, 1) // 右移 0.97 字身，落到字列右缘空白带
          expect(c.dy, c.ch).toBeCloseTo(bodySize * -1.015, 1) // 上抬 1.015 字身，墨迹收在前字右下角格内
        } else {
          // 括号、引号、破折号等占满字格，居中占位
          expect(c.dx, c.ch).toBeUndefined()
          expect(c.dy, c.ch).toBeUndefined()
        }
      })
    }
  })

  it('标点墨迹落在前字右下角：横向避开笔画，纵向不越出字格下缘', () => {
    const bodySize = 18.67
    // 汉字墨迹近满格；句读点墨迹居于字身左下部（与引擎同一假设）
    const HANZI_HALF = 0.45
    const P_INK = { cx: 0.25, cy: 0.72, half: 0.175 }
    // 字格下缘距字心 = 行高 / 2（行高 1.15 字身）
    const CELL_BOTTOM = 0.575
    for (const col of bodyColumns()) {
      const chars = col.chars
      for (let i = 1; i < chars.length; i++) {
        const c = chars[i]
        if (!SINK.has(c.ch)) continue
        const s = c.size ?? bodySize
        const emTop = c.y + (c.dy ?? 0) - s / 2
        const emLeft = c.x + (c.dx ?? 0) - s / 2
        const inkLeft = emLeft + P_INK.cx * s - P_INK.half * s
        const inkTop = emTop + P_INK.cy * s - P_INK.half * s
        const inkBottom = emTop + P_INK.cy * s + P_INK.half * s
        const prev = chars[i - 1]
        if (!PUNCT.has(prev.ch)) {
          const prevRight = prev.x + (prev.dx ?? 0) + (prev.size ?? bodySize) * HANZI_HALF
          // 横向落在字列右缘之外：墨迹整体避开字身笔画
          expect(inkLeft, c.ch).toBeGreaterThan(prevRight - s * 0.02)
          // 纵向沉到前字右下部，但墨迹下缘仍在字格之内（不越界栏）
          expect(inkTop, c.ch).toBeGreaterThan(prev.y)
          expect(inkBottom, c.ch).toBeLessThanOrEqual(prev.y + s * CELL_BOTTOM + 0.01)
        }
      }
    }
  })

  it('列末句读点不越出版框下缘', () => {
    const bodySize = 18.67
    const P_INK = { cy: 0.72, half: 0.175 }
    const result = assembleVolume(buildPunctPlan())
    const pages = result.pages.filter(p => p.chapterId === 'preface')
    let checked = 0
    for (const page of pages) {
      const frameBottom = page.frame.bottom
      for (const col of page.text?.columns ?? []) {
        for (const c of col.chars) {
          if (!SINK.has(c.ch)) continue
          const s = c.size ?? bodySize
          // 墨迹下缘 = 排字 y + dy + 字身内墨迹下缘
          const inkBottom = c.y + (c.dy ?? 0) + P_INK.cy * s + P_INK.half * s
          // 正文留白 TEXT_PAD_Y=10，故墨迹下缘须在版框下缘之上
          expect(inkBottom, c.ch).toBeLessThanOrEqual(frameBottom - 10 + 0.01)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('句读点不占竖排字位：前后两字仍以正常行距相接', () => {
    const bodySize = 18.67
    const lineH = bodySize * 1.15
    const chars = bodyColumns().flatMap(c => c.chars)
    // 样文「家之有谱，犹国之有史」：谱、犹之间夹一句读点
    const i = chars.findIndex((c, j) => c.ch === '，' && chars[j - 1]?.ch === '谱' && chars[j + 1]?.ch === '犹')
    expect(i).toBeGreaterThan(0)
    // 谱 → 犹 仅隔一个行高（句读点不占格，不再空出一格）
    expect(chars[i + 1].y - chars[i - 1].y).toBeCloseTo(lineH, 1)
    // 句读点借用前字下一格的虚位（故 y 仍在谱之下一个行高处），靠字形偏移落到右下角
    expect(chars[i].y - chars[i - 1].y).toBeCloseTo(lineH, 1)
  })

  it('连续句读点依次下错、互不叠合，且不推进字位', () => {
    const bodySize = 18.67
    const lineH = bodySize * 1.15
    const chars = bodyColumns().flatMap(c => c.chars)
    const start = chars.findIndex((c, i) => c.ch === '，' && chars[i + 1]?.ch === '。')
    expect(start).toBeGreaterThan(0)
    const run = chars.slice(start, start + 2) // 「，。」
    expect(run.map(c => c.ch).join('')).toBe('，。')
    // 同一列同一虚位，第二点下错 0.3 行高，互不叠合
    expect(run[1].x - run[0].x).toBeCloseTo(0, 5)
    expect(run[1].y - run[0].y).toBeCloseTo(lineH * 0.3, 1)
  })

  it('不同字号下偏移等比缩放，位置关系不变', () => {
    const small = findPunct(bodyColumns(20), '，')
    const big = findPunct(bodyColumns(36), '，')
    expect(big.dx! / small.dx!).toBeCloseTo(36 / 20, 2)
    expect(big.dy! / small.dy!).toBeCloseTo(36 / 20, 2)
    expect(big.size! / small.size!).toBeCloseTo(36 / 20, 2)
  })

  it('不影响原有分行：占格字行距恒定、同列同一中轴', () => {
    const bodySize = 18.67
    const lineH = bodySize * 1.15
    for (const col of bodyColumns()) {
      // 句读点不占字位，滤去后其余字（含括号、引号等占格标点）应逐格相接
      const cols = col.chars.filter(c => !SINK.has(c.ch))
      for (let i = 1; i < cols.length; i++) {
        expect(cols[i].x).toBeCloseTo(cols[0].x, 5) // 同列同一中轴
        expect(cols[i].y - cols[i - 1].y).toBeCloseTo(lineH, 1) // 行距恒定（字位坐标取两位小数，允许舍入余差）
      }
    }
  })
})

describe('世系图分幅', () => {
  it('超幅大树按代分幅续叶，节点不丢失且人物索引记首幅叶码', () => {
    const root = chainTree(9)
    const plan = createVolumePlan({
      title: '宗谱',
      tree: root,
      chapters: [
        {
          id: 'treeDiagram',
          kind: 'treeDiagram',
          content: {
            type: 'tree',
            root,
            tiles: { maxDepthPerTile: 3, overlapDepth: 1, maxTileWidth: 1e6 }
          }
        }
      ]
    })
    const result = assembleVolume(plan)
    const treePages = result.pages.filter(p => p.tree)
    expect(treePages.length).toBeGreaterThan(1)
    expect(treePages[0].isChapterStart).toBe(true)
    expect(treePages[0].runningTitle).toContain('第一幅')

    // 各幅节点并集＝全树九人（重叠不致丢失，只增骑缝）
    const ids = new Set(treePages.flatMap(p => p.tree!.nodes.map(n => n.id)))
    expect(ids.size).toBe(9)

    // 相邻幅重叠一代，供上下幅对照
    expect(treePages[1].tree!.overlapIds.length).toBeGreaterThan(0)
    // 末幅不再标「续」
    expect(treePages[treePages.length - 1].tree!.continuesNext).toBe(false)

    // 世系图人物索引取首幅叶码，人人有值
    for (const e of result.personIndex) expect(e.treeLeaf).toBeTruthy()
  })

  it('同带过宽时按宽度再横向分幅', () => {
    const wide: FamilyNode = {
      id: 'r',
      name: '始祖',
      gender: 'm',
      children: Array.from({ length: 12 }, (_, i) => ({
        id: `k${i}`,
        name: `子${i}`,
        gender: 'm' as const
      }))
    }
    const plan = createVolumePlan({
      title: '宗谱',
      tree: wide,
      chapters: [
        {
          id: 'treeDiagram',
          kind: 'treeDiagram',
          content: { type: 'tree', root: wide, tiles: { maxTileWidth: 200, maxDepthPerTile: 8 } }
        }
      ]
    })
    const result = assembleVolume(plan)
    const treePages = result.pages.filter(p => p.tree)
    expect(treePages.length).toBeGreaterThan(1)
    // 横向分幅不重复收录同一节点
    const allIds = treePages.flatMap(p => p.tree!.nodes.map(n => n.id))
    expect(new Set(allIds).size).toBe(13)
    expect(allIds.length).toBe(13)
  })
})

// ===== 多级总目：卷 → 节 =====
describe('多级总目', () => {
  it('卷下按内容自动提取节：传记传主、世系录世代', () => {
    const result = assembleVolume(buildPlan())
    const bioNode = result.tocTree.find(n => n.entry.chapterId === 'biography')!
    expect(bioNode.children.length).toBe(1)
    const child = bioNode.children[0].entry
    expect(child.title).toBe('廷芬')
    expect(child.level).toBe(1)
    expect(child.parentId).toBe('biography')
    expect(child.indent).toBe(2)
    expect(child.leafIndex).toBeGreaterThanOrEqual(bioNode.entry.leafIndex)

    const regNode = result.tocTree.find(n => n.entry.chapterId === 'register')!
    expect(regNode.children.map(c => c.entry.title)).toEqual(['始祖', '第二世', '第三世'])
    // 卷级条目仍指向章首叶
    for (const node of result.tocTree) {
      expect(result.pages[node.entry.leafIndex].isChapterStart).toBe(true)
    }
  })

  it('总目节级条目的叶码与目标页一致', () => {
    const result = assembleVolume(buildPlan())
    for (const e of result.toc) {
      const target = result.pages[e.leafIndex]
      expect(target.chapterId).toBe(e.chapterId)
      expect(target.leafNumber).toBe(e.leafNumber)
    }
  })

  it('maxLevel=0 时退化为单级总目（仅卷）', () => {
    const result = assembleVolume({ ...buildPlan(), toc: { maxLevel: 0 } })
    expect(result.toc.every(e => e.level === 0)).toBe(true)
    expect(result.tocTree.every(n => n.children.length === 0)).toBe(true)
  })

  it('显式 sections 覆盖自动提取，未匹配锚点落章首叶', () => {
    const plan = buildPlan()
    const bio = plan.chapters.find(c => c.id === 'biography')!
    bio.sections = [
      { id: 's1', title: '维城', anchor: 'b' },
      { id: 's2', title: '附记', anchor: '不存在' }
    ]
    const result = assembleVolume(plan)
    const node = result.tocTree.find(n => n.entry.chapterId === 'biography')!
    expect(node.children.map(c => c.entry.title)).toEqual(['维城', '附记'])
    // 锚点匹配到传主小节，指向传记章首叶（该章仅一叶）
    expect(node.children[0].entry.leafIndex).toBe(node.entry.leafIndex)
  })
})

// ===== 总目四十格版式（左右半叶各二十格）：无界行、标题在上、页码齐底、虚线相接 =====
describe('总目四十格版式', () => {
  it('总目页隐藏全部列分隔线（gridXs 为空）', () => {
    const result = assembleVolume(buildPlan())
    const tocPages = result.pages.filter(p => p.toc)
    expect(tocPages.length).toBeGreaterThan(0)
    expect(tocPages.every(p => p.gridXs.length === 0)).toBe(true)
  })

  it('每条目标题在上、页码齐底、虚线贯穿其间', () => {
    const result = assembleVolume(buildPlan())
    const entries = result.pages.filter(p => p.toc).flatMap(p => p.toc!.entries)
    expect(entries.length).toBeGreaterThan(0)
    const bottoms = new Set<number>()
    for (const e of entries) {
      expect(e.chars.length).toBeGreaterThan(0)
      expect(e.pageNoChars.length).toBe(e.leafNumber.length)
      // 虚线：标题末字之下、页码首字之上，且方向自上而下
      expect(e.leader).not.toBeNull()
      expect(e.leader!.y1).toBeGreaterThan(e.chars[e.chars.length - 1].y)
      expect(e.leader!.y1).toBeLessThan(e.leader!.y2)
      expect(e.leader!.y2).toBeLessThan(e.pageNoChars[0].y)
      // 页码墨迹下缘齐版框下界（各级条目字号不同亦对齐）
      const pageBottom = e.pageNoChars[e.pageNoChars.length - 1].y + e.size / 2
      bottoms.add(Math.round(pageBottom * 100) / 100)
    }
    expect(bottoms.size).toBe(1)
  })

  it('首叶三十八格（章名跨两格）、其后每叶四十格', () => {
    expect(tocLeafCount(0)).toBe(0)
    expect(tocLeafCount(38)).toBe(1)
    expect(tocLeafCount(39)).toBe(2)
    expect(tocLeafCount(78)).toBe(2)
    expect(tocLeafCount(79)).toBe(3)
    const result = assembleVolume(buildPlan())
    const tocPages = result.pages.filter(p => p.toc)
    tocPages.forEach((p, i) => {
      expect(p.toc!.entries.length).toBeLessThanOrEqual(i === 0 ? 38 : 40)
    })
  })

  it('单册不编卷：总目条目不冠「卷X」前缀', () => {
    const result = assembleVolume(buildPlan())
    const entries = result.pages.filter(p => p.toc).flatMap(p => p.toc!.entries)
    for (const e of entries) expect(e.ordinal).toBe('')
    // 标题首字即章名/节名，不是「卷」字
    for (const e of entries) expect(e.chars[0].ch).not.toBe('卷')
  })
})

// ===== 图版管理：版式、占位、索引 =====
describe('图版管理', () => {
  it('single 通版一叶、double 双联合叶、缺图占位与图版索引', () => {
    const plan = createVolumePlan({
      title: '宗谱',
      tree,
      chapters: [
        {
          id: 'hall',
          kind: 'hall',
          title: '祠堂',
          content: {
            type: 'plates',
            plates: [
              { id: 'p1', title: '祠图', src: '', category: '祠图' },
              { id: 'p2', title: '坟图', src: 'data:image/png;base64,AA', layout: 'double' },
              { id: 'p3', title: '契据', src: 'data:image/png;base64,AA', layout: 'double' }
            ]
          }
        }
      ]
    })
    const result = assembleVolume(plan)
    const hallPages = result.pages.filter(p => p.chapterId === 'hall')
    expect(hallPages.length).toBe(2)
    expect(hallPages[0].plates!.length).toBe(1)
    expect(hallPages[0].plates![0].placeholder).toBe(true)
    expect(hallPages[0].plates![0].layout).toBe('single')

    expect(hallPages[1].plates!.length).toBe(2)
    expect(hallPages[1].plates!.map(p => p.half)).toEqual(['right', 'left'])
    const [right, left] = hallPages[1].plates!
    expect(right.x).toBeGreaterThan(left.x)
    expect(right.width).toBeLessThan(hallPages[0].plates![0].width)

    expect(result.plateIndex.length).toBe(3)
    expect(result.plateIndex[0].placeholder).toBe(true)
    expect(result.plateIndex[0].category).toBe('祠图')
    expect(result.plateIndex[1].leafIndex).toBe(result.plateIndex[2].leafIndex)
  })
})

// ===== 装订线：参数校验、装订线位置、渲染数据生成 =====
describe('装订线', () => {
  const MM = 96 / 25.4

  it('参数合法性校验：无效 type 回退 none，offset 夹紧到 0~15mm，数量夹紧', () => {
    expect(normalizeBinding(undefined)).toMatchObject({ type: 'none', offsetMm: 0, stapleCount: 2, sewingHoles: 6 })
    expect(normalizeBinding('garbage' as any)).toMatchObject({ type: 'none' })
    expect(normalizeBinding('staple', 50)).toMatchObject({ type: 'staple', offsetMm: 15 })
    expect(normalizeBinding('staple', -100)).toMatchObject({ offsetMm: 0 }) // 负值会超出纸面，夹紧到 0
    expect(normalizeBinding('staple', NaN)).toMatchObject({ offsetMm: 0 })
    expect(normalizeBinding('staple', 0, 99)).toMatchObject({ stapleCount: 5 })
    expect(normalizeBinding('sewing', 0, undefined, 1)).toMatchObject({ sewingHoles: 3 })
    expect(normalizeBinding('sewing', 0, undefined, 200)).toMatchObject({ sewingHoles: 12 })
  })

  it('装订线作用于纸张本身：锚定纸张物理边缘，offset=0 时与纸边精准重合', () => {
    const pageWidth = 1587
    const centerX = pageWidth / 2
    const frameTop = 76, frameBottom = 1067

    expect(computeBindingOnSpine(pageWidth, frameTop, frameBottom, 'none', 0, 2, 6)).toBeUndefined()
    expect(computeBindingOnSpine(pageWidth, frameTop, frameBottom, 'perfect', 0, 2, 6)).toBeUndefined()

    // offset=0 → 精准对齐纸张物理边缘 [0, pageWidth]，与版框(x=64/1523)、版心(x≈763/824)无关
    const s0 = computeBindingOnSpine(pageWidth, frameTop, frameBottom, 'staple', 0, 2, 6)!
    expect(s0.lineXs[0]).toBe(0)
    expect(s0.lineXs[1]).toBe(pageWidth)

    // staple + offset=3mm → 左线=3×MM（左纸边向内），右线=pageWidth−3×MM（右纸边向内）
    const st = computeBindingOnSpine(pageWidth, frameTop, frameBottom, 'staple', 3, 2, 6)!
    expect(st.type).toBe('staple')
    expect(st.lineXs).toHaveLength(2)
    expect(st.lineXs[0]).toBeCloseTo(3 * MM, 2)
    expect(st.lineXs[1]).toBeCloseTo(pageWidth - 3 * MM, 2)
    // 对折后验证：右装订线翻折 = 2×centerX − lineXs[1] 应等于左装订线
    expect(2 * centerX - st.lineXs[1]).toBeCloseTo(st.lineXs[0], 2)
    expect(st.stapleY).toHaveLength(2)

    // sewing + offset=10mm
    const sw = computeBindingOnSpine(pageWidth, frameTop, frameBottom, 'sewing', 10, 2, 8)!
    expect(sw.type).toBe('sewing')
    expect(sw.lineXs[0]).toBeCloseTo(10 * MM, 2)
    expect(sw.lineXs[1]).toBeCloseTo(pageWidth - 10 * MM, 2)
    expect(2 * centerX - sw.lineXs[1]).toBeCloseTo(sw.lineXs[0], 2)
    expect(sw.sewingY).toHaveLength(8)
  })

  it('computeVolumeGeometry 装订线：锚定纸张边缘，对折后重合，不侵入版心/版框', () => {
    const g0 = computeVolumeGeometry({})
    expect(g0.spine.binding).toBeUndefined()

    const g1 = computeVolumeGeometry({ bindingType: 'staple', bindingOffset: 2 })
    expect(g1.spine.binding).toBeDefined()
    expect(g1.spine.binding!.type).toBe('staple')
    expect(g1.spine.binding!.offsetMm).toBe(2)
    expect(g1.spine.binding!.lineXs).toHaveLength(2)
    // 锚定纸张物理边缘：lineXs = [offset×MM, pageWidth − offset×MM]，与版框 frame.left/right 无关
    expect(g1.spine.binding!.lineXs[0]).toBeCloseTo(2 * MM, 2)
    expect(g1.spine.binding!.lineXs[1]).toBeCloseTo(2 * g1.spine.centerX - 2 * MM, 2) // pageWidth = 2×centerX
    // 对折后重合验证
    expect(2 * g1.spine.centerX - g1.spine.binding!.lineXs[1]).toBeCloseTo(g1.spine.binding!.lineXs[0], 2)
    // 不侵入骨架：装订线在版框之外（纸张边缘留白区），版心区域完整不受影响
    expect(g1.spine.binding!.lineXs[0]).toBeLessThan(g1.frame.left)
    expect(g1.spine.binding!.lineXs[1]).toBeGreaterThan(g1.frame.right)

    const g2 = computeVolumeGeometry({ bindingType: 'sewing', bindingOffset: 10, sewingHoles: 10 })
    expect(g2.spine.binding!.type).toBe('sewing')
    expect(g2.spine.binding!.sewingY).toHaveLength(10)
    expect(2 * g2.spine.centerX - g2.spine.binding!.lineXs[1]).toBeCloseTo(g2.spine.binding!.lineXs[0], 2)
    // offset=10mm=37.8px 仍在版框(x=64)之外，骨架完整
    expect(g2.spine.binding!.lineXs[0]).toBeLessThan(g2.frame.left)

    const g3 = computeVolumeGeometry({ bindingType: 'staple', bindingOffset: 200 })
    expect(g3.spine.binding!.offsetMm).toBe(15) // 夹紧上限
    expect(g3.spine.binding!.lineXs[0]).toBeCloseTo(15 * MM, 2)
    expect(2 * g3.spine.centerX - g3.spine.binding!.lineXs[1]).toBeCloseTo(g3.spine.binding!.lineXs[0], 2)
  })

  it('runBookLayout 透传装订参数到 BookPage.spine.binding', () => {
    const result = runBookLayout(tree, {
      bindingType: 'staple',
      bindingOffset: 4,
      stapleCount: 3
    })
    for (const p of result.pages) {
      expect(p.spine.binding).toBeDefined()
      expect(p.spine.binding!.type).toBe('staple')
      expect(p.spine.binding!.offsetMm).toBe(4)
      expect(p.spine.binding!.stapleY).toHaveLength(3)
    }
  })
})
