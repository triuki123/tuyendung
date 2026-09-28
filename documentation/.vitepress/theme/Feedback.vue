<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const voted = ref(null) // 'up' | 'down' | null

// Reset khi chuyển trang
watch(() => route.path, () => { voted.value = null })

function vote(v) {
  voted.value = v
  // Lưu nhẹ vào localStorage để biết trang nào từng được đánh giá (không gửi đi đâu)
  try {
    const key = 'help_feedback'
    const store = JSON.parse(localStorage.getItem(key) || '{}')
    store[route.path] = v
    localStorage.setItem(key, JSON.stringify(store))
  } catch { /* bỏ qua */ }
}
</script>

<template>
  <div class="help-feedback">
    <div class="help-feedback__row">
      <template v-if="!voted">
        <span class="help-feedback__q">Bài viết này có hữu ích không?</span>
        <button class="help-feedback__btn" @click="vote('up')" aria-label="Hữu ích">👍 Có</button>
        <button class="help-feedback__btn" @click="vote('down')" aria-label="Chưa hữu ích">👎 Chưa</button>
      </template>
      <template v-else>
        <span class="help-feedback__thanks">
          {{ voted === 'up' ? '🎉 Cảm ơn phản hồi của bạn!' : '🙏 Cảm ơn! Chúng tôi sẽ cải thiện trang này.' }}
        </span>
      </template>
    </div>
    <p class="help-feedback__cta">
      Không tìm thấy câu trả lời?
      <a href="/tickets" target="_blank" rel="noopener">Mở Ticket Hỗ trợ →</a>
    </p>
  </div>
</template>

<style scoped>
.help-feedback {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--vp-c-divider);
}
.help-feedback__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.help-feedback__q {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.help-feedback__btn {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.35rem 0.85rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  transition: all 0.15s ease;
}
.help-feedback__btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.help-feedback__thanks {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}
.help-feedback__cta {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}
.help-feedback__cta a {
  font-weight: 600;
}
</style>
