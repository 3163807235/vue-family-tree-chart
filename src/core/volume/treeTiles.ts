// 世系图分幅（树幅切片）：一棵大树超出单叶容幅时，按「代」纵切、按「宽」横切，
// 一叶一幅续排；相邻幅重叠若干代（骑缝），便于上下幅对照衔接。
//
// 算法：
// 1. 先以 runLayout 一次性完成全树布局（世界坐标）；
// 2. 纵切：按 depth 分带，每带至多 maxDepthPerTile 代；
// 3. 横切：带内包围盒超过 maxTileWidth 时等宽再切若干列；
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

/** 节点文字横向半宽估算（含配偶列，用于包围盒与留白） */
function nodeHalfW(n: LayoutNode, mainSize: number, auxSize: number): number {
  const nameW = Array.from(n.name).length * mainSize * 0.62
  const spouseW = n.spouse?.length
    ? Math.max(...n.spouse.map(s => Array.from(s).length)) * auxSize * 0.62 + mainSize * 0.8
    : 0
  return Math.max(20, Math.max(nameW, spouseW) / 2)
}

/** 节点文字纵向半高估算 */
const nodeHalfH = (mainSize: number): number => mainSize * 0.62

/**
 * 将整树切成一幅幅可单叶排版的树幅
 * @param root 世系根节点
 * @param options 分幅参数
 */
export function sliceTree(root: FamilyNode, options: TreeTileOptions = {}): TreeSliceResult {
  const maxDepthPerTile = Math.max(1, options.maxDepthPerTile ?? 4)
  const maxTileWidth = Math.max(1, options.maxTileWidth ?? 900)
  const overlapDepth = Math.max(0, options.overlapDepth ?? 1)
  const padding = options.padding ?? 40
  const gapX = options.gapX ?? 56
  const gapY = options.gapY ?? 76
  const mainSize = options.mainSize ?? 26
  const auxSize = options.auxSize ?? 20

  const layout = runLayout(root, gapX, gapY, [], mainSize, auxSize)
  const all = layout.nodes
  if (!all.length) return { layout, tiles: [] }

  let minDepth = Infinity
  let maxDepth = -Infinity
  for (const n of all) {
    if (n.depth < minDepth) minDepth = n.depth
    if (n.depth > maxDepth) maxDepth = n.depth
  }

  const tileNodes: { nodes: LayoutNode[]; overlapIds: string[] }[] = []
  let bandStart = minDepth
  let prevBandEnd = minDepth - 1

  while (bandStart <= maxDepth) {
    const bandEnd = Math.min(bandStart + maxDepthPerTile - 1, maxDepth)
    const inBand = all.filter(n => n.depth >= bandStart && n.depth <= bandEnd)

    let bandMinX = Infinity
    let bandMaxX = -Infinity
    for (const n of inBand) {
      bandMinX = Math.min(bandMinX, n.x - nodeHalfW(n, mainSize, auxSize))
      bandMaxX = Math.max(bandMaxX, n.x + nodeHalfW(n, mainSize, auxSize))
    }
    if (!inBand.length) {
      bandMinX = 0
      bandMaxX = 0
    }

    const bandW = Math.max(1, bandMaxX - bandMinX)
    const cols = Math.max(1, Math.ceil(bandW / maxTileWidth))

    for (let c = 0; c < cols; c++) {
      const cMinX = bandMinX + (bandW * c) / cols
      const cMaxX = bandMinX + (bandW * (c + 1)) / cols
      // 节点按中心 x 归列；末列兜底收入右缘节点
      const picked = inBand.filter(
        n => n.x >= cMinX && (c === cols - 1 ? n.x <= cMaxX : n.x < cMaxX)
      )
      const overlapIds = picked
        .filter(n => n.depth <= prevBandEnd)
        .map(n => n.id)
      tileNodes.push({ nodes: picked, overlapIds })
    }

    if (bandEnd >= maxDepth) break
    const nextStart = Math.max(bandStart + 1, bandEnd - overlapDepth + 1)
    prevBandEnd = bandEnd
    bandStart = nextStart
  }

  const tiles: TreeTile[] = tileNodes.map((t, i) => {
    const ids = new Set(t.nodes.map(n => n.id))
    const edges: LayoutEdge[] = layout.edges.filter(e => ids.has(e.childId))

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const n of t.nodes) {
      const hw = nodeHalfW(n, mainSize, auxSize)
      const hh = nodeHalfH(mainSize)
      minX = Math.min(minX, n.x - hw)
      maxX = Math.max(maxX, n.x + hw)
      minY = Math.min(minY, n.y - hh)
      maxY = Math.max(maxY, n.y + hh)
    }
    if (!t.nodes.length) {
      minX = 0
      maxX = 1
      minY = 0
      maxY = 1
    }

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
      mainSize
    }
  })

  return { layout, tiles }
}
