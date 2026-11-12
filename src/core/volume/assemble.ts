// 成册装配引擎：两遍法排出全书叶序、叶码、总目与人物关联索引
//
// 两遍法解决「总目页码依赖自身页数」的循环：
//   第一遍：按章节顺序预算各章起始叶序/叶码（总目页数由条目数直接算出，不渲染）；
//   第二遍：流式装配，总目据第一遍得到的真实叶码渲染，随后逐叶编叶码。
// 前置页（封面、扉页）依「书衣不编叶」之例：叶序照常递增（供跳转定位），但不计叶码。
import type { BookLayoutOptions, FamilyNode } from '../types'
import { runBookLayout } from '../bookLayout'
import {
  buildCoverPage,
  computeVolumeGeometry,
  paginatePlates,
  paginateToc,
  paginateVerticalText,
  toChineseNum,
  tocLeafCount,
  volumeGridXs
} from './paginate'
import { sliceTree } from './treeTiles'
import type {
  BioEssay,
  ChapterSpan,
  ChapterSpec,
  CustomRenderer,
  PersonIndexEntry,
  PlateIndexEntry,
  RawPage,
  RenderContext,
  ResolvedFonts,
  ResolvedPageSetup,
  TocEntry,
  TocNode,
  TreeTileOptions,
  VerticalTextBlock,
  VolumePage,
  VolumePlan,
  VolumeResult
} from './types'

/** 装配选项 */
export interface AssembleOptions {
  /** 自定义章节渲染器：键为章节 id（优先）或 kind */
  customRenderers?: Record<string, CustomRenderer>
}

const isFront = (ch: ChapterSpec) => ch.content.type === 'cover' || ch.content.type === 'titlePage'
const isToc = (ch: ChapterSpec) => ch.content.type === 'toc'

/** 遍历树（先序，与世系录世序一致） */
function walkTree(node: FamilyNode, out: string[], names: Map<string, string>): void {
  const stack: FamilyNode[] = [node]
  while (stack.length) {
    const n = stack.pop()!
    out.push(n.id)
    names.set(n.id, n.name)
    const kids = n.children ?? []
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i])
  }
}

/**
 * 装配成册
 * @param plan 成册计划
 * @param opts 自定义渲染器
 */
export function assembleVolume(plan: VolumePlan, opts: AssembleOptions = {}): VolumeResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0

  const setup: ResolvedPageSetup = {
    pageWidth: plan.pageSetup?.pageWidth ?? 1587,
    pageHeight: plan.pageSetup?.pageHeight ?? 1123,
    margin: plan.pageSetup?.margin ?? 64,
    topMargin: plan.pageSetup?.topMargin ?? 76,
    bottomMargin: plan.pageSetup?.bottomMargin ?? 56,
    spineWidth: plan.pageSetup?.spineWidth ?? 60.47,
    bindingType: plan.pageSetup?.bindingType ?? 'none',
    bindingOffset: plan.pageSetup?.bindingOffset ?? 0,
    stapleCount: plan.pageSetup?.stapleCount ?? 2,
    sewingHoles: plan.pageSetup?.sewingHoles ?? 6
  }
  const fonts: ResolvedFonts = {
    bodySize: plan.fonts?.bodySize ?? 18.67,
    headingSize: plan.fonts?.headingSize ?? 34.67,
    titleFontFamily: plan.fonts?.titleFontFamily ?? '',
    bodyFontFamily: plan.fonts?.bodyFontFamily ?? ''
  }
  const geometry = computeVolumeGeometry(setup)
  const enabled = plan.chapters.filter(c => c.enabled !== false)

  const enablePunct = plan.punct?.enable ?? true
  const makeCtx = (chapter: ChapterSpec): RenderContext => ({
    plan,
    chapter,
    setup,
    fonts,
    geometry,
    enablePunct
  })

  /** 传记块序列：章名 + （传主名小节题 + 传文 + 署名）× n，同时记录每篇传文的起始块索引 */
  const bioBlocks = (essays: BioEssay[], chapter: ChapterSpec) => {
    const blocks: VerticalTextBlock[] = [{ kind: 'heading', text: chapter.title }]
    const headIdx: number[] = []
    for (const e of essays) {
      headIdx.push(blocks.length)
      blocks.push({ kind: 'subheading', text: e.name, anchor: e.personId })
      blocks.push({ kind: 'paragraph', text: e.text })
      if (e.author) blocks.push({ kind: 'signature', text: e.author })
    }
    return { blocks, headIdx }
  }

  /** 字辈谱：每句独占一列（派语行款），末附小字记 */
  const genPoemBlocks = (chapter: ChapterSpec, poem: string, note?: string) => {
    const lines = poem
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
    const blocks: VerticalTextBlock[] = [{ kind: 'heading', text: chapter.title }]
    for (const line of lines) blocks.push({ kind: 'subheading', text: line })
    if (note) blocks.push({ kind: 'signature', text: note })
    return blocks
  }

  /** 世系图：按幅切片（一叶一幅），渲染层按 TreeTile 绘制 */
  const renderTree = (
    chapter: ChapterSpec,
    root: FamilyNode,
    tilesOpt?: TreeTileOptions
  ): RawPage[] => {
    const ctx = makeCtx(chapter)
    const { tiles } = sliceTree(root, tilesOpt)
    const multi = tiles.length > 1
    return tiles.map((tile, i) => ({
      chapterId: chapter.id,
      chapterKind: chapter.kind,
      chapterTitle: chapter.title,
      isChapterStart: i === 0,
      runningTitle: multi ? `${chapter.title}　${tile.label}` : chapter.title,
      frame: ctx.geometry.frame,
      spine: ctx.geometry.spine,
      gridXs: [],
      tree: tile
    }))
  }

  /** 世系录：直接复用牒记式排版引擎，页面几何由成册统一设置 */
  const renderRegister = (chapter: ChapterSpec, root: FamilyNode, options?: BookLayoutOptions): RawPage[] => {
    const merged: BookLayoutOptions = {
      pageWidth: setup.pageWidth,
      pageHeight: setup.pageHeight,
      margin: setup.margin,
      topMargin: setup.topMargin,
      bottomMargin: setup.bottomMargin,
      spineWidth: setup.spineWidth,
      enablePunct,
      ...options
    }
    const result = runBookLayout(root, merged)
    return result.pages.map((bp, i) => ({
      chapterId: chapter.id,
      chapterKind: chapter.kind,
      chapterTitle: chapter.title,
      isChapterStart: i === 0,
      runningTitle: chapter.title,
      frame: bp.frame,
      spine: bp.spine,
      gridXs: bp.columnLines,
      register: bp
    }))
  }

  // 传记章：essay → 起始块索引（供人物传记叶码定位）
  const essayHeadIdx = new Map<string, number[]>()

  const renderChapter = (chapter: ChapterSpec): RawPage[] => {
    const ctx = makeCtx(chapter)
    const content = chapter.content
    switch (content.type) {
      case 'text':
        return paginateVerticalText(content.blocks, ctx)
      case 'bios': {
        const { blocks, headIdx } = bioBlocks(content.essays, chapter)
        essayHeadIdx.set(chapter.id, headIdx)
        return paginateVerticalText(blocks, ctx)
      }
      case 'genPoem':
        return paginateVerticalText(genPoemBlocks(chapter, content.poem, content.note), ctx)
      case 'plates':
        return paginatePlates(content.plates, ctx)
      case 'tree':
        return renderTree(chapter, content.root, content.tiles)
      case 'register':
        return renderRegister(chapter, content.root, content.options)
      case 'cover':
        return buildCoverPage(ctx, 'cover')
      case 'titlePage':
        return buildCoverPage(ctx, 'titlePage')
      case 'toc':
        // 总目须待真实叶码算出后于第二遍渲染
        return []
      case 'custom': {
        const renderer = opts.customRenderers?.[chapter.id] ?? opts.customRenderers?.[chapter.kind]
        if (renderer) return renderer(chapter, ctx)
        return paginateVerticalText([{ kind: 'heading', text: chapter.title }], ctx)
      }
    }
  }

  // ============ 第一遍：预算各章页数、起始叶序与叶码 ============
  const rawByChapter = new Map<string, RawPage[]>()
  for (const ch of enabled) {
    if (isToc(ch)) continue
    rawByChapter.set(ch.id, renderChapter(ch))
  }

  const tocEnabled = plan.toc?.enabled !== false && enabled.some(isToc)
  const includeKinds = plan.toc?.includeKinds
  const listed = enabled.filter(
    ch => !isFront(ch) && !isToc(ch) && (!includeKinds || includeKinds.includes(ch.kind))
  )
  const maxLevel = plan.toc?.maxLevel ?? 1

  /**
   * 章节小节自动提取：
   * - 文本/传记：小节题（传记传主名带 personId 锚点）
   * - 图版：每版一条（锚点 plateId）
   * - 世系图：每幅一条（锚点 tile:N）
   * - 世系录：每世代标签首见一条（锚点 gen:N）
   */
  interface RawSection {
    title: string
    anchor?: string
    pageOffset: number
    order?: number
  }
  const autoSections = (ch: ChapterSpec, raw: RawPage[]): RawSection[] => {
    const out: RawSection[] = []
    const ct = ch.content.type
    const seenGen = new Set<string>()
    raw.forEach((rp, i) => {
      if (rp.text && (ct === 'text' || ct === 'bios')) {
        for (const m of rp.text.sections) out.push({ title: m.title, anchor: m.anchor, pageOffset: i })
      }
      if (rp.plates) {
        for (const p of rp.plates) out.push({ title: p.title, anchor: p.plateId, pageOffset: i })
      }
      if (rp.tree) {
        out.push({ title: rp.tree.label, anchor: `tile:${rp.tree.tileIndex}`, pageOffset: i })
      }
      if (rp.register) {
        for (const g of rp.register.genLabels) {
          const key = `gen:${g.generation}`
          if (seenGen.has(key)) continue
          seenGen.add(key)
          out.push({ title: g.text, anchor: key, pageOffset: i })
        }
      }
    })
    return out
  }

  // 显式 sections 覆盖自动提取：锚点匹配取真实叶偏移，未匹配落章首叶
  const sectionsByChapter = new Map<string, RawSection[]>()
  let sectionCount = 0
  for (const ch of listed) {
    const raw = rawByChapter.get(ch.id) ?? []
    const auto = autoSections(ch, raw)
    let secs: RawSection[]
    if (ch.sections?.length) {
      secs = ch.sections.map((s, idx) => {
        const hit =
          (s.anchor ? auto.find(a => a.anchor === s.anchor) : undefined) ??
          auto.find(a => a.title === s.title)
        return {
          title: s.title,
          anchor: s.anchor ?? hit?.anchor,
          pageOffset: hit?.pageOffset ?? 0,
          order: idx
        }
      })
      secs.sort((a, b) => a.pageOffset - b.pageOffset || (a.order ?? 0) - (b.order ?? 0))
    } else {
      secs = auto
    }
    sectionsByChapter.set(ch.id, secs)
    if (maxLevel >= 1) sectionCount += secs.length
  }

  const tocPages = tocEnabled ? tocLeafCount(listed.length + sectionCount) : 0

  const startLeafIdx = new Map<string, number>()
  const startDisp = new Map<string, number>()
  let leafBudget = 0
  let dispBudget = 0
  for (const ch of enabled) {
    if (isToc(ch) && !tocEnabled) continue
    startLeafIdx.set(ch.id, leafBudget)
    startDisp.set(ch.id, dispBudget)
    const count = isToc(ch) ? tocPages : rawByChapter.get(ch.id)?.length ?? 0
    leafBudget += count
    if (!isFront(ch)) dispBudget += count
  }

  // 卷次：仅整谱分册装订时由 ChapterSpec.ordinal 显式给出（如「卷一」）；单册不编卷、总目不冠卷次
  const ordinalOf = new Map<string, string>()
  for (const ch of enabled) ordinalOf.set(ch.id, isFront(ch) || isToc(ch) ? '' : ch.ordinal ?? '')

  // 总目条目：卷级指向章首叶，节级指向小节所在叶（总目自身不入目）
  const tocEntries: TocEntry[] = []
  for (const ch of listed) {
    const start = startLeafIdx.get(ch.id) ?? 0
    const disp0 = startDisp.get(ch.id) ?? 0
    tocEntries.push({
      entryId: ch.id,
      chapterId: ch.id,
      kind: ch.kind,
      title: ch.title,
      ordinal: ordinalOf.get(ch.id) ?? '',
      leafIndex: start,
      leafNumber: toChineseNum(disp0 + 1),
      level: 0,
      parentId: null,
      indent: 0
    })
    if (maxLevel < 1) continue
    const secs = sectionsByChapter.get(ch.id) ?? []
    secs.forEach((s, i) => {
      tocEntries.push({
        entryId: `${ch.id}#${i}`,
        chapterId: ch.id,
        kind: ch.kind,
        title: s.title,
        ordinal: '',
        leafIndex: start + s.pageOffset,
        leafNumber: toChineseNum(disp0 + s.pageOffset + 1),
        level: 1,
        parentId: ch.id,
        indent: 2
      })
    })
  }

  // 多级总目树（卷 → 节）
  const tocTree: TocNode[] = []
  const tocNodeById = new Map<string, TocNode>()
  for (const e of tocEntries) {
    const node: TocNode = { entry: e, children: [] }
    if (e.level === 0) {
      tocTree.push(node)
      tocNodeById.set(e.chapterId, node)
    } else {
      const parent = e.parentId ? tocNodeById.get(e.parentId) : undefined
      if (parent) parent.children.push(node)
      else tocTree.push(node)
    }
  }

  // ============ 第二遍：流式装配并逐叶编叶码 ============
  const pages: VolumePage[] = []
  let leafIdx = 0
  let disp = 0
  for (const ch of enabled) {
    if (isToc(ch) && !tocEnabled) continue
    const raw: RawPage[] = isToc(ch)
      ? paginateToc(tocEntries, makeCtx(ch))
      : rawByChapter.get(ch.id) ?? []
    const front = isFront(ch)
    for (const rp of raw) {
      const leafNumber = front ? '' : toChineseNum(disp + 1)
      // 筒子页两半叶各编页码（一叶两页）：右半叶为正面＝奇数页，左半叶为背面＝偶数页
      const pageNumberRight = front ? '' : toChineseNum(disp * 2 + 1)
      const pageNumberLeft = front ? '' : toChineseNum(disp * 2 + 2)
      if (!front) disp += 1
      pages.push({ ...rp, pageWidth: setup.pageWidth, pageHeight: setup.pageHeight, leafIndex: leafIdx, leafNumber, pageNumberLeft, pageNumberRight })
      leafIdx += 1
    }
  }

  // ============ 人物三向关联索引 ============
  const names = new Map<string, string>()
  const order: string[] = []
  // 世序以世系录（无则世系图）的 DFS 序为准
  const registerRoot = enabled.find(ch => ch.content.type === 'register')
  const treeRoot = enabled.find(ch => ch.content.type === 'tree')
  if (registerRoot && registerRoot.content.type === 'register') walkTree(registerRoot.content.root, order, names)
  else if (treeRoot && treeRoot.content.type === 'tree') walkTree(treeRoot.content.root, order, names)

  const indexById = new Map<string, PersonIndexEntry>()
  const entryFor = (personId: string, name?: string): PersonIndexEntry => {
    let e = indexById.get(personId)
    if (!e) {
      e = { personId, name: name ?? names.get(personId) ?? '', registerLeaf: null, bioLeaf: null, treeLeaf: null }
      indexById.set(personId, e)
    } else if (!e.name && name) {
      e.name = name
    }
    return e
  }

  // 图版索引（按章节顺序、版序）
  const plateIndex: PlateIndexEntry[] = []

  for (const page of pages) {
    if (page.plates) {
      for (const pl of page.plates) {
        plateIndex.push({
          plateId: pl.plateId,
          title: pl.title,
          category: pl.category,
          chapterId: page.chapterId,
          leafIndex: page.leafIndex,
          leafNumber: page.leafNumber,
          layout: pl.layout,
          placeholder: pl.placeholder
        })
      }
    }
    if (page.register) {
      for (const bp of page.register.people) {
        const e = entryFor(bp.id, bp.name)
        // 长传会跨叶续排，只记首见之叶
        if (!e.registerLeaf) e.registerLeaf = page.leafNumber
      }
    }
    if (page.tree) {
      // 分幅后同一人物可能跨幅，取首幅叶码
      for (const node of page.tree.nodes) {
        const e = entryFor(node.id, node.name)
        if (!e.treeLeaf) e.treeLeaf = page.leafNumber
      }
    }
    if (page.text) {
      const heads = essayHeadIdx.get(page.chapterId)
      if (heads) {
        for (const bs of page.text.blockStarts) {
          const k = heads.indexOf(bs)
          if (k < 0) continue
          const ch = enabled.find(c => c.id === page.chapterId)
          if (!ch || ch.content.type !== 'bios') continue
          const essay = ch.content.essays[k]
          if (!essay) continue
          const e = entryFor(essay.personId, essay.name)
          if (!e.bioLeaf) e.bioLeaf = page.leafNumber
        }
      }
    }
  }

  const personIndex: PersonIndexEntry[] = []
  for (const id of order) if (indexById.has(id)) personIndex.push(indexById.get(id)!)
  for (const e of indexById.values()) {
    if (!personIndex.includes(e)) personIndex.push(e)
  }

  // ============ 章节叶区间 ============
  const chapterSpans: ChapterSpan[] = []
  for (const ch of enabled) {
    if (isToc(ch) && !tocEnabled) continue
    const own = pages.filter(p => p.chapterId === ch.id)
    if (!own.length) continue
    chapterSpans.push({
      chapterId: ch.id,
      kind: ch.kind,
      title: ch.title,
      ordinal: ordinalOf.get(ch.id) ?? '',
      startLeaf: own[0].leafIndex,
      endLeaf: own[own.length - 1].leafIndex,
      leafCount: own.length
    })
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : 0
  return {
    pages,
    totalLeaves: pages.length,
    toc: tocEntries,
    tocTree,
    plateIndex,
    chapterSpans,
    personIndex,
    elapsed: t1 - t0
  }
}

/** 供组件层复用：按成册设置取竖界行（正文页排版函数内部已算，此处为公开工具） */
export { volumeGridXs }
