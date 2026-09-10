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

  // 兄弟节点之间的水平「净间隙」（卡片边缘到卡片边缘），直接由 gapX 1:1 控制。
  // 紧凑宝塔树：叶子只占其卡片实际宽度 famWidth（窄），不虚占一整列；
  // 内部节点占「子节点宽度之和 + 兄弟净间隙」，父节点居中于子群中点。
  // 因此无子节点（叶子/折叠）不会撑大同级布局，只有真正有子孙的分支才占子树宽度。
  const GAP = gapX

  /** 仅做纵向信息采集：每层最大内容底部 + 最大深度（供 layerY 计算，不涉及横坐标） */
  function measureDepth(n: FamilyNode, depth: number): void {
    const cb = Math.max(DEFAULT_DROP, nodeContentBottom(n, mainSize) + PADDING_V)
    if (layerBottom[depth] === undefined) layerBottom[depth] = cb
    else if (cb > layerBottom[depth]) layerBottom[depth] = cb
    if (depth > maxDepth) maxDepth = depth
    const kids = n.children || []
    if (kids.length && !collapsed[n.id]) {
      for (let j = 0; j < kids.length; j++) measureDepth(kids[j], depth + 1)
    }
  }

  // 一个直接子是否构成「有子嗣的房」（有子且未被折叠）；无后叶子 / 已折叠节点不算
  const isBranchKid = (c: FamilyNode): boolean =>
    !!(c.children && c.children.length) && !collapsed[c.id]

  // 每个（参与布局的）节点相对其父根的水平偏移；第二遍 DFS 累加为绝对 x
  const relXById = new Map<string, number>()
  // 每个父节点实际排布的直接子 id（折叠后被收起的子不在内），供第二遍生成连线
  const childIdsByParent = new Map<string, string[]>()

  /**
   * 递归紧凑排版（Reingold-Tilford 轮廓避让），坐标全部以「本节点根 x=0」为原点。
   * 关键不变量（全链路统一）：
   *  - 只在「同一相对层」上比较相邻兄弟子树的左右轮廓做最小平移避让，
   *    不同行（不同深度）的节点水平上可重叠而不碰撞（它们 y 行错开）；
   *  - 叶子/折叠节点只有第 0 层轮廓（卡片自身宽 famWidth），因此不会为下一行的
   *    侄儿侄女空出位置，也不会虚撑兄弟间距；
   *  - 父节点居中于「首个直接子 ~ 末个直接子」的中点。
   * @returns L[k]/R[k] 本子树在相对深度 k 上相对本根的最左/最右卡片边缘
   */
  function assign(
    n: FamilyNode,
    depth: number,
    rank: string | null
  ): { L: number[]; R: number[] } {
    const hasKids = !!(n.children && n.children.length)
    const isCol = !!collapsed[n.id]

    // 先登记节点（x 占位为 0，第二遍按 relX 累加绝对坐标）
    const thisDrop = Math.max(DEFAULT_DROP, nodeContentBottom(n, mainSize) + PADDING_V)
    nodes.push({
      id: n.id,
      name: n.name,
      spouse: n.spouse || null,
      x: 0,
      y: layerY[depth],
      depth,
      hasChildren: hasKids,
      collapsed: isCol,
      rank: rank || null,
      inherit: n.inherit || null,
      dropY: thisDrop
    })

    const selfW = famWidth(n, gapX)
    // 本节点轮廓：相对深度 0 即卡片自身（左缘 -HW，右缘 -HW+selfW）
    const L: number[] = [-HW]
    const R: number[] = [-HW + selfW]

    if (!(hasKids && !isCol)) return { L, R }

    const kids = n.children || []
    // 排行标签按原始子序
    const rankOf = new Map<string, string>()
    let mCnt = 0
    let fCnt = 0
    for (let j = 0; j < kids.length; j++) {
      const c = kids[j]
      const ir = c.gender === 'm' ? ++mCnt : ++fCnt
      rankOf.set(c.id, rankLabel(c.gender, ir))
    }

    // 逐个合并直接子的子树：gl/gr 为已合并子树群在「相对本父深度」上的轮廓（层 1 起）
    const gl: number[] = []
    const gr: number[] = []
    const shifts: number[] = []
    const childIds: string[] = []
    for (let j = 0; j < kids.length; j++) {
      const c = kids[j]
      const sub = assign(c, depth + 1, rankOf.get(c.id) || null)
      childIds.push(c.id)

      let s: number
      if (j === 0) {
        s = 0
      } else {
        s = -Infinity
        // 仅在两棵子树都有节点的相对层上要求 左树右缘 + GAP ≤ 右树左缘
        for (let k = 0; k < sub.L.length; k++) {
          const pr = gr[1 + k]
          if (pr !== undefined) {
            const need = pr - sub.L[k] + GAP
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
    childIdsByParent.set(n.id, childIds)

    // 父节点居中：以「有子嗣（未折叠）的房」首末为基准，使各房围绕父亲对称；
    // 无后的叶子只在其原始子序位置就地贴接（轮廓合并时仅占同层卡宽），
    // 不参与深层避让、也不把父亲中心拉向末端——避免绝后一房把整树拉偏、拉出空档。
    // 若本层全是叶子，则退化为居中于首末叶子。
    let firstIdx = 0
    let lastIdx = kids.length - 1
    let bi = 0
    while (bi < kids.length && !isBranchKid(kids[bi])) bi++
    if (bi < kids.length) {
      firstIdx = bi
      let bj = kids.length - 1
      while (bj >= 0 && !isBranchKid(kids[bj])) bj--
      lastIdx = bj
    }
    const offset = (shifts[firstIdx] + shifts[lastIdx]) / 2
    for (let j = 0; j < kids.length; j++) {
      relXById.set(kids[j].id, shifts[j] - offset)
    }

    // 本子树相对本根（已 offset，使父=0）的轮廓：层 1 起来自子树群
    for (let idx = 1; idx < gl.length; idx++) {
      if (gl[idx] !== undefined) {
        L[idx] = gl[idx] - offset
        R[idx] = gr[idx] - offset
      }
    }
    return { L, R }
  }

  measureDepth(root, 0)

  // 预计算每层顶部 y：根层从 BASE_Y 起，之后每层 = 上一层内容下缘 + 层间距 gapY
  const layerY: number[] = [BASE_Y]
  for (let d = 1; d <= maxDepth; d++) {
    layerY[d] = layerY[d - 1] + (layerBottom[d - 1] ?? DEFAULT_DROP) + gapY
  }

  assign(root, 0, null)

  // 第二遍 DFS：把相对父的水平偏移累加为绝对 x（根节点中心恒为 0，天然为水平锚点）
  const xById = new Map<string, number>()
  ;(function place(n: FamilyNode, ax: number) {
    xById.set(n.id, ax)
    const list = childIdsByParent.get(n.id)
    if (!list) return
    for (const cid of list) {
      const child = (n.children || []).find((k) => k.id === cid)
      if (child) place(child, ax + (relXById.get(cid) || 0))
    }
  })(root, 0)
  for (const nd of nodes) nd.x = xById.get(nd.id) || 0

  const nodeById = new Map(nodes.map((nd) => [nd.id, nd]))

  // 用绝对 x 生成宝塔吊线（父 → 横梁 → 各直接子）
  for (const [pid, cids] of childIdsByParent) {
    const p = nodeById.get(pid)!
    const px = p.x
    const py = p.y
    const dropY = p.dropY ?? DEFAULT_DROP
    const mid = py + dropY + 16
    for (const cid of cids) {
      const cd = nodeById.get(cid)!
      edges.push({
        parentId: pid,
        childId: cid,
        d:
          'M ' + px + ' ' + (py + dropY) +
          ' L ' + px + ' ' + mid +
          ' L ' + cd.x + ' ' + mid +
          ' L ' + cd.x + ' ' + (cd.y - DEFAULT_DROP),
        xmin: Math.min(px, cd.x),
        xmax: Math.max(px, cd.x),
        ymin: py + dropY,
        ymax: cd.y - DEFAULT_DROP
      })
    }
  }

  // 布局真实最右/最左边界（根居中后两侧可能为负），宽度按左右跨度取。
  // 遍历所有节点：叶子按卡片实际宽计入，折叠节点（hasChildren 但被收起）同样按卡宽计入。
  let minX = Infinity
  let maxX = -Infinity
  for (let bi = 0; bi < nodes.length; bi++) {
    const nd = nodes[bi]
    const left = nd.x - HW
    const right = nd.x - HW + famWidth(nd as unknown as FamilyNode, gapX)
    if (left < minX) minX = left
    if (right > maxX) maxX = right
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