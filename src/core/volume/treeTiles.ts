// 世系图分幅（树幅切片）：一棵大树超出单叶容幅时，按「代」纵切、按「宽」横切，
// 一叶一幅续排；相邻幅重叠若干代（骑缝），便于上下幅对照衔接。
//
// 算法：
// 1. 先以 runLayout 一次性完成全树布局（世界坐标），再横向镜像使长房居右（筒子页右起读）；
// 2. 纵切：按 depth 分带，世代数不设固定上限——先按版框内高收代，再逐代试排横向宽度，
//    某一代整行（含配偶列）超出半叶可用宽时，该代及之后世代整体顺延下一幅（同代不跨带）；
// 3. 横切：带内按房深度优先（长房在前）拆单元，按 maxTileWidth 装箱成列（节点数不设固定上限，
//    仅显式传入 maxNodesPerTile 时限流），每列一幅；同一房不会被中缝拆散，达到单页容量才另起一幅；
// 4. 每幅取本幅节点、以「子节点在本幅」的连线（含自上市跨幅入线），
//    包围盒按节点文字估算外扩加留白，供组件按幅取景。
import type { FamilyNode, LayoutEdge, LayoutNode, LayoutResult } from '../types'
import { runLayout } from '../layout'
import type { TreeTile, TreeTileOptions } from './types'
import { toChineseNum } from './paginate'

export interface TreeSliceResult {
  /** 全树整体布局（供包围盒/统计参考） */
  layout: LayoutResult
  tiles: TreeTile[]
}

/** 世系图节点竖排版式基准（与图画 DefaultNode 一致：卡半高、首字上距） */
const NODE_HALF_H = 24
const NAME_PAD_TOP = 5

/**
 * 世系图姓名竖排版式：姓名逐字竖排于节点中心列，
 * 首字上沿恒在节点上方 NAME_PAD_TOP 处，行距 1.05×字号（字号增大向下伸展）。
 * 返回逐字纵坐标与内容上下缘（均相对节点中心），渲染与取景共用同一套算法。
 */
export function treeNameSpans(name: string, mainSize: number) {
  const lineH = Math.round(mainSize * 1.05)
  const first = -NODE_HALF_H + NAME_PAD_TOP + Math.round(mainSize / 2)
  const chars = Array.from(name || '').map((ch, i) => ({ ch, y: Math.round(first + i * lineH) }))
  return {
    chars,
    top: first - mainSize / 2,
    bottom: first + Math.max(0, chars.length - 1) * lineH + mainSize / 2
  }
}

/** 排行/承继小字行距（与图画 DefaultNode 的 TITLE_ROW_H 一致） */
const TITLE_ROW_H = 10

/** 辅助信息展示开关（与图谱同名开关一致，仅影响展示与占位测量） */
export interface TreeAuxOptions {
  showRank?: boolean
  showInherit?: boolean
  spouseFormat?: 'full' | 'surname'
}

/**
 * 世系图节点辅助信息版式（与图画 DefaultNode 同款，仅决定展示位置，不改动节点数据）：
 * 排行竖排于姓名右侧、承继竖排于姓名左侧、配偶逐列竖排于姓名右侧。
 * 排行/承继可按开关隐藏；配偶可显示全名或「某氏」。
 */
export function treeNodeExtras(
  n: LayoutNode,
  mainSize: number,
  auxSize: number,
  opts: TreeAuxOptions = {}
) {
  const showRank = opts.showRank ?? true
  const showInherit = opts.showInherit ?? true
  const first = -NODE_HALF_H + NAME_PAD_TOP + Math.round(mainSize / 2)
  const sideChars = (text?: string | null) => {
    const list = Array.from(text || '')
    return list.map((ch, i) => ({
      ch,
      y: Math.round(-NODE_HALF_H - 15 + (i - (list.length - 1) / 2) * TITLE_ROW_H)
    }))
  }
  const spW = Math.max(12, auxSize + 2)
  const spouseBase = mainSize / 2 + 8
  const spH = Math.round(auxSize * 1.1)
  // 「某氏」格式：已是「X氏」原样保留，否则取首字拼「氏」（仅影响展示，不改数据）
  const spouseName = (name: string) =>
    opts.spouseFormat === 'surname' && !/氏$/.test(name) ? `${name.charAt(0)}氏` : name
  const spouses = (n.spouse ?? []).map((raw, k) => ({
    x: Math.round(spouseBase + k * spW),
    chars: Array.from(spouseName(raw)).map((ch, i) => ({
      ch,
      y: Math.round(first + i * spH)
    }))
  }))
  return {
    rank: showRank ? sideChars(n.rank) : [],
    inherit: showInherit ? sideChars(n.inherit) : [],
    spouses
  }
}

/** 节点人物信息占位：姓名列 + 两侧排行/承继小字 + 配偶列 */
export function treeNodeBox(
  n: LayoutNode,
  mainSize: number,
  auxSize: number,
  opts: TreeAuxOptions = {}
) {
  const name = treeNameSpans(n.name, mainSize)
  const ex = treeNodeExtras(n, mainSize, auxSize, opts)
  let left = -mainSize / 2
  let right = mainSize / 2
  let top = name.top
  let bottom = name.bottom
  // 排行/承继：9px 小字距姓名列 8，半宽约 5
  const side = 8 + 5
  if (ex.rank.length) right = Math.max(right, side)
  if (ex.inherit.length) left = Math.min(left, -side)
  for (const list of [ex.rank, ex.inherit]) {
    if (!list.length) continue
    top = Math.min(top, list[0].y - 6)
    bottom = Math.max(bottom, list[list.length - 1].y + 6)
  }
  for (const sp of ex.spouses) {
    if (!sp.chars.length) continue
    right = Math.max(right, sp.x + auxSize / 2)
    top = Math.min(top, sp.chars[0].y - auxSize / 2)
    bottom = Math.max(bottom, sp.chars[sp.chars.length - 1].y + auxSize / 2)
  }
  return { left, right, top, bottom }
}

// 与图谱左侧 GenRuler 相同的标签行款：12px 字、6/8px 横纵内距、6px 圆角、1px 边线
const LEAF_GEN_FONT_SIZE = 12
const LEAF_GEN_LETTER_SPACING = 5
const LEAF_GEN_PAD_X = 6
const LEAF_GEN_PAD_Y = 8
const LEAF_GEN_BORDER = 1
const LEAF_GEN_RADIUS = 6

/** 世代标签行款；本幅所有世代共用，位置由成册右侧版框标签栏统一决定 */
export function treeGenerationLabel(n: LayoutNode) {
  const text = `第${toChineseNum(n.depth + 1)}世`
  const chars = Array.from(text)
  const textHeight = chars.length * LEAF_GEN_FONT_SIZE
    + Math.max(0, chars.length - 1) * LEAF_GEN_LETTER_SPACING
  const width = LEAF_GEN_FONT_SIZE + LEAF_GEN_PAD_X * 2 + LEAF_GEN_BORDER * 2
  const height = textHeight + LEAF_GEN_PAD_Y * 2 + LEAF_GEN_BORDER * 2
  const firstY = -textHeight / 2 + LEAF_GEN_FONT_SIZE / 2
  return {
    text,
    width,
    height,
    radius: LEAF_GEN_RADIUS,
    border: LEAF_GEN_BORDER,
    fontSize: LEAF_GEN_FONT_SIZE,
    letterSpacing: LEAF_GEN_LETTER_SPACING,
    chars: chars.map((ch, i) => ({
      ch,
      y: firstY + i * (LEAF_GEN_FONT_SIZE + LEAF_GEN_LETTER_SPACING)
    }))
  }
}

/**
 * 求一条不穿过任何节点文字的竖直分栏线（世界坐标），供筒子页中缝断图。
 * 优先在「始祖左缘」附近找空隙，使始祖完整留在右半叶（筒子页右页起读，先见始祖）；
 * 找不到时退回幅心附近的无节点空隙。
 */
function findSplitX(
  nodes: LayoutNode[],
  minX: number,
  maxX: number,
  mainSize: number,
  auxSize: number,
  aux: TreeAuxOptions = {}
): number {
  const mid = (minX + maxX) / 2
  // 按节点文字的实际包围盒（姓名列 + 排行/承继小字 + 配偶列）判定占位，
  // 外加 4px 净距；不用 nodeHalfW 的最小 20px 下限，否则压缩后相邻盒连成一片，找不到空隙
  const MARGIN = 4
  const boxes = nodes.map(n => {
    const b = treeNodeBox(n, mainSize, auxSize, aux)
    return [n.x + b.left - MARGIN, n.x + b.right + MARGIN] as [number, number]
  })
  const occupied = (x: number) => boxes.some(([l, r]) => x > l && x < r)
  const reach = Math.max(1, (maxX - minX) / 2)
  // 根节点即始祖：分栏线须落在其左缘之外
  const root = nodes.reduce((a, b) => (b.depth < a.depth ? b : a))
  const rootLeft = root.x + treeNodeBox(root, mainSize, auxSize, aux).left - MARGIN
  const start = Math.min(mid, rootLeft)
  for (let d = 0; d <= reach; d += 3) {
    const left = start - d
    if (left >= minX && left <= rootLeft && !occupied(left)) return left
    const right = start + d
    if (right <= maxX && right <= rootLeft && !occupied(right)) return right
  }
  for (let d = 0; d <= reach; d += 3) {
    const left = mid - d
    if (left >= minX && !occupied(left)) return left
    const right = mid + d
    if (right <= maxX && !occupied(right)) return right
  }
  return mid
}

/** 吊线自节点中心向下的固定偏移（与 runLayout 的 DEFAULT_DROP 一致） */
const EDGE_DROP = 24

/** 按代带重排时虚拟始祖的 id（仅用于把本带诸根并作一层，不参与出图） */
const BAND_VIRTUAL_ID = '__band_root__'

/**
 * 按代带重排横向坐标：与图谱（`runLayout`）同一套「相对层轮廓避让」规则，
 * 但节点占位直接取本幅实际绘制的整体包围盒 `treeNodeBox`——
 * 姓名 + 排行/承继 + 配偶列算作一个单元（配偶不再被当成额外空白），
 * 同辈单元边缘净距恒为 gapX，父节点居中于子群中点。
 * 只排本带节点：带外世代不参与，父节点不会为已切走的子孙空占横向位置。
 * 全局坐标已镜像（x 越大辈分越长），故自左向右排即幺房在前、长房居右。
 */
function bandLayoutX(
  nodes: LayoutNode[],
  parentOf: Map<string, string>,
  gapX: number,
  mainSize: number,
  auxSize: number,
  aux: TreeAuxOptions
): Map<string, number> {
  const out = new Map<string, number>()
  if (!nodes.length) return out
  const byId = new Map(nodes.map(n => [n.id, n]))
  const childrenOf = new Map<string, LayoutNode[]>()
  const roots: LayoutNode[] = []
  for (const n of nodes) {
    const p = parentOf.get(n.id)
    if (p && byId.has(p)) {
      const list = childrenOf.get(p)
      if (list) list.push(n)
      else childrenOf.set(p, [n])
    } else {
      roots.push(n)
    }
  }
  const byAge = (a: LayoutNode, b: LayoutNode) => a.x - b.x
  roots.sort(byAge)
  for (const list of childrenOf.values()) list.sort(byAge)
  // 虚拟始祖把本带诸根并作一层，使跨房堂兄弟也按同辈单元轮廓避让
  childrenOf.set(BAND_VIRTUAL_ID, roots)

  const relX = new Map<string, number>()

  /** 递归排版：返回本子树在相对深度 k 上相对本根（x=0）的最左/最右单元边缘 */
  function assign(n: LayoutNode): { L: number[]; R: number[] } {
    const box =
      n.id === BAND_VIRTUAL_ID
        ? { left: 0, right: 0 }
        : treeNodeBox(n, mainSize, auxSize, aux)
    const L: number[] = [box.left]
    const R: number[] = [box.right]
    const kids = childrenOf.get(n.id) || []
    if (!kids.length) return { L, R }

    const gl: number[] = []
    const gr: number[] = []
    const shifts: number[] = []
    for (let j = 0; j < kids.length; j++) {
      const sub = assign(kids[j])
      let s = 0
      if (j > 0) {
        s = -Infinity
        // 仅在两棵子树都有节点的相对层上要求 左单元右缘 + gapX ≤ 右单元左缘
        for (let k = 0; k < sub.L.length; k++) {
          const pr = gr[1 + k]
          if (pr !== undefined) {
            const need = pr - sub.L[k] + gapX
            if (need > s) s = need
          }
        }
        if (s === -Infinity) s = 0
      }
      shifts.push(s)
      for (let k = 0; k < sub.L.length; k++) {
        const idx = 1 + k
        const l = s + sub.L[k]
        const r = s + sub.R[k]
        if (gl[idx] === undefined || l < gl[idx]) gl[idx] = l
        if (gr[idx] === undefined || r > gr[idx]) gr[idx] = r
      }
    }
    // 父节点居中于首末子之间（与图谱一致）
    const offset = (shifts[0] + shifts[shifts.length - 1]) / 2
    for (let j = 0; j < kids.length; j++) relX.set(kids[j].id, shifts[j] - offset)
    for (let idx = 1; idx < gl.length; idx++) {
      if (gl[idx] !== undefined) {
        L[idx] = gl[idx] - offset
        R[idx] = gr[idx] - offset
      }
    }
    return { L, R }
  }

  assign({ ...nodes[0], id: BAND_VIRTUAL_ID })
  ;(function place(n: LayoutNode, ax: number) {
    out.set(n.id, ax)
    for (const c of childrenOf.get(n.id) || []) place(c, ax + (relX.get(c.id) ?? 0))
  })({ ...nodes[0], id: BAND_VIRTUAL_ID }, 0)
  out.delete(BAND_VIRTUAL_ID)
  return out
}

/** 节点文字横向范围（世界坐标），分列与容量按此度量 */
function nodeSpan(
  n: LayoutNode,
  mainSize: number,
  auxSize: number,
  aux: TreeAuxOptions
): { l: number; r: number } {
  const b = treeNodeBox(n, mainSize, auxSize, aux)
  return { l: n.x + b.left, r: n.x + b.right }
}

/**
 * 按「房」把节点拆成单元，深度优先、长房在前：
 * 本组最浅层的每个祖先连同其全部后代自成一房；若只有一个祖先（单传或整树同根），
 * 则祖先自成一单元，其下各房继续向下拆。
 * 镜像坐标下长房 x 最大，故同级各房按 x 由大到小排列即为长幼次序。
 */
function houseUnits(nodes: LayoutNode[], parentOf: Map<string, string>): LayoutNode[][] {
  let topDepth = Infinity
  for (const n of nodes) if (n.depth < topDepth) topDepth = n.depth
  const byId = new Map(nodes.map(n => [n.id, n]))
  const groups = new Map<string, LayoutNode[]>()
  for (const n of nodes) {
    let cur = n
    while (cur.depth > topDepth) {
      const p = byId.get(parentOf.get(cur.id) ?? '')
      if (!p || p.depth >= cur.depth) break
      cur = p
    }
    const list = groups.get(cur.id)
    if (list) list.push(n)
    else groups.set(cur.id, [n])
  }
  const list = Array.from(groups.values())
  const maxX = (g: LayoutNode[]) => g.reduce((m, n) => Math.max(m, n.x), -Infinity)
  list.sort((a, b) => maxX(b) - maxX(a))
  if (list.length > 1) return list
  // 单一祖先：祖先单独成单元，再按其下各房递归（保证祖先排在最前、长房次之）
  const top = nodes.find(n => n.depth === topDepth)!
  const rest = nodes.filter(n => n.id !== top.id)
  if (!rest.length) return list
  return [[top], ...houseUnits(rest, parentOf)]
}

/** 单元横向范围 */
function unitSpan(u: LayoutNode[], spans: Map<string, { l: number; r: number }>) {
  let l = Infinity
  let r = -Infinity
  for (const n of u) {
    const s = spans.get(n.id)!
    if (s.l < l) l = s.l
    if (s.r > r) r = s.r
  }
  return { l, r }
}

/** 把超宽/超节点数的房继续按下一层房细切，直到每个单元能装进一幅 */
function treeUnits(
  nodes: LayoutNode[],
  parentOf: Map<string, string>,
  spans: Map<string, { l: number; r: number }>,
  maxTileWidth: number,
  maxNodesPerTile: number
): LayoutNode[][] {
  const out: LayoutNode[][] = []
  for (const u of houseUnits(nodes, parentOf)) {
    const s = unitSpan(u, spans)
    const over = u.length > maxNodesPerTile || s.r - s.l > maxTileWidth
    if (!over || u.length === 1) out.push(u)
    else out.push(...treeUnits(u, parentOf, spans, maxTileWidth, maxNodesPerTile))
  }
  return out
}

/**
 * 按单元装箱成列（自右向左读 = 长房在前）：一列装得下就并入，
 * 超节点数或超幅宽则另起一列，到页面容纳上限后再切下一叶。
 */
function packColumns(
  units: LayoutNode[][],
  spans: Map<string, { l: number; r: number }>,
  maxTileWidth: number,
  maxNodesPerTile: number
): LayoutNode[][] {
  const cols: LayoutNode[][] = []
  let cur: LayoutNode[] = []
  let curL = Infinity
  let curR = -Infinity
  for (const u of units) {
    const s = unitSpan(u, spans)
    const nl = Math.min(curL, s.l)
    const nr = Math.max(curR, s.r)
    if (!cur.length || (cur.length + u.length <= maxNodesPerTile && nr - nl <= maxTileWidth)) {
      cur.push(...u)
      curL = nl
      curR = nr
    } else {
      cols.push(cur)
      cur = u.slice()
      curL = s.l
      curR = s.r
    }
  }
  if (cur.length) cols.push(cur)
  return cols
}

/** 幅内吊线重建：按压缩后的坐标重算路径；父节点不在本幅时只画一截上引线 */
function rebuildEdges(
  all: LayoutEdge[],
  ids: Set<string>,
  byId: Map<string, LayoutNode>
): LayoutEdge[] {
  const out: LayoutEdge[] = []
  for (const e of all) {
    if (!ids.has(e.childId)) continue
    const child = byId.get(e.childId)!
    const parent = byId.get(e.parentId)
    if (parent) {
      const py = parent.y + (parent.dropY ?? EDGE_DROP)
      const mid = py + 16
      out.push({
        parentId: e.parentId,
        childId: e.childId,
        d:
          'M ' + parent.x + ' ' + py +
          ' L ' + parent.x + ' ' + mid +
          ' L ' + child.x + ' ' + mid +
          ' L ' + child.x + ' ' + (child.y - EDGE_DROP),
        xmin: Math.min(parent.x, child.x),
        xmax: Math.max(parent.x, child.x),
        ymin: py,
        ymax: child.y - EDGE_DROP
      })
    } else {
      const top = child.y - EDGE_DROP - 24
      out.push({
        parentId: e.parentId,
        childId: e.childId,
        d: 'M ' + child.x + ' ' + top + ' L ' + child.x + ' ' + (child.y - EDGE_DROP),
        xmin: child.x,
        xmax: child.x,
        ymin: top,
        ymax: child.y - EDGE_DROP
      })
    }
  }
  return out
}

/**
 * 将整树切成一幅幅可单叶排版的树幅
 * @param root 世系根节点
 * @param options 分幅参数
 */
export function sliceTree(root: FamilyNode, options: TreeTileOptions = {}): TreeSliceResult {
  // 世代数不设固定上限：能装几代装几代，由版面高度与横向容量共同决定
  const maxDepthPerTile = Math.max(1, options.maxDepthPerTile ?? Infinity)
  const maxTileWidth = Math.max(1, options.maxTileWidth ?? 900)
  const maxTileHeight = options.maxTileHeight ?? Infinity
  // 节点数不设固定上限：横向容量由版宽与节点单元宽（含配偶列）自动换算，
  // 仅当调用方显式传入 maxNodesPerTile 时才额外限流
  const maxNodesPerTile = Math.max(1, options.maxNodesPerTile ?? Infinity)
  const overlapDepth = Math.max(0, options.overlapDepth ?? 1)
  const padding = options.padding ?? 40
  // 成册用较小字号与间距：保证可读的同时提高单叶承载量（图画视图另用其自身字号）
  const gapX = options.gapX ?? 26
  const gapY = options.gapY ?? 67
  const mainSize = options.mainSize ?? 12
  const auxSize = options.auxSize ?? 8
  const showRank = options.showRank ?? true
  const showInherit = options.showInherit ?? true
  const spouseFormat = options.spouseFormat ?? 'full'
  const aux: TreeAuxOptions = { showRank, showInherit, spouseFormat }

  const layout = runLayout(root, gapX, gapY, [], mainSize, auxSize)
  // 横向镜像：筒子页自右向左读，镜向后长房落在右侧（先读），幺房依次向左
  const all = layout.nodes.map(n => ({ ...n, x: -n.x }))
  if (!all.length) return { layout, tiles: [] }

  // 子 → 父，供按房成列时回溯同一祖先
  const parentOf = new Map<string, string>()
  for (const e of layout.edges) parentOf.set(e.childId, e.parentId)

  let minDepth = Infinity
  let maxDepth = -Infinity
  for (const n of all) {
    if (n.depth < minDepth) minDepth = n.depth
    if (n.depth > maxDepth) maxDepth = n.depth
  }

  const allById = new Map(all.map(n => [n.id, n]))

  /**
   * 续幅的骑缝旧世代只保留通向本带新增人物的祖先链。
   * 无后代的旧世代叶子已完整留在上一幅，不再复制到下一幅。
   */
  const nodesForBand = (start: number, end: number): LayoutNode[] => {
    const raw = all.filter(n => n.depth >= start && n.depth <= end)
    if (prevBandEnd < start) return raw
    const keep = new Set<string>()
    for (const n of raw) {
      if (n.depth <= prevBandEnd) continue
      let cur: LayoutNode | undefined = n
      while (cur && cur.depth >= start) {
        keep.add(cur.id)
        if (cur.depth === start) break
        cur = allById.get(parentOf.get(cur.id) ?? '')
      }
    }
    return raw.filter(n => keep.has(n.id))
  }

  const tileNodes: { nodes: LayoutNode[]; overlapIds: string[]; bandStart: number }[] = []
  let bandStart = minDepth
  let prevBandEnd = minDepth - 1

  /** 某段代际的世界高度（含取景留白），供「按版面高度自动收幅」判断 */
  const bandHeight = (start: number, end: number): number => {
    let top = Infinity
    let bottom = -Infinity
    for (const n of nodesForBand(start, end)) {
      const b = treeNodeBox(n, mainSize, auxSize, aux)
      top = Math.min(top, n.y + b.top)
      bottom = Math.max(bottom, n.y + b.bottom)
    }
    return bottom > top ? bottom - top + padding * 2 : 0
  }

  /** 某段代际横向重排后的内容净宽（含姓名/排行/承继/配偶单元，不含取景留白） */
  const bandWidth = (start: number, end: number): number => {
    const raw = nodesForBand(start, end)
    if (!raw.length) return 0
    const xMap = bandLayoutX(raw, parentOf, gapX, mainSize, auxSize, aux)
    let l = Infinity
    let r = -Infinity
    for (const n of raw) {
      const x = xMap.get(n.id) ?? n.x
      const b = treeNodeBox(n, mainSize, auxSize, aux)
      l = Math.min(l, x + b.left)
      r = Math.max(r, x + b.right)
    }
    return r > l ? r - l : 0
  }

  /**
   * 按版面自动收代：先受世代上限（若显式设置）与版框高度约束，
   * 再逐代试排横向宽度——某一代整行（含配偶列）排不进半叶可用宽时，
   * 该代及之后世代整体顺延到下一幅，绝不把能整代同页的世代拆到两页。
   */
  const fitBand = (start: number): number => {
    const depthCap = Number.isFinite(maxDepthPerTile)
      ? Math.min(start + maxDepthPerTile - 1, maxDepth)
      : maxDepth
    let end = depthCap
    while (end > start && bandHeight(start, end) > maxTileHeight) end--
    while (end > start && bandWidth(start, end) > maxTileWidth) end--
    return end
  }

  while (bandStart <= maxDepth) {
    let bandEnd = fitBand(bandStart)
    // 连「骑缝父行 + 新一代」都排不下时，仍保留两代成带，交由按房装箱整支切分：
    // 每幅都带父行作骑缝、父子同页相连，避免裸切一代造成无父可考的稀疏页
    if (bandEnd === bandStart && bandStart < maxDepth) bandEnd = bandStart + 1
    const rawBand = nodesForBand(bandStart, bandEnd)

    // 幅内横向重排：沿用图谱轮廓避让，占位含姓名与配偶列（一个单元），同辈净距恒为 gapX
    const xMap = bandLayoutX(rawBand, parentOf, gapX, mainSize, auxSize, aux)
    const inBand = rawBand.map(n => ({ ...n, x: xMap.get(n.id) ?? n.x }))

    // 按房分列（深度优先、长房在前），每列即一幅：受幅宽与单叶节点数上限约束，
    // 同房兄弟/父子不会被半叶中缝拆散；装不下的房再按下一层房细切
    const spans = new Map<string, { l: number; r: number }>()
    for (const n of inBand) spans.set(n.id, nodeSpan(n, mainSize, auxSize, aux))
    const columns = packColumns(
      treeUnits(inBand, parentOf, spans, maxTileWidth, maxNodesPerTile),
      spans,
      maxTileWidth,
      maxNodesPerTile
    )

    // 列序即读序：第一列排右半叶（奇数页），第二列排左半叶（偶数页），其余续叶
    for (let c = 0; c < columns.length; c++) {
      const picked = columns[c]
      const overlapIds = picked
        .filter(n => n.depth <= prevBandEnd)
        .map(n => n.id)
      // 横切末列可能只剩无后代的骑缝父行；这些人在上一带均已出图，
      // 再单列一幅既没有新增人物，也割断阅读节奏，直接省去
      if (overlapIds.length === picked.length) continue
      tileNodes.push({ nodes: picked, overlapIds, bandStart })
    }

    if (bandEnd >= maxDepth) break
    const nextStart = Math.max(bandStart + 1, bandEnd - overlapDepth + 1)
    prevBandEnd = bandEnd
    bandStart = nextStart
  }

  const tiles: TreeTile[] = tileNodes.map((t, i) => {
    const ids = new Set(t.nodes.map(n => n.id))
    const byId = new Map(t.nodes.map(n => [n.id, n]))
    const edges = rebuildEdges(layout.edges, ids, byId)

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const n of t.nodes) {
      const box = treeNodeBox(n, mainSize, auxSize, aux)
      minX = Math.min(minX, n.x + box.left)
      maxX = Math.max(maxX, n.x + box.right)
      minY = Math.min(minY, n.y + box.top)
      maxY = Math.max(maxY, n.y + box.bottom)
    }
    // 右侧版框标签栏不挤占节点横向位置，但标签纵向范围须纳入取景，避免越出版框
    for (const n of t.nodes) {
      const label = treeGenerationLabel(n)
      if (!label) continue
      minY = Math.min(minY, n.y - label.height / 2)
      maxY = Math.max(maxY, n.y + label.height / 2)
    }
    // 吊线（父→横梁→子）的纵向跨度同样纳入取景，竖排姓名较长时也不会裁掉连线
    for (const e of edges) {
      minY = Math.min(minY, e.ymin)
      maxY = Math.max(maxY, e.ymax)
    }
    if (!t.nodes.length) {
      minX = 0
      maxX = 1
      minY = 0
      maxY = 1
    }

    // 本幅最浅一代及其首行文字上缘：同一叶两幅据此按世对齐
    let topDepth = Infinity
    for (const n of t.nodes) topDepth = Math.min(topDepth, n.depth)
    let topY = Infinity
    for (const n of t.nodes) {
      if (n.depth === topDepth) topY = Math.min(topY, n.y + treeNodeBox(n, mainSize, auxSize, aux).top)
    }
    if (!Number.isFinite(topDepth)) topDepth = 0
    if (!Number.isFinite(topY)) topY = minY

    return {
      tileIndex: i,
      label: `第${toChineseNum(i + 1)}幅`,
      bounds: {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding
      },
      nodes: t.nodes,
      edges,
      overlapIds: t.overlapIds,
      continuesNext: i < tileNodes.length - 1,
      bandStart: t.bandStart,
      topDepth,
      topY,
      mainSize,
      auxSize,
      showRank,
      showInherit,
      spouseFormat,
      splitX: t.nodes.length
        ? findSplitX(t.nodes, minX, maxX, mainSize, auxSize, aux)
        : 0
    }
  })

  return { layout, tiles }
}
