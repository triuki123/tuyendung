import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import './custom.css'
import Feedback from './Feedback.vue'
import PageMeta from './PageMeta.vue'
import NotFound from './NotFound.vue'

// Tùy biến layout: thời gian đọc + nút In/PDF (đầu trang), widget phản hồi (cuối trang),
// và trang 404 thân thiện.
export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-before': () => h(PageMeta),
      'doc-after': () => h(Feedback),
      'not-found': () => h(NotFound),
    })
  },
}
