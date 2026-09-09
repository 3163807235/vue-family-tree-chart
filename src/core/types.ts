// 家谱宝塔吊线图核心类型定义（无框架依赖，可在任意环境复用）

/** 性别：m=男，f=女 */
export type Gender = 'm' | 'f'

/**
 * 家谱节点数据结构（树形）
 * - children 数组顺序即长幼顺序（长子在前，居左）
 * - spouse 为配偶姓名数组，元素个数即配偶任数
 * - inherit 为承继标签词（过继/承继/兼祧等），无则 null
 */
export interface FamilyNode {
  /** 节点唯一 id（用于折叠集合、点击回调） */
  id: string
  /** 姓名 */
  name: string
  /** 性别 */
  gender: Gender
  /** 配偶姓名数组；空数组或 null 表示无配偶 */
  spouse?: string[] | null
  /** 承继标签词，无则 null */
  inherit?: string | null
  /** 子节点数组（顺序即长幼顺序） */
  children?: FamilyNode[]
}

/** 布局后节点坐标信息（含原数据快照） */
export interface LayoutNode {
  id: string
  name: string
  spouse: string[] | null
  /** 节点中心 x（世界坐标） */
  x: number
  /** 节点中心 y（世界坐标） */
  y: number
  /** 辈分深度（根=0） */
  depth: number
  /** 是否拥有子节点（影响折叠交互） */
  hasChildren: boolean
  /** 是否处于折叠态 */
  collapsed: boolean
  /** 排行标签（长子/次子…），无则 null */
  rank: string | null
  /** 承继标签词，无则 null */
  inherit: string | null
}

/** 布局后连线信息（含可见区间二分用边界） */
export interface LayoutEdge {
  /** 源节点 id（父辈，靠上） */
  parentId: string
  /** 目标节点 id（子辈，靠下） */
  childId: string
  /** SVG path 的 d 属性 */
  d: string
  xmin: number
  xmax: number
  ymin: number
  ymax: number
}

/** 布局引擎输出 */
export interface LayoutResult {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
  /** 布局耗时（ms） */
  elapsed: number
}

/** 视口（SVG viewBox 状态） */
export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** 文字样式 */
export interface TextStyle {
  /** 字号 */
  size: number
  /** 颜色 */
  color: string
  /** 字体族，'' 表示随系统默认 */
  font?: string
}

/** 性能指标（每帧/每次布局后 emit） */
export interface PerfMetrics {
  layoutMs: number | null
  renderMs: number | null
  visibleCount: number
  domCount: number
  textDegraded: boolean
  total: number
}

/** 排版方向 */
export type Direction = 'ltr' | 'rtl'

/** Worker 布局输入消息 */
export interface LayoutInput {
  type: 'layout'
  root: FamilyNode
  gapX: number
  gapY: number
  collapsed: string[]
}

/** Worker 布局输出消息 */
export interface LayoutOutput {
  type: 'layoutDone'
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
  elapsed: number
}

/** Worker 错误消息 */
export interface LayoutError {
  type: 'error'
  message: string
}

/** Worker ping/pong 探测消息 */
export interface PingMessage { type: 'ping' }
export interface PongMessage { type: 'pong' }

export type WorkerInbound = LayoutInput | PingMessage
export type WorkerOutbound = LayoutOutput | LayoutError | PongMessage