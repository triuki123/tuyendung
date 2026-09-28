<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRoute, useData } from 'vitepress'

const route = useRoute()
const { frontmatter } = useData()
const minutes = ref(0)

async function calc() {
  await nextTick()
  // Đợi nội dung render xong rồi đếm chữ trong vùng tài liệu
  setTimeout(() => {
    const el = document.querySelector('.vp-doc')
    if (!el) { minutes.value = 0; return }
    const text = el.innerText || ''
    const words = text.trim().split(/\s+/).filter(Boolean).length
    minutes.value = Math.max(1, Math.round(words / 200))
  }, 50)
}

onMounted(calc)
watch(() => route.path, calc)

function printPage() {
  window.print()
}
</script>

<template>
  <div v-if="frontmatter.layout !== 'home'" class="page-meta">
    <span class="page-meta__time">⏱ ~{{ minutes }} phút đọc</span>
    <button class="page-meta__print" @click="printPage" title="In hoặc lưu trang này thành PDF">
      🖨 In / Lưu PDF
    </button>
  </div>
</template>

<style scoped>
.page-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}
.page-meta__print {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  transition: all 0.15s ease;
}
.page-meta__print:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
</style>
