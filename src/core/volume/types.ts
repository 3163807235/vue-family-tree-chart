// 家谱成册（Volume）模型类型：传统家谱「卷首—正文—卷末」完整章节体系
//
// 设计要点：
// 1. 章节（ChapterSpec）是最小排版单元，数组顺序即装订顺序；
// 2. 章节语义（ChapterKind）与内容形态（ChapterContent.type）解耦——
//    例如「恩荣录」既可排文字，也可排书影图版；
// 3. 引擎 headless：只产出 VolumePage 数据流，具体绘制由组件层负责；
// 4. 世系录（register）直接复用 runBookLayout，文本类章节走通用竖排分页引擎。
import type {
  FamilyNode,
  BookLayoutOptions,
  BookPage,
  BookRect,
  BookSpine,
  LayoutEdge,
  LayoutNode,
  VerticalChar
} from '../types'

/**
 * 标准章节语义分类（传统家谱核心模块）
 * - cover 封面 / titlePage 扉页 / toc 总目
 * - preface 序（自序、他序、跋） / editorialNotes 凡例
 * - honor 恩荣录（诰命、敕谕、匾额、科举功名）
 * - genPoem 字辈谱（派语、行第诗）
 * - treeDiagram 世系图（宝塔吊线图，总图）
 * - register 世系录（牒记式，逐人条目）
 * - biography 传记（人物小传、行状、墓志）
 * - hall 祠堂（祠堂图、祠记、祠规、祭仪）
 * - tomb 坟茔（坟图、山向、兆域、祭田）
 * - property 族产（祭田、义庄、公产、契约）
 * - literature 艺文（诗赋、楹联、碑记、外编）
 * - postscript 后记 / custom 自定义（附录、勘误、捐资芳名等）
 */
export type ChapterKind =
  | 'cover'
  | 'titlePage'
  | 'toc'
  | 'preface'
  | 'editorialNotes'
  | 'honor'
  | 'genPoem'
  | 'treeDiagram'
  | 'register'
  | 'biography'
  | 'hall'
  | 'property'
  | 'tomb'
  | 'literature'
  | 'postscript'
  | 'custom'

/**
 * 竖排文本块
 * - heading：章名，独占一列、大字整列上下居中
 * - subheading：小节题（如传主姓名、字辈单句），独占一列、起笔低一行
 * - paragraph：正文，自右向左逐列流排，满列换列、满叶换叶
 * - signature：署名，独占一列、起笔低三行（示谦抑）
 */
export interface VerticalTextBlock {
  kind: 'heading' | 'subheading' | 'paragraph' | 'signature'
  text: string
  /**
   * 锚点（可选）：小节题对应的业务标识（传记传主 personId 等），
   * 用于多级总目「节」条目与世系录/人物索引的双向关联
   */
  anchor?: string
}

/** 传记篇目：personId 必须对齐 FamilyNode.id，用于与世系录/世系图双向关联 */
export interface BioEssay {
  personId: string
  /** 传主姓名（同时作为小节题） */
  name: string
  /** 传文（可含换行，落版时并入一列流排） */
  text: string
  /** 撰者署名，如「族孙某某谨撰」 */
  author?: string
}

/**
 * 图版（书影、祠图、坟图、契约照片等）
 * 版式（layout）：
 * - single：独占一叶、图区通版（默认）；
 * - double：双联，左右半叶各排一版（两版合占一叶，适合小幅图成对展示）。
 */
export interface PlateItem {
  id: string
  title: string
  /** 图片地址（data URL / 相对路径 / 绝对路径）；空串时渲染「图版待补」占位 */
  src: string
  caption?: string
  /** 图版类别（祠图/坟图/契据/书影/像赞等），供图版索引与分卷检索 */
  category?: string
  /** 版式：single 通版一叶 / double 双联合一叶，默认 single */
  layout?: 'single' | 'double'
  /** 图区适配：contain 完整入画（默认）/ cover 裁切填满 */
  fit?: 'contain' | 'cover'
  /** 是否画图框，默认 true */
  frame?: boolean
}

/**
 * 世系图分幅参数
 * - maxDepthPerTile：每幅最多代数（按辈分纵切）
 * - maxTileWidth：每幅最大世界宽度（同带内过宽时再横向切分）
 * - overlapDepth：相邻幅重叠代数（骑缝人物，便于上下幅对照）
 */
export interface TreeTileOptions {
  maxDepthPerTile?: number
  maxTileWidth?: number
  overlapDepth?: number
  /** 取景留白（世界单位），默认 40 */
  padding?: number
  /** 布局参数（与 runLayout 一致） */
  gapX?: number
  gapY?: number
  mainSize?: number
  auxSize?: number
}

/** 分幅包围盒（世界坐标，已含留白） */
export interface TreeTileBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 世系图单幅（一叶一幅）：节点与连线的子集 + 取景包围盒 */
export interface TreeTile {
  /** 幅次（自 0 起） */
  tileIndex: number
  /** 幅题，如「第一幅」 */
  label: string
  bounds: TreeTileBounds
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  /** 骑缝人物 id：与上一幅重叠、便于对照的关键节点 */
  overlapIds: string[]
  /** 本幅下方是否还有续幅 */
  continuesNext: boolean
  /** 本幅布局所用主字号（世界单位，渲染时同用此字号） */
  mainSize: number
}

/** 章节小节（多级总目的「节」级条目；explicit 时覆盖自动提取） */
export interface ChapterSection {
  id: string
  title: string
  /** 锚点：传记传主 personId / 图版 plateId / 世代 `gen:N` 等；缺省按标题匹配自动节 */
  anchor?: string
}

/**
 * 章节内容判别联合：按 type 分发渲染器
 */
export type ChapterContent =
  | { type: 'text'; blocks: VerticalTextBlock[] }
  | { type: 'bios'; essays: BioEssay[] }
  | { type: 'plates'; plates: PlateItem[] }
  | { type: 'genPoem'; poem: string; note?: string }
  | { type: 'tree'; root: FamilyNode; note?: string; tiles?: TreeTileOptions }
  | { type: 'register'; root: FamilyNode; options?: BookLayoutOptions }
  | { type: 'cover' }
  | { type: 'titlePage' }
  | { type: 'toc' }
  | { type: 'custom'; payload: unknown }

/** 章节定义 */
export interface ChapterSpec {
  /** 唯一标识（缺省时由 createChapter 用 kind 生成，重名由 createVolumePlan 追加序号） */
  id: string
  kind: ChapterKind
  /** 章名（版心书名、书眉、总目条目均取此值） */
  title: string
  /** 卷次标签，如「卷一」；仅整谱分册装订时按册显式给出，单册缺省不编号、总目不冠卷次 */
  ordinal?: string
  /** 是否收入成册，默认 true */
  enabled?: boolean
  /** 是否每叶都保留书眉格（默认仅章首叶，后续叶该格释放为正文轨） */
  repeatHeader?: boolean
  /**
   * 章节小节（多级总目「节」级条目）：
   * 提供时覆盖自动提取（传记按传主、图版按版、世系录按世代、世系图按幅、文本按小节题）；
   * 锚点匹配到自动节则取其叶码，否则落在本章首叶。
   */
  sections?: ChapterSection[]
  content: ChapterContent
}

/** 版面参数（与 BookLayoutOptions 的几何子集一致，保证同一版框行款） */
export interface VolumePageSetup {
  pageWidth?: number
  pageHeight?: number
  /** 左右边距（版框距纸边） */
  margin?: number
  /** 天头：版框上沿距纸顶 */
  topMargin?: number
  /** 地脚：版框下沿距纸底 */
  bottomMargin?: number
  /** 版心（书口）竖条宽度 */
  spineWidth?: number
  /** 装订类型，默认 'none' */
  bindingType?: import('../types').BindingType
  /** 装订线离书脊中心的偏移（mm）；正数偏右、负数偏左；物理装订可行范围 ±15mm；默认 0 */
  bindingOffset?: number
  /** 骑马钉数量（2–5），默认 2 */
  stapleCount?: number
  /** 锁线槽孔数量（3–12），默认 6 */
  sewingHoles?: number
}

/** 字体与字号参数 */
export interface VolumeFontSetup {
  /** 正文（传文/序跋）字号，默认 18.67（四号） */
  bodySize?: number
  /** 章名字号，默认 34.67（一号） */
  headingSize?: number
  /** 谱名/章名字体族，'' 表示随系统默认 */
  titleFontFamily?: string
  /** 正文字体族，'' 表示随系统默认 */
  bodyFontFamily?: string
}

/** 总目参数 */
export interface TocOptions {
  /** 是否生成总目，默认 true */
  enabled?: boolean
  /** 仅收入指定 kind；缺省收入除封面/扉页/总目外的全部章节 */
  includeKinds?: ChapterKind[]
  /** 收录层级：0=仅卷（章），1=卷+节（默认） */
  maxLevel?: number
}

/** 成册计划（可序列化，便于存库/传输） */
export interface VolumePlan {
  /** 谱名，如「测试宗谱」 */
  title: string
  /** 郡望/堂号，如「汝南堂」 */
  clanName?: string
  /** 版次，如「己亥三修」 */
  edition?: string
  /** 纂修者，如「二十三世孙 某某 主修」 */
  compiler?: string
  /** 纂修年月，如「二〇二六年孟冬」 */
  compileDate?: string
  chapters: ChapterSpec[]
  pageSetup?: VolumePageSetup
  fonts?: VolumeFontSetup
  toc?: TocOptions
  /** 句读（标点）排版样式：enable 控制是否采用古籍句读式紧凑排版，color 控制句读点颜色 */
  punct?: { enable?: boolean; color?: string }
}

/** 解析后的版面参数（全部字段必有值） */
export interface ResolvedPageSetup {
  pageWidth: number
  pageHeight: number
  margin: number
  topMargin: number
  bottomMargin: number
  spineWidth: number
  bindingType: import('../types').BindingType
  bindingOffset: number
  stapleCount: number
  sewingHoles: number
}

/** 解析后的字体参数 */
export interface ResolvedFonts {
  bodySize: number
  headingSize: number
  titleFontFamily: string
  bodyFontFamily: string
}

/** 渲染上下文（内置渲染器与自定义渲染器共用） */
export interface RenderContext {
  plan: VolumePlan
  chapter: ChapterSpec
  setup: ResolvedPageSetup
  fonts: ResolvedFonts
  geometry: VolumeGeometry
  /** 是否启用古籍句读式排版 */
  enablePunct: boolean
}

/** 版框几何（每页相同） */
export interface VolumeGeometry {
  pageWidth: number
  pageHeight: number
  frame: BookRect
  spine: BookSpine
  /** 半叶等分十列的单列宽 */
  colW: number
}

/** 文本页中的一列（一竖行） */
export interface TextColumn {
  half: 'right' | 'left'
  /** 列中轴 x */
  x: number
  /** 本列字号 */
  size: number
  chars: VerticalChar[]
}

/** 文本页中的小节起始标记（多级总目定位用） */
export interface TextSectionMark {
  title: string
  /** 对应 VerticalTextBlock 的索引 */
  blockIndex: number
  /** 业务锚点（传记传主 personId 等） */
  anchor?: string
}

/** 文本页内容（序跋、凡例、传记、艺文等） */
export interface TextPageContent {
  /** 章名（仅章首叶，占最外一列、大字整列居中） */
  heading: { chars: VerticalChar[]; size: number } | null
  columns: TextColumn[]
  /** 本页出现的小节题列 */
  subheadings: { chars: VerticalChar[]; size: number }[]
  /** 署名列 */
  signatures: { chars: VerticalChar[]; size: number }[]
  /** 本页起始处对应的文本块索引（传记定位用） */
  blockStarts: number[]
  /** 本页起始的小节（多级总目「节」条目据此定位叶码） */
  sections: TextSectionMark[]
}

/** 图版落版（一版一叶或双联半叶） */
export interface PlatePlacement {
  plateId: string
  title: string
  src: string
  caption?: string
  category?: string
  /** 版式：single 通版 / double 双联 */
  layout: 'single' | 'double'
  /** 双联时的所在半叶；通版为 null */
  half: 'right' | 'left' | null
  /** 图区适配方式 */
  fit: 'contain' | 'cover'
  /** 是否画图框 */
  frame: boolean
  /** 是否缺图占位（src 为空） */
  placeholder: boolean
  /** 图区（不含书题栏） */
  x: number
  y: number
  width: number
  height: number
  titleChars: VerticalChar[]
  titleSize: number
  captionChars: VerticalChar[]
  captionSize: number
}

/** 封面/扉页内容 */
export interface CoverPageContent {
  mode: 'cover' | 'titlePage'
  titleChars: VerticalChar[]
  titleSize: number
  clanChars: VerticalChar[]
  clanSize: number
  /** 版次、纂修、年月等小字列（自右向左） */
  metaCols: VerticalChar[][]
  metaSize: number
}

/** 总目条目落版（二十格版式：一格一条目，标题在上、页码在下、虚线相接） */
export interface TocRenderedEntry {
  /** 条目唯一标识（卷用章节 id，节用 `章节id#序号`） */
  entryId: string
  chapterId: string
  title: string
  ordinal: string
  leafNumber: string
  /** 该条目所指叶序（点击跳转用） */
  leafIndex: number
  /** 层级：0=卷（章）、1=节 */
  level: number
  /** 标题（含卷次）竖排字，置于格子上部 */
  chars: VerticalChar[]
  /** 页码竖排字，置于格子底部 */
  pageNoChars: VerticalChar[]
  /** 标题与页码之间的竖直虚线引导（无空隙时为 null） */
  leader: { x: number; y1: number; y2: number } | null
  /** 条目字号 */
  size: number
  x: number
}

/** 总目页内容 */
export interface TocPageContent {
  heading: { chars: VerticalChar[]; size: number } | null
  entries: TocRenderedEntry[]
}

/** 成册单叶（一张 A3 横版筒子页＝两个半叶） */
export interface VolumePage {
  /** 全书叶序（自 0 起，含封面/扉页，用于跳转定位） */
  leafIndex: number
  /** 叶码（中文数字）；封面/扉页等前置页为空串（书衣不编叶） */
  leafNumber: string
  /** 左半叶页码（背面，偶数页，中文数字）；前置页为空串 */
  pageNumberLeft: string
  /** 右半叶页码（正面，奇数页，中文数字）；前置页为空串 */
  pageNumberRight: string
  chapterId: string
  chapterKind: ChapterKind
  chapterTitle: string
  /** 是否本章首叶 */
  isChapterStart: boolean
  /** 书眉（排于天头），前置页为 null */
  runningTitle: string | null
  /** 版面几何 */
  frame: BookRect
  spine: BookSpine
  /** 纸张物理宽度（px，筒子页展平全宽） */
  pageWidth: number
  /** 纸张物理高度（px）；天地 margin 可不对称，不可由 frame 反推 */
  pageHeight: number
  /** 本页竖界行 x 坐标（已剔除与版框外缘重合点、合并格内部点） */
  gridXs: number[]
  /** 世系录页：直接复用 runBookLayout 的结果 */
  register?: BookPage
  /** 世系图页：单幅分切结果，组件据此绘制 */
  tree?: TreeTile
  text?: TextPageContent
  plates?: PlatePlacement[]
  cover?: CoverPageContent
  toc?: TocPageContent
}

/** 尚未编叶码的原始页（两遍法第一遍产出；页面物理尺寸在第二遍统一注入） */
export type RawPage = Omit<VolumePage, 'leafIndex' | 'leafNumber' | 'pageNumberLeft' | 'pageNumberRight' | 'pageWidth' | 'pageHeight'>

/** 总目条目（卷级指向章节首叶，节级指向小节首叶） */
export interface TocEntry {
  /** 条目唯一标识：卷=chapterId，节=`chapterId#n` */
  entryId: string
  chapterId: string
  kind: ChapterKind
  title: string
  ordinal: string
  /** 条目所指叶序 */
  leafIndex: number
  /** 条目所指叶码（前置页为空串） */
  leafNumber: string
  /** 层级：0=卷（章）、1=节 */
  level: number
  /** 所属卷的 chapterId；卷自身为 null */
  parentId: string | null
  /** 缩进（竖排行数）：卷 0、节 2 */
  indent: number
}

/** 多级总目树（卷 → 节） */
export interface TocNode {
  entry: TocEntry
  children: TocNode[]
}

/** 图版索引条目（图版管理的版次检索） */
export interface PlateIndexEntry {
  plateId: string
  title: string
  category?: string
  chapterId: string
  leafIndex: number
  leafNumber: string
  layout: 'single' | 'double'
  /** 是否缺图占位 */
  placeholder: boolean
}

/** 章节占用叶区间 */
export interface ChapterSpan {
  chapterId: string
  kind: ChapterKind
  title: string
  ordinal: string
  /** 首叶叶序 */
  startLeaf: number
  /** 末叶叶序 */
  endLeaf: number
  leafCount: number
}

/** 人物三向关联索引：世系录叶码 / 传记叶码 / 世系图叶码 */
export interface PersonIndexEntry {
  personId: string
  name: string
  /** 世系录所在叶码（中文数字），无则 null */
  registerLeaf: string | null
  /** 传记所在叶码，无则 null */
  bioLeaf: string | null
  /** 世系图所在叶码，无则 null */
  treeLeaf: string | null
}

/** 成册结果 */
export interface VolumeResult {
  pages: VolumePage[]
  /** 全书总叶数（含前置页） */
  totalLeaves: number
  /** 总目条目（扁平序列，含卷与节） */
  toc: TocEntry[]
  /** 多级总目树（卷 → 节） */
  tocTree: TocNode[]
  /** 图版索引（按章节顺序、版序） */
  plateIndex: PlateIndexEntry[]
  /** 各章叶区间 */
  chapterSpans: ChapterSpan[]
  /** 人物关联索引（按世系录 DFS 世序） */
  personIndex: PersonIndexEntry[]
  elapsed: number
}

/** 自定义章节渲染器：返回该章的原始页序列（引擎负责编叶码、收入总目） */
export type CustomRenderer = (chapter: ChapterSpec, ctx: RenderContext) => RawPage[]
