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
  /** 生平传文（牒记式谱书用，竖排小字），无则 null */
  bio?: string | null
  /** 字（如孔明），无则 null */
  courtesyName?: string | null
  /** 号（如卧龙），无则 null */
  hao?: string | null
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
  /** 下吊线顶点相对锚点 y 的向下偏移（本地坐标，默认=卡底 24；内容超出时自适应更下），
   *  折叠/展开按钮据此定位，保证按钮与吊线顶点同源同步 */
  dropY?: number
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
  /** 内容真实包围盒（根锚定 x=0，minX 可为负），供 fitView 取景居中 */
  minX: number
  maxX: number
  minY: number
  maxY: number
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

/**
 * 配偶辅助文字显示模式：
 * - 'full'：完整姓名（默认，数据原样展示）
 * - 'surname'：某氏格式（取姓氏首字 + "氏"，如 "王芳" → "王氏"）
 * 数据始终以完整姓名存储，切换仅影响展示，不影响 LayoutNode.spouse 原值
 */
export type SpouseFormat = 'full' | 'surname'

/** Worker 布局输入消息 */
export interface LayoutInput {
  type: 'layout'
  root: FamilyNode
  gapX: number
  gapY: number
  collapsed: string[]
  /** 主字号（用于测量节点内容高度，自适应吊线起点） */
  mainSize?: number
  /** 辅字号（用于测量配偶列宽度，自适应列间距） */
  auxSize?: number
}

/** Worker 布局输出消息 */
export interface LayoutOutput {
  type: 'layoutDone'
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
  /** 内容真实包围盒（根锚定 x=0，minX 可为负） */
  minX: number
  maxX: number
  minY: number
  maxY: number
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

// ============ 谱牒式（FamilyTreeBook）排版类型 ============

/** 竖排字符布局单元 */
export interface VerticalChar {
  /** 字符 */
  ch: string
  /** 字符中心 x（页坐标，左→右） */
  x: number
  /** 字符中心 y（页坐标，上→下） */
  y: number
}

/** 谱书页中单个人物的排版结果 */
export interface BookPerson {
  id: string
  name: string
  gender: Gender
  spouse: string[] | null
  bio: string | null
  courtesyName: string | null
  hao: string | null
  generation: number
  genLabel: string
  rank: string | null
  inherit: string | null
  /** 父子关系标签，如"朝化之子"；始祖为 null */
  parentLabel: string | null
  /** 父名裸文本（上格右列用），如"廷苏"；始祖为 null */
  parentName: string | null
  /** 所在半叶：right=版心右侧（始祖所在），left=版心左侧 */
  half: 'right' | 'left'
  /** 是否为跨页续传栏（本栏传文承接前页同一人物） */
  isContinuation: boolean
  /** 本栏传文是否未尽、下一页还有续传 */
  continuesNext: boolean
  x: number
  y: number
  width: number
  height: number
  /** 上格竖排字符：父名在上、排行在下连写一列（始祖、续传栏为空数组） */
  labelChars: VerticalChar[]
  nameChars: VerticalChar[]
  /** 中格姓名下方小字标记（续传栏为"续"，余为空数组） */
  contMarkChars: VerticalChar[]
  bioChars: VerticalChar[]
}

/** 世代标签栏（"始祖"/"第二世"……独占一列，大字竖排于整列上下中央；
 *  位于每代第一人之右（前），列内不画横格线、两缘竖界行保留 */
export interface BookGenLabel {
  generation: number
  /** 标签文字，如"始祖""第二世" */
  text: string
  /** 所在半叶：right=版心右侧，left=版心左侧 */
  half: 'right' | 'left'
  x: number
  y: number
  width: number
  height: number
  /** 竖排字符（x=列中轴，y 整列上下居中） */
  chars: VerticalChar[]
}

/** 谱书单页 */
export interface BookPage {
  pageIndex: number
  /** 页码（中文数字，如"三"） */
  pageNumber: string
  width: number
  height: number
  /** 版框（边栏）几何：正文四周双边线围成的区域 */
  frame: BookRect
  /** 版心（书口/版口）几何：书页正中鱼尾、书名、叶码所在的竖条 */
  spine: BookSpine
  /** 固定界格格缘 x 坐标（每半叶十格等宽、格缘贯穿版框上下，留白格亦有界格，含版心两界） */
  columnLines: number[]
  /** 栏内横格线 y 坐标（标签格底、姓名格底），全页统一，渲染时按每人物条目画段线 */
  rowLines: number[]
  /** 本页右半叶最右格是否为书眉格（仅首页为 true：书眉是章节标题，只在开头出现一次；
   *  后续页该格释放为正常人物轨，右半叶由九轨增至十轨） */
  hasHeader: boolean
  people: BookPerson[]
  /** 本页各世代标签栏（每代第一人之右独占一列，大字竖排、无横格线） */
  genLabels: BookGenLabel[]
}

/** 矩形区域 */
export interface BookRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** 装订类型：none 不显示 / staple 骑马钉（对折线上 2 钉点）/ sewing 锁线装订（一排槽孔+装订线）/ perfect 胶装（无装订线） */
export type BindingType = 'none' | 'staple' | 'sewing' | 'perfect'

/** 版心几何 */
export interface BookSpine {
  /** 版心中线 x（书口折线、象鼻所在） */
  centerX: number
  /** 版心竖条左缘 */
  left: number
  /** 版心竖条右缘 */
  right: number
  width: number
  /** 上鱼尾中心 y */
  upperTailY: number
  /** 下鱼尾中心 y */
  lowerTailY: number
  /** 装订线渲染数据（可选：未配置装订时为 null） */
  binding?: {
    type: BindingType
    /** 装订线 x 坐标数组（px）：作用于纸张本身，锚定纸张物理边缘。
     *  lineXs[0] = offsetMm×MM（左纸边向内）；
     *  lineXs[1] = pageWidth − offsetMm×MM（右纸边向内）。
     *  offset=0 时与纸张物理边缘精准重合；对折后两线在书脊处重合。 */
    lineXs: number[]
    /** 原始 mm 输入（装订线距纸张边缘向内的距离，0~15mm） */
    offsetMm: number
    /** 骑马钉钉点 y 坐标数组（staple 时） */
    stapleY?: number[]
    /** 锁线槽孔 y 坐标数组（sewing 时） */
    sewingY?: number[]
  }
}

/** 谱牒式排版输出 */
export interface BookLayoutResult {
  pages: BookPage[]
  total: number
  elapsed: number
}

/** 谱牒式排版参数 */
export interface BookLayoutOptions {
  pageWidth?: number
  pageHeight?: number
  /** 左右边距（版框距纸边） */
  margin?: number
  /** 天头：版框上沿距纸顶（古籍天头大于地脚，留眉批） */
  topMargin?: number
  /** 地脚：版框下沿距纸底 */
  bottomMargin?: number
  nameSize?: number
  bioSize?: number
  /** 传文行距倍数（竖排换行时竖行间的左右间距），默认 1.15 */
  bioLineSpacing?: number
  /** @deprecated 已不生效：半叶十格自版框外缘至版心严格等分（书眉格即最右一格），格宽不再可配 */
  gridColWidth?: number
  /** 版心（书口）竖条宽度 */
  spineWidth?: number
  /** 装订类型，默认 'none' */
  bindingType?: BindingType
  /** 装订线离书脊中心的偏移（mm）；正数偏右、负数偏左；物理装订可行范围 ±15mm；默认 0（对折线上） */
  bindingOffset?: number
  /** 骑马钉数量（2–5），默认 2 */
  stapleCount?: number
  /** 锁线槽孔数量（3–12），默认 6 */
  sewingHoles?: number
}