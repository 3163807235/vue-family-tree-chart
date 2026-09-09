// 包入口
import type { App, Plugin } from 'vue'
import FamilyTreeChart from './components/FamilyTreeChart.vue'

export { FamilyTreeChart }
export { runLayout } from './core/layout'
export { validateFamily, countNodes } from './core/validate'
export type * from './core/types'

const plugin: Plugin = {
  install(app: App) {
    app.component('FamilyTreeChart', FamilyTreeChart)
  }
}
export default plugin