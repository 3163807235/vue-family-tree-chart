// 演示页工具栏：谱书排版气泡的展示、互斥展开与参数联动
import { describe, it, expect } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, VueWrapper } from '@vue/test-utils'
import App from '../demo/App.vue'
import type { VolumePlan } from '../src/core/volume/types'

const BookStub = defineComponent({
  name: 'FamilyTreeBook',
  props: {
    nameSize: Number,
    bioSize: Number,
    bioLineSpacing: Number,
    nameFontFamily: String,
    bioFontFamily: String,
    nameFontWeight: [String, Number]
  },
  template: '<div class="book-stub" />'
})

const VolumeStub = defineComponent({
  name: 'FamilyTreeVolume',
  props: { plan: { type: Object, required: true } },
  template: '<div class="volume-stub" />'
})

function volumeRegisterOptions(w: VueWrapper) {
  const plan = w.findComponent(VolumeStub).props('plan') as VolumePlan
  const chapter = plan.chapters.find(c => c.content.type === 'register')
  if (!chapter || chapter.content.type !== 'register') throw new Error('找不到成册世系录章节')
  return chapter.content.options!
}

function buttonOf(w: VueWrapper, text: string) {
  const button = w.findAll('button').find(b => b.text() === text)
  if (!button) throw new Error(`找不到按钮：${text}`)
  return button
}

describe('谱书排版气泡', () => {
  it('集中展示字号、行距、字体并实时驱动谱书，与其他气泡互斥', async () => {
    const w = mount(App, {
      global: {
        stubs: { FamilyTreeChart: true, FamilyTreeBook: BookStub, FamilyTreeVolume: VolumeStub }
      }
    })
    await buttonOf(w, '谱书').trigger('click')
    expect(w.find('.typography-pop').exists()).toBe(false)

    await buttonOf(w, '排版').trigger('click')
    const pop = w.find('.typography-pop')
    expect(pop.exists()).toBe(true)
    expect(pop.findAll('.pop-row')).toHaveLength(5)
    expect(pop.text()).toContain('1.25')

    const book = w.findComponent(BookStub)
    const selects = pop.findAll('select')
    expect(selects).toHaveLength(4)
    await selects[0].setValue('24')
    expect(book.props('nameSize')).toBe(24)
    await selects[1].setValue('16')
    expect(book.props('bioSize')).toBe(16)
    await pop.find('input[type="range"]').setValue('1.5')
    expect(book.props('bioLineSpacing')).toBe(1.5)
    expect(pop.find('.pop-val').text()).toBe('1.50')

    const nameFont = selects[2].findAll('option').find(o => o.text() === '楷体')!
    await selects[2].setValue(nameFont.element.value)
    expect(book.props('nameFontFamily')).toBe('KaiTi')
    expect(book.props('nameFontWeight')).toBe('bold')
    const bioFont = selects[3].findAll('option').find(o => o.text() === '黑体')!
    await selects[3].setValue(bioFont.element.value)
    expect(book.props('bioFontFamily')).toBe('SimHei')

    await buttonOf(w, '句读').trigger('click')
    expect(w.find('.typography-pop').exists()).toBe(false)
    expect(w.find('.punct-pop').exists()).toBe(true)
    await buttonOf(w, '排版').trigger('click')
    expect(w.find('.typography-pop').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(w.find('.typography-pop').exists()).toBe(false)
    w.unmount()
  })
})

describe('成册世系录排版气泡', () => {
  it('集中展示五项排版设置并实时写入世系录章节参数', async () => {
    const w = mount(App, {
      global: {
        stubs: { FamilyTreeChart: true, FamilyTreeBook: BookStub, FamilyTreeVolume: VolumeStub }
      }
    })
    await buttonOf(w, '成册').trigger('click')
    await buttonOf(w, '世系录').trigger('click')

    const pop = w.find('.volume-register-pop')
    expect(pop.exists()).toBe(true)
    expect(pop.findAll('.pop-row')).toHaveLength(5)
    expect(pop.find('.pop-val').text()).toBe('1.25')

    const selects = pop.findAll('select')
    await selects[0].setValue('24')
    expect(volumeRegisterOptions(w).nameSize).toBe(24)
    await selects[1].setValue('16')
    expect(volumeRegisterOptions(w).bioSize).toBe(16)
    await pop.find('input[type="range"]').setValue('1.5')
    expect(volumeRegisterOptions(w).bioLineSpacing).toBe(1.5)
    expect(pop.find('.pop-val').text()).toBe('1.50')

    const nameFont = selects[2].findAll('option').find(o => o.text() === '楷体')!
    await selects[2].setValue(nameFont.element.value)
    expect(volumeRegisterOptions(w).nameFontFamily).toBe('KaiTi')
    expect(volumeRegisterOptions(w).nameFontWeight).toBe('bold')
    const bioFont = selects[3].findAll('option').find(o => o.text() === '黑体')!
    await selects[3].setValue(bioFont.element.value)
    expect(volumeRegisterOptions(w).bioFontFamily).toBe('SimHei')

    await buttonOf(w, '世系图').trigger('click')
    expect(w.find('.volume-register-pop').exists()).toBe(false)
    expect(w.find('.tree-pop').exists()).toBe(true)
    await buttonOf(w, '世系录').trigger('click')
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(w.find('.volume-register-pop').exists()).toBe(false)
    w.unmount()
  })
})

describe('成册正文排版气泡', () => {
  it('提供正文字号和字体设置，实时更新计划且不改章节标题字号', async () => {
    const w = mount(App, {
      global: {
        stubs: { FamilyTreeChart: true, FamilyTreeBook: BookStub, FamilyTreeVolume: VolumeStub }
      }
    })
    await buttonOf(w, '成册').trigger('click')
    await buttonOf(w, '正文').trigger('click')

    const pop = w.find('.volume-body-pop')
    expect(pop.exists()).toBe(true)
    expect(pop.findAll('.pop-row')).toHaveLength(2)
    const selects = pop.findAll('select')
    await selects[0].setValue('24')
    let plan = w.findComponent(VolumeStub).props('plan') as VolumePlan
    expect(plan.fonts?.bodySize).toBe(24)
    expect(plan.fonts?.headingSize).toBe(40)

    const bodyFont = selects[1].findAll('option').find(o => o.text() === '黑体')!
    await selects[1].setValue(bodyFont.element.value)
    plan = w.findComponent(VolumeStub).props('plan') as VolumePlan
    expect(plan.fonts?.bodyFontFamily).toBe('SimHei')

    await buttonOf(w, '世系录').trigger('click')
    expect(w.find('.volume-body-pop').exists()).toBe(false)
    expect(w.find('.volume-register-pop').exists()).toBe(true)
    w.unmount()
  })
})
