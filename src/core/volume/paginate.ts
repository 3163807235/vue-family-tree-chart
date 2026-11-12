// 竖排分页引擎：文本类章节（序跋、凡例、传记、艺文等）与封面、扉页、总目、图版的落版计算
//
// 行款（与谱牒式世系录共用同一版框）：
// - A3 横版筒子页，版心（书口）对折，左右各为一个半叶；
// - 每半叶自版框外缘至版心等分十列（乌丝栏界行即竖行分隔），文字自右向左逐列流排；
// - 章首叶最外一列专为章名（大字整列上下居中），正文自其左起排（故首叶右半叶九列可排正文）；
// - 满一列向下排满即换列，右半叶排满折左半叶，左半叶排满翻叶；
// - 署名起笔低三行（谦抑之礼），小节题起笔低一行。
import type { BookRect, BookSpine, BindingType, VerticalChar } from '../types'
import type {
  CoverPageContent,
  PlateItem,
  PlatePlacement,
  RawPage,
  RenderContext,
  TextColumn,
  TextPageContent,
  TocEntry,
  TocPageContent,
  TocRenderedEntry,
  VerticalTextBlock,
  VolumeGeometry,
  VolumePageSetup
} from './types'

// 装订参数校验与装订线位置计算（share by runBookLayout）


/** 每半叶固定格列数（与世系录 bookLayout 一致） */
export const HALF_COLS = 10

/** 与版框外缘重合的格点不画（由内栏竖线充任界行） */
const FRAME_INSET = 5

/** 竖排文字距版框上下的留白：避开内外两道墨线（内栏线在 +5），字头字脚不压线 */
const TEXT_PAD_Y = 10

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const CN_UNITS = ['', '十', '百', '千']

/** 两位小数（仅用于输出坐标，内部推进不得舍入） */
export const r2 = (v: number): number => Math.round(v * 100) / 100

/**
 * 阿拉伯数字转中文数字（1~9999）
 * 叶码、卷次、世次均用此函数，需支持百叶以上的长篇家谱。
 */
export function toChineseNum(n: number): string {
  if (n <= 0) return String(n)
  if (n < 10) return CN_DIGITS[n]
  if (n < 20) return '十' + (n % 10 === 0 ? '' : CN_DIGITS[n % 10])
  const s = String(n)
  let out = ''
  let pendingZero = false
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i])
    const unit = CN_UNITS[s.length - 1 - i]
    if (d === 0) {
      pendingZero = out.length > 0
      continue
    }
    if (pendingZero && out) out += '零'
    pendingZero = false
    out += CN_DIGITS[d] + unit
  }
  return out
}

/** mm → px（CSS 96dpi：1mm = 96/25.4 ≈ 3.7795px） */
const MM = 96 / 25.4

/**
 * 校验装订参数并返回规范化值（非法值回退到默认、范围外夹紧）。
 * - bindingType：不在已知集合 → 'none'
 * - bindingOffset：[0, 15] mm（距纸张物理边缘向内；负值会超出纸面，物理不可行），超出夹紧
 * - stapleCount：[2, 5]，超出夹紧
 * - sewingHoles：[3, 12]，超出夹紧
 */
export function normalizeBinding(
  type?: BindingType,
  offsetMm?: number,
  stapleCount?: number,
  sewingHoles?: number
) {
  const valid: BindingType[] = ['none', 'staple', 'sewing', 'perfect']
  const t = type && valid.includes(type) ? type : 'none'
  const off = offsetMm == null || Number.isNaN(offsetMm) ? 0 : Math.max(0, Math.min(15, offsetMm))
  const stap = stapleCount == null ? 2 : Math.max(2, Math.min(5, Math.round(stapleCount)))
  const sew = sewingHoles == null ? 6 : Math.max(3, Math.min(12, Math.round(sewingHoles)))
  return { type: t, offsetMm: off, stapleCount: stap, sewingHoles: sew }
}

/**
 * 根据装订参数生成 BookSpine.binding 渲染数据；type='none' / 'perfect' 时返回 undefined。
 * 装订线作用于纸张本身（与版框/版心等骨架元素无关），锚定纸张物理边缘：
 *   lineXs[0] = offsetMm × MM              （左纸边向内）
 *   lineXs[1] = pageWidth − offsetMm × MM  （右纸边向内）
 * offset=0 时两条线与纸张物理边缘精准重合；
 * 对折后：右线翻折 = 2×centerX − lineXs[1] = lineXs[0]，两线在书脊处完全重合。
 */
export function computeBindingOnSpine(
  pageWidth: number,
  frameTop: number,
  frameBottom: number,
  type: BindingType,
  offsetMm: number,
  stapleCount: number,
  sewingHoles: number
): BookSpine['binding'] {
  if (type === 'none' || type === 'perfect') return undefined
  const lineXs = [offsetMm * MM, pageWidth - offsetMm * MM]
  const top = frameTop + 20
  const bottom = frameBottom - 20
  const span = bottom - top
  if (type === 'staple') {
    // 骑马钉：通常 2 颗钉，沿书脊上下对称分布
    const n = stapleCount
    const ys: number[] = []
    for (let i = 0; i < n; i++) {
      ys.push(top + span * (i + 1) / (n + 1))
    }
    return { type, lineXs, offsetMm, stapleY: ys }
  }
  // sewing 锁线装订：一排槽孔沿书脊均匀分布
  const n = sewingHoles
  const ys: number[] = []
  for (let i = 0; i < n; i++) {
    ys.push(top + span * (i + 0.5) / n)
  }
  return { type, lineXs, offsetMm, sewingY: ys }
}

/** 计算版框、版心与单列宽（与 runBookLayout 逐式一致，保证两种章节同一行款） */
export function computeVolumeGeometry(setup: VolumePageSetup = {}): VolumeGeometry {
  const pageWidth = setup.pageWidth ?? 1587
  const pageHeight = setup.pageHeight ?? 1123
  const margin = setup.margin ?? 64
  const topMargin = setup.topMargin ?? 76
  const bottomMargin = setup.bottomMargin ?? 56
  const spineWidth = setup.spineWidth ?? 60.47

  const frame: BookRect = {
    left: margin,
    top: topMargin,
    right: pageWidth - margin,
    bottom: pageHeight - bottomMargin
  }
  const centerX = pageWidth / 2
  const spineLeft = centerX - spineWidth / 2
  const spineRight = centerX + spineWidth / 2
  const { type, offsetMm, stapleCount, sewingHoles } = normalizeBinding(
    setup.bindingType, setup.bindingOffset, setup.stapleCount, setup.sewingHoles
  )
  const binding = computeBindingOnSpine(pageWidth, frame.top, frame.bottom, type, offsetMm, stapleCount, sewingHoles)
  const spine: BookSpine = {
    centerX,
    left: spineLeft,
    right: spineRight,
    width: spineWidth,
    upperTailY: frame.top + (frame.bottom - frame.top) * 0.25,
    lowerTailY: frame.top + (frame.bottom - frame.top) * 0.75,
    binding
  }
  const colW = (frame.right - spine.right) / HALF_COLS
  return { pageWidth, pageHeight, frame, spine, colW }
}

/** 某一列（竖行）的中轴 x：slot 自右向左自 0 递增 */
export function columnX(g: VolumeGeometry, half: 'right' | 'left', slot: number): number {
  return half === 'right'
    ? g.frame.right - g.colW * (slot + 0.5)
    : g.spine.left - g.colW * (slot + 0.5)
}

/** 全页竖界行 x 坐标（已剔除与版框外缘重合的两点），自右向左 */
export function volumeGridXs(g: VolumeGeometry): number[] {
  const xs: number[] = []
  for (let i = 0; i <= HALF_COLS; i++) {
    xs.push(r2(g.frame.right - i * g.colW))
    xs.push(r2(g.spine.left - i * g.colW))
  }
  const uniq = Array.from(new Set(xs))
  return uniq
    .filter(x => x > g.frame.left + FRAME_INSET + 0.5 && x < g.frame.right - FRAME_INSET - 0.5)
    .sort((a, b) => b - a)
}

/** 标点全集（全角为主，兼收半角）：竖排一律与正文同号 */
const PUNCT_CHARS = new Set(
  Array.from('，。、；：！？…‥·—「」『』（）〔〕【】〖〗《》〈〉“”‘’,.;:!?()[]')
)
/**
 * 句读点：墨迹只占字身左下角一小点，竖排须沉到前一字字身的右下角（如「辰巳秋。」）。
 * 其余标点（括号、引号、书名号、破折号、叹问号、冒号分号）本身占满字格，
 * 竖排居中占位即合规，若一并右下移反会压上前字，故只置字号、不移位。
 */
const SINK_PUNCT = new Set(Array.from('，。、．,.'))
/** 标点字号相对正文字号的比例（与正文同号） */
const PUNCT_SCALE = 1
/** 行高 / 字身（与 verticalRun 的 lineH = size × 1.15 同一系数） */
const LINE_RATIO = 1.15
/** 句读点墨迹在字身内的位置（自字身左上角计，单位字身）：居于左下部 */
const PUNCT_INK_CX = 0.25
const PUNCT_INK_CY = 0.72
/** 句读点墨迹约高 0.35 字身，取其半径 */
const PUNCT_INK_HALF = 0.175
/** 句读点墨迹下缘距前字字心（字身）：略低于汉字墨迹下缘（0.5），
 *  但须留在字格内（格高 1.15，格底距字心 0.575），否则列末句读点会越出版框 */
const PUNCT_INK_BOTTOM = 0.53
/** 标点墨迹横向落点：前字右缘外侧（自字心计，字身），落在字列右缘的空白带里 */
const PUNCT_INK_X = 0.72
/** 连续句读点依次下错的步距（行高的倍数） */
const PUNCT_STACK = 0.3

/** 标点相对本格字心的右移量（字身）：墨迹中心推到前字右缘之外 */
const PUNCT_DX = PUNCT_INK_X - (PUNCT_INK_CX - 0.5) * PUNCT_SCALE
/** 标点相对本格字心的上抬量（字身）：墨迹下缘恰落在前字右下角、仍留在格内 */
const PUNCT_DY =
  -LINE_RATIO + PUNCT_INK_BOTTOM - PUNCT_INK_HALF - (PUNCT_INK_CY - 0.5) * PUNCT_SCALE

/**
 * 排一个竖排字位。
 * 非标点按字心原样返回；标点标记 punct:true 并置独立字号（与正文同号）。
 * 句读点（SINK）在 enablePunct=true 时另记字形偏移 dx/dy，使墨迹落在前一字的右下角；
 * enablePunct=false 时不偏移，标点居中占格（传统排版）。
 * 因只记字形偏移、不改字位与行高，故分行、换行与每列容量计算分毫未动；
 * 列首标点（无前字可依）保持在格中，不外溢出栏。
 */
function placeChar(
  ch: string,
  x: number,
  y: number,
  size: number,
  colStart = false,
  enablePunct = true
): VerticalChar {
  if (!PUNCT_CHARS.has(ch)) return { ch, x: r2(x), y: r2(y) }
  const body: VerticalChar = { ch, x: r2(x), y: r2(y), size: r2(size * PUNCT_SCALE), punct: true }
  if (!enablePunct || colStart || !SINK_PUNCT.has(ch)) return body
  return { ...body, dx: r2(size * PUNCT_DX), dy: r2(size * PUNCT_DY) }
}

/** 竖排单列：自 topY 起向下排，字心位于每格行高的中点 */
function verticalRun(
  text: string,
  x: number,
  topY: number,
  lineH: number,
  size = lineH / 1.15,
  enablePunct = true
): VerticalChar[] {
  return Array.from(text).map((ch, i) => placeChar(ch, x, topY + lineH * (i + 0.5), size, i === 0, enablePunct))
}

/**
 * 正文竖排连排（古籍句读式）：句读点不占竖排字位，
 * 直接落在前一正字的右下角、字列右缘的空白带里，故后字紧接前字，行距还原为正常 lineH。
 * 连续句读点依次下错 PUNCT_STACK，互不叠合；
 * 但墨迹下缘一律收在本列末格之下缘（cellBottom）以内，列末标点不会越出版框。
 * 列首即句读点（无前字可依）时按整字占位、居中不出栏。
 */
function flowRun(
  chars: string[],
  x: number,
  startY: number,
  lineH: number,
  size: number,
  cellBottom: number
): VerticalChar[] {
  const out: VerticalChar[] = []
  let centerY = startY + lineH / 2 // 下一整字格心
  let prevY = startY // 最近一整字格心
  let started = false
  let run = 0
  // 墨迹下缘相对排字 y 的位移（字身为负），据此把标点排字 y 收在格内
  const inkDrop = (PUNCT_DY + (PUNCT_INK_CY - 0.5) * PUNCT_SCALE + PUNCT_INK_HALF) * size
  const maxPunctY = cellBottom - inkDrop
  for (const ch of chars) {
    if (started && SINK_PUNCT.has(ch)) {
      const stack = Math.min(run, 2) * lineH * PUNCT_STACK
      const y = Math.min(prevY + lineH + stack, maxPunctY)
      out.push(placeChar(ch, x, y, size, false))
      run += 1
      continue
    }
    out.push(placeChar(ch, x, centerY, size, !started))
    prevY = centerY
    centerY += lineH
    started = true
    run = 0
  }
  return out
}

/** 整列上下居中（章名、图题用） */
export function centerChars(
  text: string,
  x: number,
  topY: number,
  height: number,
  lineH: number,
  size = lineH / 1.15,
  enablePunct = true
): VerticalChar[] {
  const chars = Array.from(text)
  if (!chars.length) return []
  const start = topY + (height - chars.length * lineH) / 2
  return chars.map((ch, i) => placeChar(ch, x, start + lineH * (i + 0.5), size, i === 0, enablePunct))
}

/** 多段竖排连写（段间留气口），总目条目用 */
function composeVertical(
  parts: string[],
  x: number,
  topY: number,
  lineH: number,
  gap: number,
  size = lineH / 1.15,
  enablePunct = true
): VerticalChar[] {
  const out: VerticalChar[] = []
  let y = topY
  for (const part of parts) {
    if (!part) continue
    out.push(...verticalRun(part, x, y, lineH, size, enablePunct))
    y += Array.from(part).length * lineH + gap
  }
  return out
}

/** 章/节起始页的公共字段 */
function pageBase(ctx: RenderContext, isChapterStart: boolean): RawPage {
  const front = ctx.chapter.kind === 'cover' || ctx.chapter.kind === 'titlePage'
  return {
    chapterId: ctx.chapter.id,
    chapterKind: ctx.chapter.kind,
    chapterTitle: ctx.chapter.title,
    isChapterStart,
    runningTitle: front ? null : ctx.chapter.title,
    frame: ctx.geometry.frame,
    spine: ctx.geometry.spine,
    gridXs: volumeGridXs(ctx.geometry)
  }
}

/**
 * 竖排文本章节分页
 * 首块若为 heading 则用作章名（缺省取 chapter.title），章名独占首叶最外一列。
 */
export function paginateVerticalText(blocks: VerticalTextBlock[], ctx: RenderContext): RawPage[] {
  const g = ctx.geometry
  const bodySize = ctx.fonts.bodySize
  const headingSize = ctx.fonts.headingSize
  const lineH = bodySize * 1.15
  const headingLineH = headingSize * 1.15
  const subSize = headingSize * 0.72
  const subLineH = subSize * 1.15
  const topY = g.frame.top + TEXT_PAD_Y
  const bottomY = g.frame.bottom - TEXT_PAD_Y
  const height = bottomY - topY
  const enablePunct = ctx.enablePunct

  const headFromBlocks = blocks.length > 0 && blocks[0].kind === 'heading'
  const headText = headFromBlocks ? blocks[0].text : ctx.chapter.title
  const baseIdx = headFromBlocks ? 1 : 0
  const body = blocks.slice(baseIdx)

  const pages: RawPage[] = []
  let half: 'right' | 'left' = 'right'
  // 章首叶最外一列留给章名（占 slot 0），正文自 slot 1 起
  let slot = 1
  let heading: TextPageContent['heading'] = {
    chars: centerChars(headText, columnX(g, 'right', 0), topY, height, headingLineH, headingSize, enablePunct),
    size: headingSize
  }
  let columns: TextColumn[] = []
  let subheadings: TextPageContent['subheadings'] = []
  let signatures: TextPageContent['signatures'] = []
  let blockStarts: number[] = []
  let sections: TextPageContent['sections'] = []

  const finalize = () => {
    const isStart = pages.length === 0
    pages.push({
      ...pageBase(ctx, isStart),
      text: { heading, columns, subheadings, signatures, blockStarts, sections }
    })
    heading = null
    columns = []
    subheadings = []
    signatures = []
    blockStarts = []
    sections = []
    half = 'right'
    slot = 0
  }

  /** 申领下一列：当前半叶排满则折另一半叶，左半叶亦满则翻叶 */
  const claimSlot = (): { half: 'right' | 'left'; slot: number } => {
    if (slot >= HALF_COLS) {
      if (half === 'right') {
        half = 'left'
        slot = 0
      } else {
        finalize()
      }
    }
    const cur = { half, slot }
    slot += 1
    return cur
  }

  const capAt = (startY: number) => Math.max(1, Math.floor((bottomY - startY) / lineH))

  for (let bi = 0; bi < body.length; bi++) {
    const block = body[bi]
    const text = block.text.replace(/\r/g, '')
    if (!text) continue
    const blockIndex = baseIdx + bi

    if (block.kind === 'subheading') {
      const s = claimSlot()
      const x = columnX(g, s.half, s.slot)
      const chars = verticalRun(text, x, topY + subLineH, subLineH, subSize, enablePunct).slice(0, Math.max(1, Math.floor((bottomY - topY - subLineH) / subLineH) + 1))
      subheadings.push({ chars, size: subSize })
      blockStarts.push(blockIndex)
      sections.push({ title: text, blockIndex, anchor: block.anchor })
      continue
    }

    if (block.kind === 'heading') {
      // 二级章名：独占一列、大字整列居中
      const s = claimSlot()
      const x = columnX(g, s.half, s.slot)
      subheadings.push({ chars: centerChars(text, x, topY, height, headingLineH, headingSize, enablePunct), size: headingSize })
      blockStarts.push(blockIndex)
      sections.push({ title: text, blockIndex, anchor: block.anchor })
      continue
    }

    // paragraph / signature：逐字流排（签名首列起笔低三行）
    const chars = Array.from(text.replace(/\n/g, ''))
    if (!chars.length) continue
    blockStarts.push(blockIndex)
    const isSignature = block.kind === 'signature'
    let offset = 0
    let firstCol = true
    while (offset < chars.length) {
      const startY = isSignature && firstCol ? topY + lineH * 3 : topY
      const capHere = capAt(startY)
      // 句读模式下句读点不占字位（记 0 单元）；传统模式下每字均占一格
      let used = 0
      let len = 0
      while (offset + len < chars.length) {
        const w = enablePunct && len > 0 && SINK_PUNCT.has(chars[offset + len]) ? 0 : 1
        if (used + w > capHere) break
        used += w
        len += 1
      }
      // 避头点（仅句读模式）：列首不留句读点，续排的句读点回挂本列末尾（悬挂、不占位）
      if (enablePunct && len > 0) {
        while (offset + len < chars.length && SINK_PUNCT.has(chars[offset + len])) len += 1
      }
      const s = claimSlot()
      const x = columnX(g, s.half, s.slot)
      const cellBottom = startY + capHere * lineH
      const seg = chars.slice(offset, offset + len)
      const arr = enablePunct
        ? flowRun(seg, x, startY, lineH, bodySize, cellBottom)
        : verticalRun(seg.join(''), x, startY, lineH, bodySize, false)
      if (isSignature) signatures.push({ chars: arr, size: bodySize })
      else columns.push({ half: s.half, x: r2(x), size: bodySize, chars: arr })
      offset += len
      firstCol = false
    }
  }

  // 收尾：末叶尚有落版内容（或整章无内容）时补一叶，避免末列文字丢失
  if (columns.length || subheadings.length || signatures.length || pages.length === 0) finalize()
  return pages
}

/** 总目每半叶格列数：筒子页左右各二十格（一叶四十格），较正文十列更密 */
export const TOC_COLS_PER_HALF = 20

/** 总目首叶章名所占格数（标题跨两列） */
const TOC_HEADER_COLS = 2

/** 总目列中轴：按二十格等分半叶，右半叶自版框外缘向内、左半叶自版心向外 */
function tocColumnX(g: VolumeGeometry, half: 'right' | 'left', slot: number): number {
  const colW = (g.frame.right - g.spine.right) / TOC_COLS_PER_HALF
  return half === 'right'
    ? g.frame.right - colW * (slot + 0.5)
    : g.spine.left - colW * (slot + 0.5)
}

/**
 * 总目所需叶数：四十格版式（左右半叶各二十格），
 * 首叶最外两格合为总目章名（余三十八格排条目），次叶起四十格全用于条目。
 */
export function tocLeafCount(entryCount: number): number {
  if (entryCount <= 0) return 0
  const first = TOC_COLS_PER_HALF * 2 - TOC_HEADER_COLS
  if (entryCount <= first) return 1
  return 1 + Math.ceil((entryCount - first) / (TOC_COLS_PER_HALF * 2))
}

/** 某叶可容纳的总目条目数（叶序从 0 起，0 为章首叶；章名跨首叶最外两格） */
function tocSlots(leafOffset: number): number {
  return leafOffset === 0 ? TOC_COLS_PER_HALF * 2 - TOC_HEADER_COLS : TOC_COLS_PER_HALF * 2
}

/**
 * 总目分页：四十格筒子页版式（左右半叶各二十格，一条目占一格），自右向左排列。
 *
 * 格内行款（标题在上、页脚在下、虚线相接）：
 * - 卷次 + 章名竖排于格子上部，自格子顶端起笔（节级缩进两行）；
 * - 叶码竖排于格子底部，末字字脚贴版框下界，各条目页码统一齐底；
 * - 标题末字与页码首字之间画一条竖直虚线引导，起止由实际字位算出，故不断点、不压字；
 * - 首叶最外两格合为总目章名（跨列居中于两格交界），条目自第三格起排；
 * - 总目页不画乌丝栏界行（列分隔线全部隐藏），仅留版框与版心。
 */
export function paginateToc(entries: TocEntry[], ctx: RenderContext): RawPage[] {
  const g = ctx.geometry
  const baseSize = ctx.fonts.headingSize * 0.62
  const topY = g.frame.top + TEXT_PAD_Y
  const bottomY = g.frame.bottom - TEXT_PAD_Y
  const height = bottomY - topY
  const pages: RawPage[] = []
  let cursor = 0
  let leafOffset = 0
  const headText = ctx.chapter.title || '总目'

  while (true) {
    const capacity = tocSlots(leafOffset)
    const batch = entries.slice(cursor, cursor + capacity)
    // 章名跨首叶最外两格：轴心取两格交界，字面纵向居中
    const headingX = (tocColumnX(g, 'right', 0) + tocColumnX(g, 'right', 1)) / 2
    const heading: TocPageContent['heading'] =
      leafOffset === 0
        ? { chars: centerChars(headText, headingX, topY, height, ctx.fonts.headingSize * 1.15, ctx.fonts.headingSize, ctx.enablePunct), size: ctx.fonts.headingSize }
        : null
    const rendered: TocRenderedEntry[] = []
    for (let i = 0; i < batch.length; i++) {
      const headSlots = leafOffset === 0 ? TOC_HEADER_COLS : 0
      const slotNo = i + headSlots
      const half: 'right' | 'left' = slotNo < TOC_COLS_PER_HALF ? 'right' : 'left'
      const slot = slotNo < TOC_COLS_PER_HALF ? slotNo : slotNo - TOC_COLS_PER_HALF
      const x = tocColumnX(g, half, slot)
      const e = batch[i]
      // 卷级条目用总目基准字号，节级条目缩一号并低两行起笔（竖排缩进）
      const size = e.level > 0 ? baseSize * 0.85 : baseSize
      const lineH = size * 1.15
      const startY = topY + lineH * Math.max(0, e.indent ?? 0)

      // 页码竖排于格子底部：末字墨迹下缘齐格子下界（按字号锚定，各级条目页码齐底）
      const pageTopY = bottomY - size * 0.5 - (Array.from(e.leafNumber).length - 0.5) * lineH
      const pageNoChars = verticalRun(e.leafNumber, x, pageTopY, lineH, size, ctx.enablePunct)

      // 标题竖排于格子上部：卷次、章名分两段（段间半字气口），须给页码与虚线留出余量
      const titleParts = e.ordinal ? [e.ordinal, e.title] : [e.title]
      const leaderPad = lineH * 0.6
      const titleRoom = Math.max(lineH, pageTopY - startY - leaderPad * 2)
      const titleChars = composeVertical(titleParts, x, startY, lineH, lineH * 0.55, size, ctx.enablePunct)
        .slice(0, Math.floor(titleRoom / lineH))
      const titleBottom = titleChars.length ? titleChars[titleChars.length - 1].y + lineH * 0.5 : startY
      const leaderTop = titleBottom + leaderPad
      const leaderBottom = pageTopY - leaderPad

      rendered.push({
        entryId: e.entryId,
        chapterId: e.chapterId,
        title: e.title,
        ordinal: e.ordinal,
        leafNumber: e.leafNumber,
        leafIndex: e.leafIndex,
        level: e.level,
        x: r2(x),
        size,
        chars: titleChars,
        pageNoChars,
        leader:
          leaderBottom > leaderTop
            ? { x: r2(x), y1: r2(leaderTop), y2: r2(leaderBottom) }
            : null
      })
    }
    pages.push({
      ...pageBase(ctx, leafOffset === 0),
      // 总目页隐藏全部列分隔线（乌丝栏界行）
      gridXs: [],
      toc: { heading, entries: rendered }
    })
    cursor += batch.length
    leafOffset += 1
    if (cursor >= entries.length) break
  }
  return pages
}

/**
 * 封面 / 扉页：一页一叶（筒子页版框照常绘制，仅排布谱名等题字）。
 * 谱名竖排居中于右半叶中轴；整个视觉组合块（谱名 + 黄金比呼吸距 + 题记两行）
 * 在「右边内容区」（frame.top ~ frame.bottom）内按黄金比 0.382:0.618 分配
 * 上下留白：上留白占 0.382、下留白占 0.618，使谱名靠上、题记靠下且整体不贴地脚。
 * 呼吸距严格 = titleH / φ（谱名高 : 间距 = 1 : 0.618）。
 * 堂号竖排于谱名左侧（字号 titleSize / φ²，次弱层级），与谱名左缘留一个谱名字号的间隔，
 * 且距版框上界亦留白，不贴上边；
 * 题记横排两行、横向居中于谱名中轴、字号 titleSize / φ³、自适应压缩不越版框右缘。
 */
export function buildCoverPage(ctx: RenderContext, mode: 'cover' | 'titlePage'): RawPage[] {
  const g = ctx.geometry
  const PHI = 1.618

  // 谱名尺寸（字号 = 纸高 × 0.085 / 0.072）
  const titleSize = g.pageHeight * (mode === 'cover' ? 0.085 : 0.072)
  const titleLineH = titleSize * 1.15
  const title = ctx.plan.title || '宗谱'
  const titleH = Array.from(title).length * titleLineH

  // 横向中轴：右半叶自身中心（版心右界 → 版框右缘 的中点）
  const titleX = (g.spine.right + g.frame.right) / 2

  // ---- 题记字号先算（组合块尺寸依赖它） ----
  // 字号 titleSize / φ³：比谱名小 φ³=4.24 倍，显著弱化视觉权重
  const metaSizeIdeal = titleSize / (PHI * PHI * PHI)
  const metaLinesRaw = [
    [ctx.plan.edition ?? '', ctx.plan.compiler ?? ''].filter(Boolean).join('　'),
    ctx.plan.compileDate ?? ''
  ].filter(Boolean)
  const META_STEP_FACTOR = 1.06
  const META_SIDE_PAD = 24
  const halfCenterX = (g.spine.right + g.frame.right) / 2
  const availableRightHalf = g.frame.right - halfCenterX - META_SIDE_PAD
  const finalMetaSize = (() => {
    if (!metaLinesRaw.length) return metaSizeIdeal
    const longest = Math.max(...metaLinesRaw.map(l => Array.from(l).length))
    const neededHalf = longest * metaSizeIdeal * META_STEP_FACTOR / 2
    if (neededHalf <= availableRightHalf) return metaSizeIdeal
    return Math.max(metaSizeIdeal * (availableRightHalf / neededHalf), 8)
  })()

  // ---- 整个视觉组合块的纵向排布 ----
  // 谱名与题记呼吸距 = titleH / φ（谱名高的黄金比倒数，严格 1:0.618 间距）
  const breath = titleH / PHI
  const metaLineGap = finalMetaSize * PHI
  const twoMetaH = finalMetaSize + metaLineGap + finalMetaSize
  const comboH = titleH + breath + twoMetaH

  // 右边内容区 = 版框墨线上下缘之间的可绘空间（frame.top ~ frame.bottom）
  const contentTop = g.frame.top
  const contentH = g.frame.bottom - g.frame.top

  // 可用留白 = 内容区高 − 组合块高；若组合块比内容区还高，挤压呼吸距保底
  const availablePad = Math.max(0, contentH - comboH)
  const topPad = availablePad * (PHI - 1)   // 0.382 分配给上方（谱名顶到内容区顶的空白）
  const bottomPad = availablePad - topPad   // 0.618 分配给下方（题记底到内容区底的空白）

  // 组合块顶 = 内容区顶 + 黄金比上留白 → 谱名从此起排
  const titleTop = contentTop + topPad
  const titleBottom = titleTop + titleH
  const titleChars = verticalRun(title, titleX, titleTop, titleLineH, titleSize, ctx.enablePunct)

  // ---- 题记两行（位置已由组合块顶 → 呼吸距自动确定） ----
  const metaCols: VerticalChar[][] = []
  if (metaLinesRaw.length) {
    const stepX = finalMetaSize * META_STEP_FACTOR
    const metaStartY = titleBottom + breath
    metaLinesRaw.forEach((line, li) => {
      const chars = Array.from(line)
      const lineW = chars.length * stepX
      const firstCenterX = titleX - lineW / 2 + stepX / 2
      const y = metaStartY + li * metaLineGap
      metaCols.push(chars.map((ch, i) => ({ ch, x: r2(firstCenterX + i * stepX), y: r2(y) })))
    })
  }

  // 堂号：谱名左侧竖排小字（字号 titleSize / φ²，次弱层级）
  // 横向：固定于 x = 100（纸张左上区，距版框左界 64 留 36px 余量）
  // 纵向：自版框上界内缩 titleSize / φ 起排，与上边距留白不贴顶
  const clanSize = titleSize / (PHI * PHI)
  const clanLineH = clanSize * 1.15
  const clanText = ctx.plan.clanName ?? ''
  const clanTopPad = titleSize / PHI
  const clanX = 900
  const clanChars = clanText
    ? verticalRun(clanText, clanX, g.frame.top + clanTopPad, clanLineH, clanSize, ctx.enablePunct)
    : []

  const content: CoverPageContent = {
    mode,
    titleChars,
    titleSize,
    clanChars,
    clanSize,
    metaCols,
    metaSize: finalMetaSize
  }
  return [
    {
      ...pageBase(ctx, true),
      gridXs: [],
      cover: content
    }
  ]
}

/**
 * 图版：single 通版一叶（最外一列竖排图题与图注，图区占其余版框内区）；
 * double 双联（左右半叶各一版、各自外侧列排图题），两版合占一叶；
 * src 为空时落图框并标「图版待补」占位。
 */
export function paginatePlates(plates: PlateItem[], ctx: RenderContext): RawPage[] {
  const g = ctx.geometry
  const titleSize = ctx.fonts.headingSize * 0.8
  const titleLineH = titleSize * 1.15
  const captionSize = ctx.fonts.bodySize * 0.9
  const captionLineH = captionSize * 1.15
  const imgY = g.frame.top + FRAME_INSET
  const imgH = g.frame.bottom - g.frame.top - FRAME_INSET * 2

  if (!plates.length) {
    return [{ ...pageBase(ctx, true), plates: [] }]
  }

  /** 图题列与图区：single 通版；double 按半叶取内框（图题列在各半叶外侧一列） */
  const region = (layout: 'single' | 'double', half: 'right' | 'left' | null) => {
    if (layout === 'single' || !half) {
      return {
        titleX: columnX(g, 'right', 0),
        x: g.frame.left + FRAME_INSET,
        right: g.frame.right - g.colW - FRAME_INSET
      }
    }
    return half === 'right'
      ? {
          titleX: columnX(g, 'right', 0),
          x: g.spine.right + FRAME_INSET,
          right: g.frame.right - g.colW - FRAME_INSET
        }
      : {
          titleX: columnX(g, 'left', HALF_COLS - 1),
          x: g.frame.left + g.colW + FRAME_INSET,
          right: g.spine.left - FRAME_INSET
        }
  }

  const place = (
    p: PlateItem,
    layout: 'single' | 'double',
    half: 'right' | 'left' | null
  ): PlatePlacement => {
    const r = region(layout, half)
    let y = g.frame.top
    const titleChars = verticalRun(p.title, r.titleX, y, titleLineH, titleSize, ctx.enablePunct)
    y += Array.from(p.title).length * titleLineH + titleSize * 0.6
    const captionChars = p.caption ? verticalRun(p.caption, r.titleX, y, captionLineH, captionSize, ctx.enablePunct) : []
    return {
      plateId: p.id,
      title: p.title,
      src: p.src,
      caption: p.caption,
      category: p.category,
      layout,
      half,
      fit: p.fit ?? 'contain',
      frame: p.frame !== false,
      placeholder: !p.src,
      x: r2(Math.min(r.x, r.right)),
      y: r2(imgY),
      width: r2(Math.abs(r.right - r.x)),
      height: r2(imgH),
      titleChars,
      titleSize,
      captionChars,
      captionSize
    }
  }

  // 双联版两两合叶；通版各占一叶。落单的双联版退化为通版，避免半叶空白。
  const groups: { plate: PlateItem; half: 'right' | 'left' }[][] = []
  let cur: { plate: PlateItem; half: 'right' | 'left' }[] = []
  for (const p of plates) {
    if ((p.layout ?? 'single') === 'double') {
      if (cur.length) {
        cur.push({ plate: p, half: 'left' })
        groups.push(cur)
        cur = []
      } else {
        cur = [{ plate: p, half: 'right' }]
      }
    } else {
      if (cur.length) {
        groups.push(cur)
        cur = []
      }
      groups.push([{ plate: p, half: 'right' }])
    }
  }
  if (cur.length) groups.push(cur)

  return groups.map((grp, i) => {
    const placements =
      grp.length === 1
        ? [place(grp[0].plate, 'single', null)]
        : grp.map(item => place(item.plate, 'double', item.half))
    return { ...pageBase(ctx, i === 0), plates: placements }
  })
}
