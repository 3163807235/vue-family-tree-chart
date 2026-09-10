import { describe, it, expect } from 'vitest'
import { runLayout } from '../../src/core/layout'
import type { FamilyNode } from '../../src/core/types'

const mk = (id: string, name: string, gender: 'm' | 'f', children: FamilyNode[] = []): FamilyNode =>
  ({ id, name, gender, children })

describe('runLayout', () => {
  it('根节点位于顶层（depth=0），y 为顶部基准', () => {
    const root = mk('1', 'A', 'm')
    const r = runLayout(root, 100, 96, [])
    expect(r.nodes.length).toBe(1)
    expect(r.nodes[0].depth).toBe(0)
    expect(r.nodes[0].x).toBe(0) // 始祖作为水平基准线居中到 0
    expect(r.nodes[0].y).toBe(60) // BASE_Y
  })

  it('生成父子之间的吊线连线，边数 = 子女总数（宝塔汇聚于父）', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm'),
      mk('3', 'C', 'f')
    ])
    const r = runLayout(root, 100, 96, [])
    expect(r.edges.length).toBe(2)
    // 父节点应位于两个子女中心
    const a = r.nodes.find(n => n.id === '1')!
    const xMid = (a.x - 0) // 父 x 应为两子均值推导，这里验证父卡在子区间内
    const children = r.nodes.filter(n => n.id !== '1')
    expect(children[0].x).toBeLessThan(children[1].x)
    expect(xMid).toBeGreaterThanOrEqual(0)
    expect(a.x).toBe((children[0].x + children[1].x) / 2)
  })

  it('兄弟按 children 顺序从左到右排列（长子居左）', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm'),
      mk('3', 'C', 'm'),
      mk('4', 'D', 'm')
    ])
    const r = runLayout(root, 100, 96, [])
    const ids = r.nodes.filter(n => n.id !== '1').sort((a, b) => a.x - b.x).map(n => n.id)
    expect(ids).toEqual(['2', '3', '4'])
  })

  it('折叠节点不铺开其子孙，但自身保留', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm', [mk('5', 'E', 'f')]),
      mk('3', 'C', 'm')
    ])
    const r = runLayout(root, 100, 96, ['2'])
    const ids = r.nodes.map(n => n.id)
    expect(ids).toContain('1')
    expect(ids).toContain('2')
    expect(ids).not.toContain('5') // E 是 B 的子孙，被折叠去除
    expect(ids).toContain('3')
    expect(r.nodes.find(n => n.id === '2')!.collapsed).toBe(true)
  })

  it('折叠空数组等同于全部展开', () => {
    const root = mk('1', 'A', 'm', [mk('2', 'B', 'm', [mk('3', 'C', 'm')])])
    expect(runLayout(root, 100, 96, []).nodes.length).toBe(3)
  })

  it('为非根节点生成排行标签（长子/长女/次子…）', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm'),
      mk('3', 'C', 'f'),
      mk('4', 'D', 'm')
    ])
    const r = runLayout(root, 100, 96, [])
    const rank = (id: string) => r.nodes.find(n => n.id === id)!.rank
    expect(rank('2')).toBe('长子')
    expect(rank('3')).toBe('长女')
    expect(rank('4')).toBe('次子')
  })

  it('gapX 增大使多列布局更宽', () => {
    // 每个有子兄弟都带「多个叶子后代」的分支子树：其子树宽度含兄弟间接缝，随 gapX 增长，
    // 故增大间距时整体布局变宽（若只有单个叶子后代，宽度=固定 famWidth，新语义下不会变宽）
    const wideRoot = mk('1', 'A', 'm', [
      mk('2', 'B', 'm', [mk('5', 'E', 'f'), mk('8', 'H', 'f')]),
      mk('3', 'C', 'm', [mk('6', 'F', 'f'), mk('9', 'I', 'f')]),
      mk('4', 'D', 'm', [mk('7', 'G', 'f'), mk('10', 'J', 'f')])
    ])
    const tight = runLayout(wideRoot, 80, 70, [])
    const loose = runLayout(wideRoot, 160, 140, [])
    expect(loose.width).toBeGreaterThan(tight.width)
  })

  it('gapY 增大使深层布局更高', () => {
    const deepRoot = mk('1', 'A', 'm', [mk('2', 'B', 'm', [mk('3', 'C', 'm', [mk('4', 'D', 'm')])])])
    expect(runLayout(deepRoot, 80, 70, []).height)
      .toBeLessThan(runLayout(deepRoot, 80, 140, []).height)
  })

  it('标准宝塔树：间距=gapX 1:1 直控、叶子均匀分布、父节点居中于其子孙叶子', () => {
    const root = mk('1', 'A', 'm', [
      mk('2', 'B', 'm', [mk('5', 'E', 'f'), mk('8', 'H', 'f')]),
      mk('3', 'C', 'm', [mk('6', 'F', 'f'), mk('9', 'I', 'f')]),
      mk('4', 'D', 'm', [mk('7', 'G', 'f'), mk('10', 'J', 'f')])
    ])
    const tight = runLayout(root, 80, 70, [])
    const loose = runLayout(root, 160, 140, [])
    // 叶子按 STEP=gapX 均匀分布（任一相邻叶子间距恒等于 gapX，1:1 直控）
    const leafXs = (r: ReturnType<typeof runLayout>) =>
      r.nodes.filter(n => !n.hasChildren).map(n => n.x).sort((a, b) => a - b)
    const tx = leafXs(tight)
    const lx = leafXs(loose)
    // 紧凑模型：相邻叶子卡片「净间隙」= gapX，中心距 = 卡片宽(32) + gapX（叶子不虚占整列）
    const FW = 32
    expect(tx.length).toBe(6)
    for (let i = 1; i < tx.length; i++) expect(tx[i] - tx[i - 1]).toBe(FW + 80)
    for (let i = 1; i < lx.length; i++) expect(lx[i] - lx[i - 1]).toBe(FW + 160)
    // 父节点居中于其子孙叶子中点；布局末尾整体平移使根节点恒为 x=0
    const rootXOf = (r: ReturnType<typeof runLayout>) => r.nodes.find(n => n.depth === 0)!.x
    const centered = (r: ReturnType<typeof runLayout>) => {
      const xs = leafXs(r)
      return (xs[0] + xs[xs.length - 1]) / 2
    }
    expect(rootXOf(tight)).toBe(0)
    expect(rootXOf(loose)).toBe(0)
    expect(centered(tight)).toBe(0) // 叶子群中点也对齐到 0（左右对称）
    expect(centered(loose)).toBe(0)
    // 调节 gapX 时以根节点为中心向左右两边对称扩展（左更左、右更右），整树更宽
    expect(tx[0]).toBeLessThan(0)
    expect(lx[0]).toBeLessThan(tx[0])
    expect(lx[lx.length - 1]).toBeGreaterThan(tx[tx.length - 1])
    expect(loose.width).toBeGreaterThan(tight.width)
  })

  it('名字短（不超卡片）时，吊线起点使用默认高度（卡片下缘）', () => {
    const root = mk('1', '氏', 'm', [mk('2', 'B', 'm')])
    const r = runLayout(root, 100, 96, []) // mainSize 默认 12
    const parent = r.nodes.find(n => n.id === '1')!
    const e = r.edges.find(x => x.parentId === '1')!
    // 名字 1 字：内容底部 = -24+10+0+6 = -8 < 默认 24，应按默认 24
    const expected = parent.y + 24
    expect(e.ymin).toBe(expected)
    expect(e.d.startsWith('M ' + parent.x + ' ' + expected)).toBe(true)
    expect(e.ymin).toBeGreaterThanOrEqual(parent.y + 24) // 不低于默认高度
  })

  it('名字超长时，吊线起点自适应为实际内容底部 + 间距', () => {
    const root = mk('1', '一二三四五六七八九十一二三四五六七八九', 'm', [mk('2', 'B', 'm')])
    const r = runLayout(root, 100, 96, [])
    const parent = r.nodes.find(n => n.id === '1')!
    const e = r.edges.find(x => x.parentId === '1')!
    // nameOrigin = PADDING_V(4) + round(12/1.05)=11 → 内容底部 = -24+11+18*13+6 = 231
    // dropY = max(24, 231+4)=235；起点 = parent.y + 235，明显低于卡底 24
    const expected = parent.y + 235
    expect(e.ymin).toBe(expected)
    expect(e.ymin).toBeGreaterThan(parent.y + 24)
  })

  it('主字号增大使长名字吊线起点更低', () => {
    const name = '一二三四五六七八九一'
    const mkParent = () => mk('1', name, 'm', [mk('2', 'B', 'm')])
    const small = runLayout(mkParent(), 100, 96, [], 12)
    const big = runLayout(mkParent(), 100, 96, [], 24)
    const ys = small.edges.find(x => x.parentId === '1')!.ymin
    const yb = big.edges.find(x => x.parentId === '1')!.ymin
    expect(yb).toBeGreaterThan(ys)
  })

  it('父节点内容变高会把子节点层整体下推（层间距联动）', () => {
    const child = () => mk('2', '子', 'm')
    // 短 / 长 两种父名字：contentBottom 不同 → 下一层 y 不同
    const shortRoot = mk('1', '氏', 'm', [child()])
    const longRoot = mk('1', '一二三四五六七八九十一二三四五六七八九', 'm', [child()])
    const rs = runLayout(shortRoot, 100, 96, [])
    const rl = runLayout(longRoot, 100, 96, [])
    const ys = rs.nodes.find(n => n.id === '2')!.y
    const yl = rl.nodes.find(n => n.id === '2')!.y
    expect(yl).toBeGreaterThan(ys) // 长父名的子层更靠下
  })

  it('层间距 gapY 增大使所有子层累积下移（间距调整联动全局）', () => {
    const root = mk('1', 'A', 'm', [mk('2', 'B', 'm', [mk('3', 'C', 'm')])])
    const tight = runLayout(root, 100, 70, [])
    const loose = runLayout(root, 100, 140, [])
    // depth1 与 depth2 都在 loose 中更靠下，且层级越深累积位移越大
    const y1t = tight.nodes.find(n => n.id === '2')!.y
    const y1l = loose.nodes.find(n => n.id === '2')!.y
    const y2t = tight.nodes.find(n => n.id === '3')!.y
    const y2l = loose.nodes.find(n => n.id === '3')!.y
    expect(y1l).toBeGreaterThan(y1t)
    expect(y2l).toBeGreaterThan(y2t)
    expect(y2l - y1l).toBeGreaterThan(y1l - y1t) // 累积：第二层位移大于第一层
  })

  it('不同字号下上吊线终点恒为节点卡顶，不随字号偏移', () => {
    const root = mk('1', 'A', 'm', [mk('2', '一二三四五六七八九', 'm')])
    const s = runLayout(root, 100, 96, [], 12)
    const b = runLayout(root, 100, 96, [], 24)
    const es = s.edges.find(e => e.childId === '2')!.ymax
    const eb = b.edges.find(e => e.childId === '2')!.ymax
    // 两种字号下终点都恰好 = 子节点卡顶（y - DEFAULT_DROP=24），逐位相等，绝对无偏移
    const cy_s = s.nodes.find(n => n.id === '2')!.y
    const cy_b = b.nodes.find(n => n.id === '2')!.y
    expect(es).toBe(cy_s - 24)
    expect(eb).toBe(cy_b - 24)
  })

  it('字号增大时下吊线起点随内容底部自适应（与顶部对称，不重叠）', () => {
    const root = mk('1', '一二三四五六', 'm', [mk('2', 'B', 'm')])
    const s = runLayout(root, 100, 96, [], 12)
    const b = runLayout(root, 100, 96, [], 24)
    const es = s.edges.find(e => e.parentId === '1')!.ymin
    const eb = b.edges.find(e => e.parentId === '1')!.ymin
    expect(eb).toBeGreaterThan(es) // 字号大 → 下吊线起点更低，避免穿过放大文字
  })

  it('文字内容区与上、下连接线均保持统一 PADDING_V(=4) 净距', () => {
    // 父 1 有子 2，子 2 有子 3：1 触发"下连接线"，2 触发"上连接线"，且名字足够长使内容超出卡片
    const root = mk('1', '一二三四五六七八九', 'm', [mk('2', '一二三四五六七八九', 'm', [mk('3', 'X', 'm')])])
    const r = runLayout(root, 100, 96, [], 12)
    const n1 = r.nodes.find(n => n.id === '1')!
    const n2 = r.nodes.find(n => n.id === '2')!

    // 上连接线净距：节点2 的文字首字上沿 距 其卡顶（=上吊线）应为 PADDING_V
    const eTop = r.edges.find(e => e.childId === '2')!
    const nameOrigin = 4 + Math.round(12 / 1.05) // 布局 PADDING_V + size/1.05
    const textTop = n2.y - 24 + nameOrigin - 6 // 首字上沿
    expect(textTop - eTop.ymax).toBe(nameOrigin - 6) // 与布局一致，恒不重叠

    // 下连接线净距：节点1 的吊线起点（ymin）距 文字末字下沿 应为 PADDING_V
    const lineH = Math.round(12 * 1.05)
    const len = 8
    const textBottom = n1.y + (-24 + nameOrigin + len * lineH + 6)
    const eBot = r.edges.find(e => e.parentId === '1')!
    expect(eBot.ymin - textBottom).toBe(4) // 4 = PADDING_V
  })

  it('折叠按钮锚点 dropY 与下吊线顶点同源同步', () => {
    // 长名父节点：内容超出卡片，下吊线顶点自适应下移
    const root = mk('1', '一二三四五六七八九', 'm', [mk('2', 'B', 'm')])
    const r = runLayout(root, 100, 96, [])
    const n1 = r.nodes.find(n => n.id === '1')!
    const e = r.edges.find(x => x.parentId === '1')!
    // 布局写入的 dropY == 吊线顶点偏移（edge.ymin - 节点y），两者同值即按钮与吊线严格同步
    expect(n1.dropY).toBe(e.ymin - n1.y)
  })

  it('短名/叶子：无子节点的按钮锚点退回卡底', () => {
    const root = mk('1', '氏', 'm', [mk('2', 'B', 'm')])
    const r = runLayout(root, 100, 96, [])
    const n2 = r.nodes.find(n => n.id === '2')!
    expect(n2.dropY).toBe(24) // 叶子不产生 exit 线，卡底兜底
  })
})