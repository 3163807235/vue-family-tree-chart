// 家谱宝塔吊线布局纯函数（无 DOM、无框架依赖，可在 Worker/主线程通用）
import type { FamilyNode, LayoutNode, LayoutEdge, LayoutResult } from './types'

/** 卡半宽（与渲染端一致） */
const HW = 16
/** 卡半高（与渲染端 HH=24 一致，避免吊线穿卡） */
const HALF = 24
/** 配偶横向步距（与渲染端 SP_W 一致） */
const SP_W = 12
/** 配偶竖文字体半宽 */
const GLYPH = 5
/** 右侧水平留白 */
const H_MARGIN = 80
/** 根节点起始 y */
const BASE_Y = 60

/** 排行标签：1→长, 2→次, 3→三, 4→四…并加子/女后缀 */
const CAT: Record<string, string> = { m: '子', f: '女' }
const UNC = ['', '', '', '三', '四', '五', '六', '七', '八', '九', '十']

function rankLabel(g: string, count: number): string {
  if (count <= 1) return '长' + CAT[g]
  if (count === 2) return '次' + CAT[g]
  return (UNC[count] || String(count)) + CAT[g]
}

/** 家庭单元内容宽（世界坐标 px）：卡 + 配偶列贴合 */
function famWidth(n: FamilyNode, gapX: number): number {
  const spc = n.spouse ? n.spouse.length : 0
  const R = spc ? HW + 6 + (spc - 1) * SP_W + GLYPH : HW
  return HW + Math.max(HW, R)
}

/**
 * 执行家谱宝塔吊线布局
 * @param root 根节点
 * @param gapX 横向单元间距（世界坐标 px）
 * @param gapY 纵向层间距（世界坐标 px）
 * @param collapsedArr 折叠节点 id 数组
 */
export function runLayout(
  root: FamilyNode,
  gapX: number,
  gapY: number,
  collapsedArr: string[]
): LayoutResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0

  const collapsed: Record<string, boolean> = {}
  for (let i = 0; i < collapsedArr.length; i++) collapsed[collapsedArr[i]] = true

  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  let maxDepth = 0

  // 单元间统一接缝（世界 px），最小 8
  const GAP = Math.max(8, Math.round(gapX * 0.25))
  const GAPU = GAP / gapX

  /** 测量子树宽度（以 gapX 为单位） */
  function measure(n: FamilyNode, depth: number): number {
    let w: number
    const kids = n.children || []
    if (kids.length && !collapsed[n.id]) {
      let s = 0
      for (let j = 0; j < kids.length; j++) {
        s += measure(kids[j], depth + 1)
      }
      // 子树总宽 = 子单元宽之和 + 兄弟间接缝（count-1 个）
      w = s + (kids.length - 1) * GAPU
    } else {
      // 叶子：家庭单元块宽（贴合内容）
      w = famWidth(n, gapX) / gapX
    }
    if (depth > maxDepth) maxDepth = depth
    ;(n as FamilyNode & { _w: number })._w = w
    return w
  }

  /** 递归分配坐标 + 生成节点与连线 */
  function assign(
    n: FamilyNode,
    depth: number,
    x0: number,
    rank: string | null
  ): { x: number; y: number; id: string } {
    const y = BASE_Y + depth * gapY
    const hasKids = !!(n.children && n.children.length)
    const isCol = !!collapsed[n.id]

    const chs: { x: number; y: number; id: string }[] = []
    let cur = x0
    let mCnt = 0
    let fCnt = 0

    if (hasKids && !isCol) {
      const kids = n.children || []
      for (let j = 0; j < kids.length; j++) {
        const c = kids[j]
        const ir = c.gender === 'm' ? ++mCnt : ++fCnt
        chs.push(assign(c, depth + 1, cur, rankLabel(c.gender, ir)))
        cur += (c as FamilyNode & { _w: number })._w * gapX
        if (j < kids.length - 1) cur += GAP
      }
    }

    // 父节点 x = 直接子节点中心 x 的平均（父卡/吊线/子群三线对齐）
    let x: number
    if (chs.length) {
      let s = 0
      for (let m = 0; m < chs.length; m++) s += chs[m].x
      x = s / chs.length
    } else {
      x = x0 + HW // 叶子卡左锚定
    }

    nodes.push({
      id: n.id,
      name: n.name,
      spouse: n.spouse || null,
      x,
      y,
      depth,
      hasChildren: hasKids,
      collapsed: isCol,
      rank: rank || null,
      inherit: n.inherit || null
    })

    if (chs.length) {
      // 横梁位于父卡底下方一段距离
      const mid = y + HALF + 16
      for (let m = 0; m < chs.length; m++) {
        const cd = chs[m]
        edges.push({
          parentId: n.id,
          childId: cd.id,
          d:
            'M ' + x + ' ' + (y + HALF) +
            ' L ' + x + ' ' + mid +
            ' L ' + cd.x + ' ' + mid +
            ' L ' + cd.x + ' ' + (cd.y - HALF),
          xmin: Math.min(x, cd.x),
          xmax: Math.max(x, cd.x),
          ymin: y + HALF,
          ymax: cd.y - HALF
        })
      }
    }
    return { x, y, id: n.id }
  }

  measure(root, 0)
  assign(root, 0, 0, null)

  // 布局真实最右边界：按各叶子块右缘取最大
  let breadth = 0
  for (let bi = 0; bi < nodes.length; bi++) {
    const nd = nodes[bi]
    if (!nd.hasChildren) {
      const right = nd.x - HW + famWidth(nd as unknown as FamilyNode, gapX)
      if (right > breadth) breadth = right
    }
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : 0
  return {
    nodes,
    edges,
    width: Math.max((root as FamilyNode & { _w: number })._w * gapX, breadth) + H_MARGIN,
    height: maxDepth * gapY + 140,
    elapsed: t1 - t0
  }
}