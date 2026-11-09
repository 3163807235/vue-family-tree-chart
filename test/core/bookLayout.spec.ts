import { describe, it, expect } from 'vitest'
import { runBookLayout } from '../../src/core/bookLayout'
import type { FamilyNode } from '../../src/core/types'

// 行款几何与 demo 一致（nameSize 30 / bioSize 17）：
// colW=69.93，右半叶九轨（书眉格不排人）、左半叶十轨全开；
// 单轨 3 竖行容 120 字、双轨 7 竖行容 280 字、九轨 32 竖行容 1280 字、十轨 35 竖行容 1400 字
const OPTS = { nameSize: 30, bioSize: 17 }
const COL_W = 69.93

const mk = (id: string, name: string, bio: string | null = null, children: FamilyNode[] = []): FamilyNode =>
  ({ id, name, gender: 'm', bio, children })
const bioOf = (n: number) => '甲'.repeat(n)

describe('runBookLayout 长传占轨（半叶十列网格内合并相邻格轨）', () => {
  it('短传占单轨：width=一格宽，半叶十列界行完整，始祖标签独占首列', () => {
    const r = runBookLayout(mk('a', '周邦', bioOf(10)), OPTS)
    expect(r.pages).toHaveLength(1)
    const p = r.pages[0].people[0]
    expect(p.half).toBe('right')
    expect(p.width).toBeCloseTo(COL_W, 2)
    expect(p.bioChars).toHaveLength(10)
    expect(p.isContinuation).toBe(false)
    // 世系标签：始祖独占一轨、在始祖人物之右（前），列宽一格、右半叶
    const labels = r.pages[0].genLabels
    expect(labels).toHaveLength(1)
    expect(labels[0].text).toBe('始祖')
    expect(labels[0].half).toBe('right')
    expect(labels[0].width).toBeCloseTo(COL_W, 2)
    expect(labels[0].x + labels[0].width).toBeCloseTo(1453.07, 1) // 标签右缘=人物区右缘（书眉格之左）
    // 无合并格：全页 22 格点，剔与版框外缘重合的 2 点后 20 条竖界行（最外界由内栏线充任）
    const cls = r.pages[0].columnLines
    expect(cls).toHaveLength(20)
    expect(cls.every(x => x > 64 + 0.5 && x < 1523 - 0.5)).toBe(true)
  })

  it('传文需四竖行（153 字）时占双轨格，整传同页完整、不跨页，内部界行剔除；两世标签各占一轨', () => {
    // 有一子则：上格「父名+排行」四字、bioCap=40；传末自动追加名录「，子一：长维甲。」8 字 → 全文 161 字
    const r = runBookLayout(mk('a', '维城', bioOf(153), [mk('b', '维甲')]), OPTS)
    expect(r.pages).toHaveLength(1)
    const p = r.pages[0].people.find(x => x.id === 'a')!
    expect(p.width).toBeCloseTo(2 * COL_W, 1)
    expect(p.bioChars).toHaveLength(161) // 153 传文 + 8 名录，文字守恒、无截断
    expect(p.isContinuation).toBe(false)
    expect(p.continuesNext).toBe(false)
    // 双轨格内部唯一界点（p.x+colW）不画；两缘 p.x / p.x+width 保留（始祖标签在其右占一轨）
    const xs = r.pages[0].columnLines
    expect(xs.some(x => Math.abs(x - (p.x + COL_W)) < 0.05)).toBe(false)
    expect(xs.some(x => Math.abs(x - p.x) < 0.05)).toBe(true)
    expect(xs.some(x => Math.abs(x - (p.x + p.width)) < 0.05)).toBe(true)
    expect(xs).toHaveLength(19) // 22 格点剔外缘 2 点、再剔双轨内部 1 点
    // 两世标签：始祖（始祖人物之右）、第二世（子代人物之右）
    expect(r.pages[0].genLabels.map(g => g.text)).toEqual(['始祖', '第二世'])
  })

  it('半叶余轨不足时长传折入另一半叶（格不跨版心），世系标签随流占轨', () => {
    // 右半叶九轨：始祖标签+始祖+第二世标签+六子=9 排满；另两子入左半叶；
    // 长传（需双轨）在左半叶余八轨处整片放置
    const kids = Array.from({ length: 8 }, (_, i) => mk('c' + i, '子', bioOf(20)))
    const longOne = mk('long', '维城', bioOf(153))
    const r = runBookLayout(mk('a', '周邦', null, [...kids, longOne]), OPTS)
    expect(r.pages).toHaveLength(1)
    const p = r.pages[0].people.find(x => x.id === 'long')!
    expect(p.half).toBe('left')
    expect(p.width).toBeCloseTo(2 * COL_W, 1)
    expect(p.bioChars).toHaveLength(153)
  })

  it('书眉仅首页：首页右半叶九轨（hasHeader=true），第二页起右半叶十轨全开（hasHeader=false），首人贴版框右缘', () => {
    // 首页容量 19 轨；始祖标签+始祖+第二世标签占 3 轨，16 子同页，余 3 子翻到第二页；
    // 第二页无书眉格，自版框右缘 1523 排起
    const kids19 = Array.from({ length: 19 }, (_, i) => mk('c' + i, '子', bioOf(20)))
    const r = runBookLayout(mk('a', '周邦', null, kids19), OPTS)
    expect(r.pages).toHaveLength(2)
    expect(r.pages[0].hasHeader).toBe(true)
    expect(r.pages[1].hasHeader).toBe(false)
    const firstOnPage2 = r.pages[1].people[0]
    expect(firstOnPage2.half).toBe('right')
    expect(firstOnPage2.x + firstOnPage2.width).toBeCloseTo(1523, 1) // 右缘直起版框外缘
    expect(firstOnPage2.x).toBeCloseTo(1453.07, 1)
    expect(r.pages[1].people).toHaveLength(3)
    // 20 子：第二页 4 人，仍两页可容（第二页容量 20 轨）
    const kids20 = Array.from({ length: 20 }, (_, i) => mk('d' + i, '子', bioOf(20)))
    const r2 = runBookLayout(mk('a', '周邦', null, kids20), OPTS)
    expect(r2.pages).toHaveLength(2)
    expect(r2.pages[1].people).toHaveLength(4)
  })

  it('左半叶十轨全开：标签3轨+始祖+16子=19轨同页，末子占最外列贴版框左缘 x=64；再加一人翻页', () => {
    const kids16 = Array.from({ length: 16 }, (_, i) => mk('c' + i, '子', bioOf(20)))
    const r = runBookLayout(mk('a', '周邦', null, kids16), OPTS)
    expect(r.pages).toHaveLength(1)
    const last = r.pages[0].people[16] // 始祖 + 16 子
    expect(last.half).toBe('left')
    expect(last.x).toBeCloseTo(64, 1) // 左半叶最外列不做对称留空
    expect(last.x + last.width).toBeCloseTo(133.93, 1)
    // 再加一人：全页十九轨排满，第廿轨翻页
    const r2 = runBookLayout(mk('a', '周邦', null, [...kids16, mk('z', '末', bioOf(20))]), OPTS)
    expect(r2.pages).toHaveLength(2)
    expect(r2.pages[1].people[0].half).toBe('right')
  })

  it('传文 1400 字：始祖标签占首轨后，右半叶余八轨切 8 轨（1176 字），同页左半叶双轨续 224 字', () => {
    // 无子女单人造极简世系：bioCap=42，八轨容 1176、双轨容 294
    const r = runBookLayout(mk('a', '巨传', bioOf(1400)), OPTS)
    expect(r.pages).toHaveLength(1)
    const first = r.pages[0].people.find(x => x.id === 'a' && !x.isContinuation)!
    const second = r.pages[0].people.find(x => x.id === 'a' && x.isContinuation)!
    expect(first.half).toBe('right')
    expect(first.width).toBeCloseTo(8 * COL_W, 0)
    expect(first.bioChars).toHaveLength(1176)
    expect(second.half).toBe('left')
    expect(second.width).toBeCloseTo(2 * COL_W, 1)
    expect(second.bioChars).toHaveLength(224)
    expect(first.bioChars.length + second.bioChars.length).toBe(1400)
  })

  it('维宁场景：标签3轨+15短人=18轨（左半叶余一轨），维宁需双轨切单轨铺满末列，续传折下页，不留空列', () => {
    const short = Array.from({ length: 15 }, (_, i) => mk('s' + i, '短', bioOf(20)))
    const weining = mk('wn', '维宁', bioOf(153))
    const r = runBookLayout(mk('a', '周邦', null, [...short, weining]), OPTS)
    expect(r.pages).toHaveLength(2)
    const page1 = r.pages[0]
    const wn1 = page1.people.find(x => x.id === 'wn')!
    expect(wn1.half).toBe('left')
    expect(wn1.width).toBeCloseTo(COL_W, 1) // 单轨铺满末列
    // 16 子使排行出现「十六子」3 字 → labelMaxLen=5、bioCap=39，单轨 3 竖行容 117 字
    expect(wn1.bioChars).toHaveLength(117)
    expect(wn1.continuesNext).toBe(true)
    const page2 = r.pages[1]
    expect(page2.people[0].isContinuation).toBe(true)
    expect(page2.people[0].id).toBe('wn')
  })

  it('超十轨容量（2700 字＋8 字名录＝2708）方续传：右八轨 1120 字 → 同页左十轨 1400 字 → 翻页补 188 字，字数守恒', () => {
    const r = runBookLayout(mk('a', '巨传', bioOf(2700), [mk('b', '巨甲')]), OPTS)
    expect(r.pages).toHaveLength(2)
    const first = r.pages[0].people.find(x => x.id === 'a' && !x.isContinuation)!
    const second = r.pages[0].people.find(x => x.id === 'a' && x.isContinuation && x.half === 'left')!
    const third = r.pages[1].people[0]
    expect(first.width).toBeCloseTo(8 * COL_W, 0)
    expect(first.half).toBe('right')
    expect(first.bioChars).toHaveLength(1120)
    expect(second.width).toBeCloseTo(10 * COL_W, 0)
    expect(second.half).toBe('left')
    expect(second.bioChars).toHaveLength(1400)
    expect(third.isContinuation).toBe(true)
    expect(third.half).toBe('right')
    expect(third.bioChars).toHaveLength(188)
    expect(
      first.bioChars.length + second.bioChars.length + third.bioChars.length
    ).toBe(2708)
    // 始祖标签（单轨）两缘在；右八轨通栏剔 7 点 + 左十轨通栏剔 9 点：
    // 22 格点剔外缘 2、再剔合并内部 16 = 4 条竖界行
    expect(r.pages[0].columnLines).toHaveLength(4)
  })

  it('世系标签：三代树标签文字依次为始祖/第二世/第三世，大字竖排于整列上下中央、列宽一轨', () => {
    const grand = mk('g', '景某', bioOf(10))
    const kid = mk('b', '廷某', bioOf(10), [grand])
    const r = runBookLayout(mk('a', '周邦', bioOf(10), [kid]), OPTS)
    const labels = r.pages[0].genLabels
    expect(labels.map(g => g.text)).toEqual(['始祖', '第二世', '第三世'])
    for (const g of labels) {
      expect(g.width).toBeCloseTo(COL_W, 2)
      expect(g.chars.length).toBe(g.text.length)
      expect(g.chars.every(c => Math.abs(c.x - (g.x + g.width / 2)) < 0.01)).toBe(true) // 字列居格中轴
    }
    // 始祖标签两字整列上下居中：列高 991（76→1067）、行高 34.5，首字中心 y≈554.25
    expect(labels[0].chars[0].y).toBeCloseTo(554.25, 1)
    expect(labels[0].chars[1].y).toBeCloseTo(588.75, 1)
  })

  it('牒记世序＝preorder 深度优先（先大宗后小支、一房到底）：景初→彦文→国祥→明远→世安→国瑞→彦武，回溯重标世次', () => {
    // 复刻牒记示例：景初子二彦文(长)/彦武(次)；彦文子二国祥(长)/国瑞(次)；国祥子明远；明远子世安
    const shiAn = mk('sa', '世安', bioOf(10))
    const mingYuan = mk('my', '明远', bioOf(10), [shiAn])
    const guoXiang = mk('gx', '国祥', bioOf(10), [mingYuan])
    const guoRui = mk('gr', '国瑞', bioOf(10))
    const yanWen = mk('yw', '彦文', bioOf(10), [guoXiang, guoRui])
    const yanWu = mk('y2', '彦武', bioOf(10))
    const r = runBookLayout(mk('jc', '景初', bioOf(10), [yanWen, yanWu]), OPTS)
    // 人物序：长子整房全部后代写完（含国瑞）才回到次子彦武
    expect(r.pages[0].people.filter(p => !p.isContinuation).map(p => p.name)).toEqual(
      ['景初', '彦文', '国祥', '明远', '世安', '国瑞', '彦武']
    )
    // 世代随 DFS 深入再回溯：0,1,2,3,4,2,1
    expect(r.pages[0].people.filter(p => !p.isContinuation).map(p => p.generation)).toEqual(
      [0, 1, 2, 3, 4, 2, 1]
    )
    // 排行/父名：国瑞为彦文次子、彦武为景初次子
    const gr = r.pages[0].people.find(p => p.id === 'gr')!
    expect(gr.rank).toBe('次子')
    expect(gr.parentName).toBe('彦文')
    const y2 = r.pages[0].people.find(p => p.id === 'y2')!
    expect(y2.rank).toBe('次子')
    expect(y2.parentName).toBe('景初')
    // 世系标签：每次相邻世代变化都标（回溯到国瑞重标第三世、彦武重标第二世）
    expect(r.pages[0].genLabels.map(g => `${g.text}`)).toEqual(
      ['始祖', '第二世', '第三世', '第四世', '第五世', '第三世', '第二世']
    )
    // 标签与紧随其后的人物同半叶，且标签左缘紧贴该人物格右缘（在其右/前一列）
    const labelThirdRevisit = r.pages[0].genLabels[5] // 国瑞前的「第三世」
    expect(labelThirdRevisit.text).toBe('第三世')
    const grSeg = r.pages[0].people.find(p => p.id === 'gr')!
    expect(labelThirdRevisit.half).toBe(grSeg.half)
    expect(labelThirdRevisit.x).toBeCloseTo(grSeg.x + grSeg.width, 1)
  })

  it('同代兄弟相邻（兄长无后）共享一个世系标签，不重复标注', () => {
    // 景初二子皆叶子：DFS=景初,彦文,彦武（世代 0,1,1）→ 标签仅 始祖、第二世
    const r = runBookLayout(
      mk('jc', '景初', bioOf(10), [mk('yw', '彦文', bioOf(10)), mk('y2', '彦武', bioOf(10))]),
      OPTS
    )
    expect(r.pages[0].people.filter(p => !p.isContinuation).map(p => p.name)).toEqual(['景初', '彦文', '彦武'])
    expect(r.pages[0].genLabels.map(g => g.text)).toEqual(['始祖', '第二世'])
  })

  it('子女概况名录：父亲传末按长幼连续列全子女「子N：长X、次Y…」，叶子不附；十一子排行用「十一」', () => {
    const bioTextOf = (r: ReturnType<typeof runBookLayout>, id: string) =>
      r.pages
        .flatMap(p => p.people.filter(x => x.id === id))
        .map(p => p.bioChars.map(c => c.ch).join(''))
        .join('')
    // 叶子：不附名录，传文即原文
    const leaf = runBookLayout(mk('a', '独传', bioOf(10)), OPTS)
    expect(bioTextOf(leaf, 'a')).toBe('甲'.repeat(10))
    // 一子：「子一：长独子。」
    const r1 = runBookLayout(mk('a', '父', bioOf(10), [mk('b', '独子', bioOf(4))]), OPTS)
    expect(bioTextOf(r1, 'a').endsWith('子一：长独子。')).toBe(true)
    // 二子（景初例）：「子二：长彦文、次彦武。」
    const r2 = runBookLayout(
      mk('jc', '景初', bioOf(10), [mk('yw', '彦文', bioOf(4)), mk('y2', '彦武', bioOf(4))]),
      OPTS
    )
    expect(bioTextOf(r2, 'jc')).toBe('甲'.repeat(10) + '，子二：长彦文、次彦武。')
    // 十一子：计数用「子十一」，第十子「十」、第十一子排行回退「十一」
    const names = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '乾']
    const kids11 = names.map((nm, i) => mk('k' + i, nm, bioOf(4)))
    const r3 = runBookLayout(mk('a', '多子', bioOf(10), kids11), OPTS)
    const t3 = bioTextOf(r3, 'a')
    expect(t3).toContain('子十一：')
    expect(t3.endsWith('十癸、十一乾。')).toBe(true)
  })
})

describe('runBookLayout 传文行距（bioLineSpacing）', () => {
  // 行距滑块只控制换行时竖行间的左右间距（bioStepX=bioSize×倍数）；
  // 行内上下字距固定 bioSize×1.15，单竖行容量 bioCap 恒为 40 字（bioStartY=270.1、bioMaxY=1050）
  // 一子在传末追加名录「，子一：长维一。」8 字：67+8=75
  it('行距 1.5 倍：仅竖行左右间距变 25.5，行内上下字距仍 19.55，容量/行数/字数守恒', () => {
    const r = runBookLayout(mk('a', '巨甲', bioOf(67), [mk('b', '维一')]), { ...OPTS, bioLineSpacing: 1.5 })
    expect(r.pages).toHaveLength(1)
    const p = r.pages[0].people.find(x => x.id === 'a')!

    // 行内上下字距不受滑块影响：相邻字 y 步距恒 17×1.15=19.55
    expect(p.bioChars[1].y - p.bioChars[0].y).toBeCloseTo(19.55, 1)
    // 换行左右间距随滑块：第 41 字换行，新竖行 x 较首行左移 17×1.5=25.5
    expect(p.bioChars[40].x).toBeCloseTo(p.bioChars[39].x - 25.5, 1)

    // 单竖行 40 字：75 = 40+35 → 2 竖行；1.5 倍下单轨容 2 竖行 80 字 → 占 1 轨
    const xs = new Set(p.bioChars.map(c => c.x))
    expect(xs.size).toBe(2)
    expect(p.bioChars).toHaveLength(75) // 67 传文 + 8 名录，字数守恒、无截断
    expect(p.width).toBeCloseTo(COL_W, 1)
  })

  it('行距 1.0 倍：竖行左右间距收窄为 17，行内上下字距不变、无溢出截断', () => {
    const r = runBookLayout(mk('a', '巨甲', bioOf(67), [mk('b', '维一')]), { ...OPTS, bioLineSpacing: 1.0 })
    const p = r.pages[0].people.find(x => x.id === 'a')!
    expect(p.bioChars[1].y - p.bioChars[0].y).toBeCloseTo(19.55, 1)
    expect(p.bioChars[40].x).toBeCloseTo(p.bioChars[39].x - 17, 1)
    const xs = new Set(p.bioChars.map(c => c.x))
    expect(xs.size).toBe(2)
    expect(p.bioChars).toHaveLength(75)
    expect(p.width).toBeCloseTo(COL_W, 1)
  })
})
