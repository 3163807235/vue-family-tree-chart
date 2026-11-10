// 谱牒式（牒记式）排版引擎：按古籍筒子页版刻版式将家谱数据分页排版
// 页面为 A3 横向（1587×1123）：一张纸横放，版心（书口）即对折中线，
// 展开后版心左右各为一个半叶（右半叶为该页正面阅读起端，左半叶续之）。
// 古籍版式结构：
//   天头（版框上方留白） > 地脚（版框下方留白）
//   版框（四周双边）围成正文区；居中竖条为版心（书口）：
//   象鼻中線贯穿版心，上刻上鱼尾、书名，下刻下鱼尾、叶码（页码）
//   每半叶自版框外缘至版心严格均分为十列（十个等宽格轨），格缘贯穿成乌丝栏，留白格亦有界格：
//   右半叶最右一格为书眉格（竖排书眉名，不排人物）；左半叶无书眉，十列全部排人物，不留空列；
//   人物自书眉格之左起从右向左排，抵版心后折入左半叶续排；
//   每进入新的一世先排一世系标签栏（"始祖"/"第二世"……，独占一整轨、大字竖排于整列上下中央、列内无横格线），
//   标签与人物格同为流式原子，照常折半叶、翻页；
//   每个人物至少占一格（轨），格内三行：上格书父名+排行（格中竖排，父名在上、排行在下连写，始祖留空），
//   中格书姓名大字（格中居中、通栏不被竖线劈开），下格书传文小字（自格顶排起、整块左右居中）。
//   传文超单轨容量（40 字）时，该人物沿十列网格向左合并相邻格轨：双轨格容七竖行、三轨格容十竖行……
//   合并格内不画竖界行（姓名、传文不被劈开），半叶在册人数随之减少。
//   铺排以「每半叶格列全填满」为最高优先（2026-10-06 用户指定）：传文长于单轨立即向左占轨，
//   占轨宽度仅够装传文（+1 轨余量），不追求整片同半叶——任何一列都不空置；
//   传文超一半叶容量的长传仍切片续传，跨版心、跨页均不阻断。
// 分页：人物格自右向左流排，右半叶九轨排满（书眉格恒不排人）则折入左半叶（格不跨版心），左半叶十轨排满翻页；
//   续传格上格空，中格重复姓名大字+小字「续」，续完再排后人——页内空间尽量用满，不做无谓翻页。
// 世序（牒记古法，先大宗后小支）：preorder 深度优先展开——本人→长子整房全部后代→次子……兄弟严格按长幼；
//   故序列中世代可回退（长房到底后回到旁支），世系标签于相邻条目世代变化处插入，回溯旁支时重新标注世次。
import type {
  FamilyNode,
  Gender,
  BookLayoutOptions,
  BookLayoutResult,
  BookPage,
  BookPerson,
  BookGenLabel,
  BookRect,
  BookSpine,
  VerticalChar
} from './types'

const RANK_LABELS = ['长子', '次子', '三子', '四子', '五子', '六子', '七子', '八子', '九子', '十子']
const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
// 子女名录中的排行用字：长子称"长"、次子称"次"，三子起按数序"三/四…十"，十子以上用中文数字
const SON_ORDER = ['长', '次', '三', '四', '五', '六', '七', '八', '九', '十']
function sonOrderLabel(idx: number): string {
  return SON_ORDER[idx] ?? toChineseNum(idx + 1)
}

function genLabel(depth: number): string {
  if (depth === 0) return '始祖'
  // 第二世、第三世……（中文数字）
  return `第${toChineseNum(depth + 1)}世`
}

/** 阿拉伯数字转中文数字（仅支持 1~99） */
function toChineseNum(n: number): string {
  if (n <= 0) return String(n)
  if (n <= 10) return CN_NUMS[n - 1]
  if (n < 20) return '十' + (n % 10 === 0 ? '' : CN_NUMS[n % 10 - 1])
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return CN_NUMS[tens - 1] + '十' + (ones === 0 ? '' : CN_NUMS[ones - 1])
}

/**
 * 牒记式世序展开（preorder 深度优先＝先大宗后小支、一房到底）：
 * 写完本人 → 按长幼依次递归，先写完【长子】整房全部后代，再回头写次子，以此类推。
 * 与 BFS（按代横排）不同，DFS 序列中世代可回退（长房到底后回到旁支），
 * 世系标签按「相邻条目世代变化」插入，回溯到较浅旁支时会重新标注世次（传统牒记行款）。
 */
function flatten(root: FamilyNode): { node: FamilyNode; generation: number; rank: string | null; parentName: string | null }[] {
  const out: { node: FamilyNode; generation: number; rank: string | null; parentName: string | null }[] = []
  // 迭代式 preorder DFS：栈顶弹出本人，儿子按长幼逆序压栈（保证长子先出）
  const stack: { node: FamilyNode; generation: number; parentName: string | null }[] = [
    { node: root, generation: 0, parentName: null }
  ]
  while (stack.length) {
    const { node, generation, parentName } = stack.pop()!
    out.push({ node, generation, rank: null, parentName })
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], generation: generation + 1, parentName: node.name })
      }
    }
  }
  const idxMap = new Map<string, number>()
  const visit = (n: FamilyNode) => {
    if (n.children) n.children.forEach((c, i) => { idxMap.set(c.id, i); visit(c) })
  }
  visit(root)
  for (const item of out) {
    if (item.generation > 0) {
      const idx = idxMap.get(item.node.id) ?? 0
      item.rank = RANK_LABELS[idx] ?? `${toChineseNum(idx + 1)}子`
    }
  }
  return out
}

/**
 * 拼接生平传文：字 + 号 + 原配/继配 + bio
 * 传统牒记式行文：字子良，生于…，配陈氏，生子…，葬…
 */
function buildBioText(n: FamilyNode): string {
  const parts: string[] = []
  if (n.courtesyName) parts.push(`字${n.courtesyName}`)
  if (n.hao) parts.push(`号${n.hao}`)
  if (n.bio) parts.push(n.bio)
  // 配偶：若 bio 未提及"配"，则在此补"配X氏，继配Y氏"
  const spouse = n.spouse
  if (spouse && spouse.length) {
    const hasPei = n.bio ? /配/.test(n.bio) : false
    if (!hasPei) {
      const sp = spouse.map((s, i) => {
        const surname = s.charAt(0)
        if (i === 0) return `配${surname}氏`
        return `继配${surname}氏`
      }).join('，')
      parts.push(sp)
    }
  }
  // 子女概况（牒记行款"先列全子女名讳，再跳入长子整支"）：父亲条目末尾按长幼连续列出全部子女，
  // 形如「子二：长彦文、次彦武。」——配合 preorder DFS，正文自下一条目起先写完长子整房再回溯次子。
  // 叶子（无子女）不附；名录为传文一部分，随竖排换行、参与占轨与续传切片。
  const kids = n.children
  if (kids && kids.length) {
    const list = kids.map((c, i) => `${sonOrderLabel(i)}${c.name || ''}`).join('、')
    parts.push(`子${toChineseNum(kids.length)}：${list}。`)
  }
  return parts.join('，')
}

/**
 * 竖排字符布局：自上而下，到 maxY 后向左换竖行。
 * lineH 为行内字距（相邻字符 y 步距），决定单竖行容量，须与 bioCap 估算严格同式；
 * stepX 为竖行水平间距；hardMinX 为不可越过的左界（如格左缘），越界即截断。
 * 返回 chars 与占用竖行数 cols（首行计入）。
 */
function layoutVerticalChars(
  text: string,
  startX: number,
  startY: number,
  stepX: number,
  maxY: number,
  lineH: number,
  hardMinX = -Infinity
): { chars: VerticalChar[]; cols: number } {
  const chars: VerticalChar[] = []
  if (!text) return { chars, cols: 0 }
  let x = startX
  let y = startY
  let colIdx = 0
  for (const ch of text) {
    if (y > maxY) {
      const nextX = x - stepX
      // 换新竖行后行左缘越过硬左界则截断
      if (nextX - stepX / 2 < hardMinX) break
      x = nextX
      colIdx += 1
      y = startY
    }
    chars.push({ ch, x, y })
    y += lineH
  }
  return { chars, cols: colIdx + 1 }
}

/**
 * 竖排字符在固定高度横格内垂直居中布局（单列，所有字符 x 相同）。
 * 文字撑满格高时 topPad 退化为 0，自格顶排起。
 */
function centerVerticalChars(
  text: string,
  x: number,
  rowTopY: number,
  rowHeight: number,
  lineH: number
): VerticalChar[] {
  if (!text) return []
  const topPad = Math.max(0, (rowHeight - text.length * lineH) / 2)
  return text.split('').map((ch, i) => ({
    ch,
    x,
    y: rowTopY + topPad + lineH / 2 + i * lineH
  }))
}

export function runBookLayout(root: FamilyNode, opts: BookLayoutOptions = {}): BookLayoutResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0
  // A3 横向（landscape）：古籍筒子页一张纸横放，版心中线对折，左右两个半叶
  const pageWidth = opts.pageWidth ?? 1587
  const pageHeight = opts.pageHeight ?? 1123
  // 古籍：天头（上）宽于地脚（下），左右边距均等
  const sideMargin = opts.margin ?? 64
  const topMargin = opts.topMargin ?? 76
  const bottomMargin = opts.bottomMargin ?? 56
  const nameSize = opts.nameSize ?? 28
  const bioSize = opts.bioSize ?? 14
  const bioLineSpacing = opts.bioLineSpacing ?? 1.15 // 传文行距倍数：1.15 紧排（默认）、1.5 宽排
  const spineWidth = opts.spineWidth ?? 60.47 // 中缝（版心）宽 16mm（96dpi：16×96/25.4≈60.47px）

  // 版框（边栏）
  const frame: BookRect = {
    left: sideMargin,
    top: topMargin,
    right: pageWidth - sideMargin,
    bottom: pageHeight - bottomMargin
  }
  // 版心（书口）：页面正中竖条
  const centerX = pageWidth / 2
  const spineLeft = centerX - spineWidth / 2
  const spineRight = centerX + spineWidth / 2
  const { type: bt, offsetMm: boff, stapleCount: bstap, sewingHoles: bsew } = (() => {
    const valid = ['none', 'staple', 'sewing', 'perfect'] as const
    const t: (typeof valid)[number] = opts.bindingType && (valid as readonly string[]).includes(opts.bindingType)
      ? (opts.bindingType as (typeof valid)[number]) : 'none'
    const off = opts.bindingOffset == null || Number.isNaN(opts.bindingOffset) ? 0 : Math.max(0, Math.min(15, opts.bindingOffset))
    const stap = opts.stapleCount == null ? 2 : Math.max(2, Math.min(5, Math.round(opts.stapleCount)))
    const sew = opts.sewingHoles == null ? 6 : Math.max(3, Math.min(12, Math.round(opts.sewingHoles)))
    return { type: t, offsetMm: off, stapleCount: stap, sewingHoles: sew }
  })()
  const MM = 96 / 25.4
  const binding = (() => {
    if (bt === 'none' || bt === 'perfect') return undefined
    // 装订线作用于纸张本身：锚定纸张物理边缘，offsetMm 为距纸边向内的距离；对折后两线重合于书脊
    const lineXs = [boff * MM, pageWidth - boff * MM]
    const top = frame.top + 20
    const bottom = frame.bottom - 20
    const span = bottom - top
    if (bt === 'staple') {
      const n = bstap
      const ys: number[] = []
      for (let i = 0; i < n; i++) ys.push(top + span * (i + 1) / (n + 1))
      return { type: bt, lineXs, offsetMm: boff, stapleY: ys }
    }
    const n = bsew
    const ys: number[] = []
    for (let i = 0; i < n; i++) ys.push(top + span * (i + 0.5) / n)
    return { type: bt, lineXs, offsetMm: boff, sewingY: ys }
  })()
  const spine: BookSpine = {
    centerX,
    left: spineLeft,
    right: spineRight,
    width: spineWidth,
    // 鱼尾中心位于版心纵向 1/4、3/4 处（上下对称，组件将鱼尾几何居中于该线）
    upperTailY: frame.top + (frame.bottom - frame.top) * 0.25,
    lowerTailY: frame.top + (frame.bottom - frame.top) * 0.75,
    binding
  }

  // 每半叶固定格列数（十列）；右半叶最右列为书眉格不排人，左半叶十列全开；传文格内向左换行所成竖行不计入此列数
  const HALF_COLS = 10
  // 半叶自版框外缘至版心等分为十列（版框关于版心对称，左右两半叶净宽相等），每格等宽；
  // 右半叶最右一格为书眉格（不排人，余九轨排人物），左半叶无书眉、十轨全部排人物
  const colW = (frame.right - spine.right) / HALF_COLS

  const people = flatten(root)
  const r2 = (v: number) => Math.round(v * 100) / 100

  // ===== 三横格几何（全页统一，横格线全页拉齐）=====
  const colTopY = frame.top // 栏顶即版框上沿（格顶贴框，不留栏上空带）
  // 上格字号同传文；单列竖排「父名+排行」连写，格高按全页最长连写，至少容两字
  const labelSize = bioSize
  const labelLineH = labelSize * 1.15
  const nameLineH = nameSize * 1.15
  // 行内字距（竖排字的上下间距）固定紧排，不随行距滑块变化
  const bioLineH = bioSize * 1.15
  let labelMaxLen = 2
  let nameMaxLen = 1
  for (const it of people) {
    const labelLen = (it.parentName?.length ?? 0) + (it.rank?.length ?? 0)
    if (labelLen) labelMaxLen = Math.max(labelMaxLen, labelLen)
    nameMaxLen = Math.max(nameMaxLen, (it.node.name || '').length)
  }
  const labelH = labelMaxLen * labelLineH + labelSize * 1.2
  const nameTopY = colTopY + labelH
  const nameH = nameMaxLen * nameLineH + nameSize * 0.6
  const labelBottomY = nameTopY // 上格底（中格顶）
  const nameBottomY = nameTopY + nameH // 中格底（传文格顶）
  // 传文首字中心距中格底横线下移一个行高（bioLineH）：字顶与横线间留 0.65 字号的清晰气口，
  // 不与上格横线相贴；内缩量随 bioSize 成比例，配合 SVG viewBox 缩放在任意显示尺寸下视觉间距一致
  const bioStartY = nameBottomY + bioLineH
  const bioMaxY = frame.bottom - bioSize
  // 下格单竖行容量（字数）：与 layoutVerticalChars 换行判据一致
  const bioCap = Math.max(1, Math.floor((bioMaxY - bioStartY) / bioLineH) + 1)
  // 格内传文竖行水平步距（换行时的左右行距）＝bioSize×行距倍数，仅控制竖行间距；
  // 与行内上下字距（bioLineH）解耦。首行中心距格右缘半步
  const bioStepX = bioSize * bioLineSpacing
  // 人物可用格轨数：首页右半叶十列减书眉格＝九轨（书眉为章节标题，仅首页出现一次）；
  // 第二页起无书眉、右半叶十轨全开（与左半叶同），不留空列
  const rightPersonTracksFirst = HALF_COLS - 1
  const rightPersonTracksRest = HALF_COLS
  const leftPersonTracks = HALF_COLS
  // 占 k 个格轨的合并格可容竖行数：宽度 k*colW 内按 stepX 排竖行（与 layoutVerticalChars 的硬左界截断同式）。
  // 单轨 3 竖行、双轨 7 竖行（合并后省去两轨间半步边距，故多于 6）、三轨 10 竖行……
  const rowsInTracks = (k: number) => Math.max(1, Math.floor((k * colW) / bioStepX))
  // 占 k 轨格的传文容量（字数）= 单竖行字数 × 可容竖行数
  const capInTracks = (k: number) => bioCap * rowsInTracks(k)
  // 传文所需最少格轨数：能完整容纳 len 字的最小 k；左半叶十轨仍容不下时返回 leftPersonTracks+1（需续传）
  const tracksNeeded = (len: number) => {
    for (let k = 1; k <= leftPersonTracks; k++) {
      if (len <= capInTracks(k)) return k
    }
    return leftPersonTracks + 1
  }
  // 横格线：栏顶、上格底、中格底；传文格底即版框下沿，不另画
  const rowLines = [colTopY, labelBottomY, nameBottomY]

  // ===== 十列界格网格（几何每页相同）：每半叶十轨等宽，自版框外缘起至版心止；
  //       实际竖界行在 finalizePage 中按当页人物剔除多轨合并格内部的格缘（留白格仍有界格）=====
  const EPS = 1e-6
  const rightBodyRight = frame.right - colW // 人物区右缘（书眉格之左缘）
  const leftBodyLeft = frame.left // 左半叶人物区直起版框左缘（外缘列不做对称留空，正常排人）
  const rightGridXs = Array.from(
    { length: HALF_COLS + 1 }, (_, i) => r2(frame.right - i * colW)
  )
  const leftGridXs = Array.from(
    { length: HALF_COLS + 1 }, (_, i) => r2(spine.left - i * colW)
  )
  // 全页格缘点：右半叶 11 点（起版框右缘、终版心右界）+ 左半叶 11 点（起版心左界、终版框左缘）
  const allGridXs = Array.from(new Set<number>([...rightGridXs, ...leftGridXs]))
  // 竖界行只画到内栏（外栏内缩 5px）为止：与版框外缘重合的两点不画，最外界由内栏竖线充任
  const FRAME_INSET = 5
  const drawableGridX = (x: number) =>
    x > frame.left + FRAME_INSET + 0.5 && x < frame.right - FRAME_INSET - 0.5

  // ===== 多页流式排版（以格为原子：每人占一格，传文格内向左换竖行，页满才跨页续传）=====
  // 世代标签（"始祖"/"第二世"……）同为流式原子：每进入新的一世，先占一整轨排标签，
  // 标签列大字竖排、整列上下居中、不画横格线（竖界行照常）；标签同样参与折半叶/翻页，不悬空列
  const pages: BookPage[] = []
  let pageIndex = 0
  let pagePeople: BookPerson[] = []
  let pageGenLabels: BookGenLabel[] = []
  let half: 'right' | 'left' = 'right'
  // 首页右缘让出书眉格（frame.right-colW）；第二页起无书眉，右缘直起版框外缘 frame.right
  let curRight = rightBodyRight // 当前可放格的右缘

  const finalizePage = () => {
    // 多轨合并格内部的格缘不画竖界行（姓名、传文通栏不被劈开）；其余格缘（含留白格、标签格）全高贯穿
    const hiddenXs = new Set<number>()
    for (const p of pagePeople) {
      if (p.width > colW + 0.5) {
        for (const gx of allGridXs) {
          if (gx > p.x + 0.5 && gx < p.x + p.width - 0.5) hiddenXs.add(gx)
        }
      }
    }
    pages.push({
      pageIndex,
      pageNumber: toChineseNum(pageIndex + 1),
      width: pageWidth,
      height: pageHeight,
      frame,
      spine,
      columnLines: allGridXs.filter(x => drawableGridX(x) && !hiddenXs.has(x)).sort((a, b) => b - a),
      rowLines,
      hasHeader: pageIndex === 0,
      people: pagePeople,
      genLabels: pageGenLabels
    })
    pageIndex += 1
    pagePeople = []
    pageGenLabels = []
    half = 'right'
    // 后续页无书眉格，右半叶十轨全开，人物自版框右缘排起
    curRight = frame.right
  }

  // 当前半叶容量：首页右半叶九轨（让书眉格），第二页起右半叶十轨；左半叶恒十轨
  const halfCapacity = () =>
    half === 'right'
      ? (pageIndex === 0 ? rightPersonTracksFirst : rightPersonTracksRest)
      : leftPersonTracks
  const slotsInHalf = () =>
    half === 'right'
      ? Math.floor((curRight - spine.right) / colW + EPS)
      : Math.floor((curRight - leftBodyLeft) / colW + EPS)

  /**
   * 在当前半叶申领 need 个格轨：余轨为零时先折另一半叶（右→左），左半叶也满则翻页；
   * 返回实占轨数（余轨不足时切到余轨）、格右缘与全精度格左缘。half 可能被切换，
   * 调用方以返回的 half 为准（不捕获外部变量，避免折半叶后写错半叶标记）
   */
  const claimTracks = (need: number) => {
    let avail = slotsInHalf()
    if (avail <= 0) {
      if (half === 'right') { half = 'left'; curRight = spine.left; avail = slotsInHalf() }
      if (avail <= 0) { finalizePage(); avail = slotsInHalf() }
    }
    const tracks = Math.min(need, avail)
    const segRight = curRight
    const segLeftFull = segRight - tracks * colW
    return { tracks, segRight, segLeftFull, halfAtClaim: half }
  }

  let prevGen = -1
  for (const item of people) {
    const n = item.node
    const nameText = n.name || ''
    const fullBio = buildBioText(n)

    // 世代交界：先排一世标签（独占一轨，位于该代第一人之右）
    if (item.generation !== prevGen) {
      const text = genLabel(item.generation)
      const c = claimTracks(1)
      const segLeft = r2(c.segLeftFull)
      const segCX = r2(c.segRight - colW / 2)
      const chars = centerVerticalChars(
        text, segCX, colTopY, frame.bottom - colTopY, nameLineH
      ).map(ch => ({ ...ch, y: r2(ch.y) }))
      pageGenLabels.push({
        generation: item.generation,
        text,
        half: c.halfAtClaim,
        x: segLeft,
        y: colTopY,
        width: r2(colW),
        height: frame.bottom - colTopY,
        chars
      })
      curRight = c.segLeftFull
      prevGen = item.generation
    }

    // 同一人物可能因传文超半叶容量而切成多片续传；每片按剩余字数重新决定占轨数
    let partIdx = 0
    let offset = 0
    while (true) {
      const isContinuation = partIdx > 0
      const remain = fullBio.length - offset
      const need = tracksNeeded(remain) // 整片所需最少轨数（1..10）；11 表示左半叶十轨仍容不下
      // 余轨 ≥ need：整片完整放置；余轨不足但非零：切到余轨铺满该半叶，不整片折另一半叶
      // （2026-10-06 用户指定：任何一列都不留空白，维宁不再因「整片优先折左」被挤到下一页）
      const claimed = claimTracks(need)
      const tracks = claimed.tracks
      const segHalf = claimed.halfAtClaim

      const segCap = capInTracks(tracks)
      const segWidthFull = tracks * colW
      const segRight = claimed.segRight
      // curRight 推进须用全精度：若改用 r2 舍入值，连续多格后两位小数舍入误差累积，
      // 会使贴版心格 slotsInHalf 算得 0.999… 被 floor 成 0，导致该格恒空
      const segLeftFull = claimed.segLeftFull
      const segLeft = r2(segLeftFull)
      const segCX = r2(segRight - segWidthFull / 2) // 格中心（父名排行、姓名、传文整块均左右居中于此）

      // 上格：首片书「父名+排行」连写，单列居格中轴、垂直居中；续传片留空
      const labelChars = isContinuation
        ? []
        : centerVerticalChars(
            `${item.parentName ?? ''}${item.rank ?? ''}`, segCX, colTopY, labelH, labelLineH
          )

      // 中格：首片姓名大字格中居中；续传片姓名大字下缀小字「续」，整体居中
      let nameChars: VerticalChar[]
      let contMarkChars: VerticalChar[] = []
      if (isContinuation) {
        const totalH = nameText.length * nameLineH + labelLineH
        const topPad = Math.max(0, (nameH - totalH) / 2)
        nameChars = nameText.split('').map((ch, i) => ({
          ch,
          x: segCX,
          y: r2(nameTopY + topPad + nameLineH / 2 + i * nameLineH)
        }))
        contMarkChars = [
          {
            ch: '续',
            x: segCX,
            y: r2(nameTopY + topPad + nameText.length * nameLineH + labelLineH / 2)
          }
        ]
      } else {
        nameChars = centerVerticalChars(nameText, segCX, nameTopY, nameH, nameLineH)
      }

      // 下格：本片传文自格顶竖排、满一竖行在格内向左换竖行（硬左界=格左缘）；
      // 竖行整块按实际行数在合并格宽内左右居中（最右竖行中心在格中轴之右 (行数−1)/2 步距）
      const segText = fullBio.slice(offset, offset + segCap)
      const cellRows = rowsInTracks(tracks)
      const usedRows = Math.min(cellRows, Math.max(1, Math.ceil(segText.length / bioCap)))
      const blockRightCX = r2(segCX + ((usedRows - 1) * bioStepX) / 2)
      const { chars: bioChars } = layoutVerticalChars(
        segText, blockRightCX, bioStartY, bioStepX, bioMaxY, bioLineH, segLeft
      )
      const continuesNext = offset + segText.length < fullBio.length

      pagePeople.push({
        id: n.id,
        name: n.name,
        gender: n.gender as Gender,
        spouse: n.spouse ?? null,
        bio: n.bio ?? null,
        courtesyName: n.courtesyName ?? null,
        hao: n.hao ?? null,
        generation: item.generation,
        genLabel: genLabel(item.generation),
        rank: item.rank,
        inherit: n.inherit ?? null,
        parentLabel: item.parentName ? `${item.parentName}之子` : null,
        parentName: item.parentName,
        half: segHalf,
        isContinuation,
        continuesNext,
        x: segLeft,
        y: colTopY,
        width: r2(segWidthFull),
        height: frame.bottom - colTopY,
        labelChars,
        nameChars,
        contMarkChars,
        bioChars
      })

      curRight = segLeftFull
      offset += segText.length
      partIdx += 1
      if (offset >= fullBio.length) break
      // 仍有续片：不主动翻页，下一轮按余轨自动折入另一半叶或翻页（同一长传可连用左右两半叶）
    }
  }
  finalizePage()

  const t1 = typeof performance !== 'undefined' ? performance.now() : 0
  return {
    pages,
    total: people.length,
    elapsed: t1 - t0
  }
}
