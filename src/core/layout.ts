// 家谱宝塔吊线布局纯函数（无 DOM、无框架依赖，可在 Worker/主线程通用）
import type { FamilyNode, LayoutNode, LayoutEdge, LayoutResult } from './types'

/** 卡半宽（与渲染端一致） */
const HW = 16
/** 卡半高（与渲染端 HH=24 一致，避免吊线穿卡） */
const HALF = 24
/** 默认吊线起点：节点卡片下缘（内容未超出卡片时使用） */
const DEFAULT_DROP = HALF
/**
 * 文字内容区与上/下连接线之间的统一垂直净距（px）。
 * 上：首字上沿距卡顶（=上吊线）恒为 PADDING_V；
 * 下：末字下沿距下吊线起点恒为 PADDING_V（文字未超卡时吊线落在卡底，间距≥PADDING_V）。
 * 该常量在 layout、DefaultNode 两端保持一致，作为唯一可维护的边距来源。
 */
const PADDING_V = 4
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

/** 首字纵向锚点：nameOrigin = PADDING_V + size/2，使首字上沿恒等于「卡顶 + PADDING_V」，
 *  即文字与上连接线间距恒为 PADDING_V，不随字号变化 */
function nameOrigin(mainSize: number): number {
  return PADDING_V + Math.round(mainSize / 1.05)
}

/** 对吊线路径字符串做水平平移：仅平移 M/L 后的 x 坐标，y 保持不变 */
function shiftPath(d: string, dx: number): string {
  const t = d.split(/\s+/)
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'M' || t[i] === 'L') {
      t[i + 1] = String(+t[i + 1] + dx)
    }
  }
  return t.join(' ')
}

/**
 * 节点内容底部（相对锚点，向下为正）：
 * 公式与渲染端 DefaultNode.vue 的竖排姓名保持一致——
 * 首字中心位于 -HALF+nameOrigin，行距 = round(mainSize*1.05)，字高 ≈ mainSize。
 * 用于让吊线起点随节点实际内容高度自适应。
 */
function nodeContentBottom(n: FamilyNode, mainSize: number): number {
  const lineH = Math.round(mainSize * 1.05)
  const len = Math.max(0, (n.name || '').length - 1)
  return -HALF + nameOrigin(mainSize) + len * lineH + mainSize / 2
}

/**
 * 执行家谱宝塔吊线布局
 * @param root 根节点
 * @param gapX 横向单元间距（世界坐标 px）
 * @param gapY 纵向层间距（世界坐标 px）
 * @param collapsedArr 折叠节点 id 数组
 * @param mainSize 主字号（用于测量节点内容高度，默认 12，与渲染端一致）
 */
export function runLayout(
  root: FamilyNode,
  gapX: number,
  gapY: number,
  collapsedArr: string[],
  mainSize = 12
): LayoutResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0

  const collapsed: Record<string, boolean> = {}
  for (let i = 0; i < collapsedArr.length; i++) collapsed[collapsedArr[i]] = true

  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  let maxDepth = 0
  // 每层（depth）所有节点的最大内容底部（向下为正，绝对锚点偏移），
  // 用于决定下一层顶部的 y，实现"父节点层与子节点层间距"的真实联动调整
  const layerBottom: number[] = []

  // 单元间统一接缝（世界 px），最小 8
  const GAP = Math.max(8, Math.round(gapX * 0.25))
  const GAPU = GAP / gapX

  /** 测量子树宽度（以 gapX 为单位） */
  function measure(n: FamilyNode, depth: number): number {
    // 收集本层最大内容底部：默认取卡片下缘，超出则取实际内容底部 + 间距
    const cb = Math.max(DEFAULT_DROP, nodeContentBottom(n, mainSize) + PADDING_V)
    if (layerBottom[depth] === undefined) layerBottom[depth] = cb
    else if (cb > layerBottom[depth]) layerBottom[depth] = cb

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
    // 层 y 由上一层内容下缘 + 层间距累积而来；gapY 即"父节点层与子节点层"的上下净空
    const y = layerY[depth]
    const hasKids = !!(n.children && n.children.length)
    const isCol = !!collapsed[n.id]

    const chs: { x: number; y: number; id: string; dropIn: number }[] = []
    let cur = x0
    let mCnt = 0
    let fCnt = 0

    if (hasKids && !isCol) {
      const kids = n.children || []
      for (let j = 0; j < kids.length; j++) {
        const c = kids[j]
        const ir = c.gender === 'm' ? ++mCnt : ++fCnt
        const res = assign(c, depth + 1, cur, rankLabel(c.gender, ir))
        // 上吊线进入点恒为节点卡顶 DEFAULT_DROP：
        // 首字锚点已由 nameOrigin 随字号下移、文字顶部恒定在卡内不再上溢，
        // 故无需再随字号调整，确保吊线在不同字号下都稳定连接节点顶部、不偏移
        chs.push({ x: res.x, y: res.y, id: res.id, dropIn: DEFAULT_DROP })
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

    // 下吊线顶点偏移（本地坐标，节点中央）：默认卡底；内容超出时随内容底部自适应。
    // 作为单一来源同时驱动吊线绘制与该节点的折叠/展开按钮定位，保证两者严格同步。
    const thisDrop = Math.max(DEFAULT_DROP, nodeContentBottom(n, mainSize) + PADDING_V)

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
      inherit: n.inherit || null,
      dropY: thisDrop
    })

    if (chs.length) {
      // 吊线起点（下）= thisDrop
      const dropY = thisDrop
      // 横梁位于吊线起点下方一段距离
      const mid = y + dropY + 16
      for (let m = 0; m < chs.length; m++) {
        const cd = chs[m]
        edges.push({
          parentId: n.id,
          childId: cd.id,
          d:
            'M ' + x + ' ' + (y + dropY) +
            ' L ' + x + ' ' + mid +
            ' L ' + cd.x + ' ' + mid +
            ' L ' + cd.x + ' ' + (cd.y - cd.dropIn),
          xmin: Math.min(x, cd.x),
          xmax: Math.max(x, cd.x),
          ymin: y + dropY,
          ymax: cd.y - cd.dropIn
        })
      }
    }
    return { x, y, id: n.id }
  }

  measure(root, 0)

  // 预计算每层顶部 y：根层从 BASE_Y 起，之后每层 = 上一层内容下缘 + 层间距 gapY
  const layerY: number[] = [BASE_Y]
  for (let d = 1; d <= maxDepth; d++) {
    layerY[d] = layerY[d - 1] + (layerBottom[d - 1] ?? DEFAULT_DROP) + gapY
  }

  assign(root, 0, 0, null)

  // 以「始祖」为水平基准线：整体平移到始祖中心 = 0。
  // 此后所有间距调节都会让子树以该中心线向两侧对称式延展，始祖位置恒定不漂移。
  const rootNode = nodes.find((n) => n.depth === 0)
  if (rootNode && rootNode.x !== 0) {
    const dx = -rootNode.x
    for (const n of nodes) n.x += dx
    for (const e of edges) {
      e.xmin += dx
      e.xmax += dx
      e.d = shiftPath(e.d, dx)
    }
  }

  // 布局真实最右/最左边界（平移到始祖居中后两侧可能为负），宽度按左右跨度取
  let minX = Infinity
  let maxX = -Infinity
  for (let bi = 0; bi < nodes.length; bi++) {
    const nd = nodes[bi]
    if (!nd.hasChildren) {
      const left = nd.x - HW
      const right = nd.x - HW + famWidth(nd as unknown as FamilyNode, gapX)
      if (left < minX) minX = left
      if (right > maxX) maxX = right
    }
  }
  if (minX > maxX) { minX = 0; maxX = 0 }

  const t1 = typeof performance !== 'undefined' ? performance.now() : 0
  return {
    nodes,
    edges,
    width: (maxX - minX) + H_MARGIN * 2,
    height: layerY[maxDepth] + (layerBottom[maxDepth] ?? DEFAULT_DROP) + 140,
    elapsed: t1 - t0
  }
}