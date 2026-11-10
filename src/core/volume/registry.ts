// 章节注册表与编排机制：标准章节模板 + 可配置覆盖 + 运行时增删重排
import type { FamilyNode } from '../types'
import type {
  ChapterContent,
  ChapterKind,
  ChapterSpec,
  TocOptions,
  VolumeFontSetup,
  VolumePageSetup,
  VolumePlan
} from './types'

/** 标准家谱章节装订顺序（卷首 → 正文 → 卷末） */
export const STANDARD_CHAPTER_ORDER: ChapterKind[] = [
  'cover',
  'titlePage',
  'preface',
  'editorialNotes',
  'toc',
  'honor',
  'genPoem',
  'treeDiagram',
  'register',
  'biography',
  'hall',
  'tomb',
  'property',
  'literature',
  'postscript'
]

/** 标准章名（版心书名、书眉、总目条目同取此值） */
export const STANDARD_TITLES: Record<ChapterKind, string> = {
  cover: '封面',
  titlePage: '扉页',
  toc: '总目',
  preface: '序',
  editorialNotes: '凡例',
  honor: '恩荣录',
  genPoem: '字辈谱',
  treeDiagram: '世系图',
  register: '世系录',
  biography: '传记',
  hall: '祠堂',
  property: '族产',
  tomb: '坟茔',
  literature: '艺文',
  postscript: '后记',
  custom: '附录'
}

/** 各章节的默认内容形态（恩荣录、祠堂、坟茔等可改用图版覆盖） */
function defaultContent(kind: ChapterKind, tree?: FamilyNode): ChapterContent {
  switch (kind) {
    case 'cover':
      return { type: 'cover' }
    case 'titlePage':
      return { type: 'titlePage' }
    case 'toc':
      return { type: 'toc' }
    case 'genPoem':
      return { type: 'genPoem', poem: '' }
    case 'biography':
      return { type: 'bios', essays: [] }
    case 'treeDiagram':
      return tree ? { type: 'tree', root: tree } : { type: 'text', blocks: [] }
    case 'register':
      return tree ? { type: 'register', root: tree } : { type: 'text', blocks: [] }
    default:
      return { type: 'text', blocks: [] }
  }
}

/** 创建一个标准章节（可按 overrides 覆盖任意字段） */
export function createChapter(
  kind: ChapterKind,
  overrides: Partial<ChapterSpec> = {},
  tree?: FamilyNode
): ChapterSpec {
  return {
    id: kind,
    kind,
    title: STANDARD_TITLES[kind],
    enabled: true,
    content: overrides.content ?? defaultContent(kind, tree),
    ...overrides
  }
}

/** 成册计划种子：只写差异，标准章节自动补齐 */
export interface PlanSeed {
  /** 谱名，如「周氏宗谱」 */
  title: string
  /** 郡望/堂号，如「汝南堂」 */
  clanName?: string
  /** 版次，如「己亥三修」 */
  edition?: string
  /** 纂修者 */
  compiler?: string
  /** 纂修年月 */
  compileDate?: string
  /** 世系数据（世系图、世系录默认取此树） */
  tree?: FamilyNode
  /** 世系录排版参数（字号、行距等；版面几何由 pageSetup 统一给出） */
  registerOptions?: import('../types').BookLayoutOptions
  pageSetup?: VolumePageSetup
  fonts?: VolumeFontSetup
  toc?: TocOptions
  /** 章节覆盖：按 id 优先、kind 次之匹配标准章节；匹配不到则新增一章 */
  chapters?: Partial<ChapterSpec>[]
  /** 重排：列出的 id 依序在前，未列出的按原相对顺序缀尾 */
  order?: string[]
  /** 是否自动补齐标准章节，默认 true */
  includeStandard?: boolean
}

/** 去重 id：同 kind 多章（如多篇序）自动追加序号 */
function normalizeIds(chapters: ChapterSpec[]): ChapterSpec[] {
  const used = new Set<string>()
  for (const ch of chapters) {
    let id = ch.id || ch.kind
    if (used.has(id)) {
      let n = 2
      while (used.has(`${id}-${n}`)) n += 1
      id = `${id}-${n}`
    }
    ch.id = id
    used.add(id)
  }
  return chapters
}

/**
 * 由种子装配成册计划
 * 三步：① 生成标准章节 → ② 应用覆盖（按 id 优先、kind 次之）→ ③ 按 order 重排
 */
export function createVolumePlan(seed: PlanSeed): VolumePlan {
  const tree = seed.tree
  let chapters: ChapterSpec[] =
    seed.includeStandard === false
      ? []
      : STANDARD_CHAPTER_ORDER.map(kind => createChapter(kind, {}, tree))

  for (const ov of seed.chapters ?? []) {
    const byId = ov.id ? chapters.find(c => c.id === ov.id) : undefined
    const byKind = !byId && ov.kind ? chapters.find(c => c.kind === ov.kind) : undefined
    const target = byId ?? byKind
    if (target) {
      const content = ov.content ?? target.content
      Object.assign(target, ov, { content })
    } else {
      chapters.push(createChapter(ov.kind ?? 'custom', ov, tree))
    }
  }

  if (seed.order?.length) {
    const rank = new Map(seed.order.map((id, i) => [id, i]))
    chapters = [...chapters].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER
      return ra - rb
    })
  }

  return {
    title: seed.title,
    clanName: seed.clanName,
    edition: seed.edition,
    compiler: seed.compiler,
    compileDate: seed.compileDate,
    chapters: normalizeIds(chapters),
    pageSetup: seed.pageSetup,
    fonts: seed.fonts,
    toc: seed.toc
  }
}

/** 克隆计划（运行时编排 API 均为不可变操作） */
function clonePlan(plan: VolumePlan): VolumePlan {
  return JSON.parse(JSON.stringify(plan)) as VolumePlan
}

/** 插入章节（位于 beforeId 之前；缺省追加到末尾） */
export function insertChapter(plan: VolumePlan, chapter: ChapterSpec, beforeId?: string): VolumePlan {
  const next = clonePlan(plan)
  const at = beforeId ? next.chapters.findIndex(c => c.id === beforeId) : -1
  if (at >= 0) next.chapters.splice(at, 0, chapter)
  else next.chapters.push(chapter)
  normalizeIds(next.chapters)
  return next
}

/** 删除章节 */
export function removeChapter(plan: VolumePlan, id: string): VolumePlan {
  const next = clonePlan(plan)
  next.chapters = next.chapters.filter(c => c.id !== id)
  return next
}

/** 调整章节顺序（移动到指定下标） */
export function moveChapter(plan: VolumePlan, id: string, toIndex: number): VolumePlan {
  const next = clonePlan(plan)
  const from = next.chapters.findIndex(c => c.id === id)
  if (from < 0) return next
  const [ch] = next.chapters.splice(from, 1)
  const at = Math.max(0, Math.min(toIndex, next.chapters.length))
  next.chapters.splice(at, 0, ch)
  return next
}

/** 启用/停用章节（不收入成册时保留内容，便于随时恢复） */
export function setChapterEnabled(plan: VolumePlan, id: string, enabled: boolean): VolumePlan {
  const next = clonePlan(plan)
  const ch = next.chapters.find(c => c.id === id)
  if (ch) ch.enabled = enabled
  return next
}

/** 追加一篇序（新序叠于旧序之后；多篇他序依次排列） */
export function appendPreface(
  plan: VolumePlan,
  title: string,
  text: string,
  author?: string
): VolumePlan {
  const next = clonePlan(plan)
  const content: ChapterContent = {
    type: 'text',
    blocks: [
      { kind: 'heading', text: title },
      { kind: 'paragraph', text },
      ...(author ? [{ kind: 'signature' as const, text: author }] : [])
    ]
  }
  const chapter: ChapterSpec = { id: 'preface', kind: 'preface', title, enabled: true, content }
  const lastPreface = next.chapters.map(c => c.kind).lastIndexOf('preface')
  const at = lastPreface >= 0 ? lastPreface + 1 : Math.max(0, next.chapters.findIndex(c => c.kind === 'toc'))
  next.chapters.splice(at, 0, chapter)
  normalizeIds(next.chapters)
  return next
}
