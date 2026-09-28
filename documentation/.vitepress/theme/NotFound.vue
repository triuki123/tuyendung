<script setup>
// Trang 404 tùy biến: thông điệp thân thiện + lối tắt phổ biến
// cleanUrls=false → trang con có đuôi .html; trang chủ là /help/
const popular = [
  { text: 'Trang chủ Trợ Giúp', href: '/help/' },
  { text: 'Bắt đầu nhanh', href: '/help/bat-dau/gioi-thieu.html' },
  { text: 'Chấm công & Nghỉ phép', href: '/help/chuc-nang/cham-cong.html' },
  { text: 'Quản lý Tài sản', href: '/help/chuc-nang/tai-san.html' },
  { text: 'Câu hỏi thường gặp', href: '/help/phu-luc/faq.html' },
  { text: '✨ Có gì mới', href: '/help/cap-nhat.html' },
]
</script>

<template>
  <div class="nf">
    <p class="nf__code">404</p>
    <h1 class="nf__title">Không tìm thấy trang</h1>
    <p class="nf__desc">
      Trang bạn tìm có thể đã được di chuyển hoặc đổi tên. Dùng ô <strong>Tìm kiếm</strong> ở trên cùng
      (hoặc <kbd>Ctrl/Cmd</kbd> + <kbd>K</kbd>), hoặc chọn một lối tắt bên dưới.
    </p>
    <div class="nf__links">
      <a v-for="p in popular" :key="p.href" :href="p.href" class="nf__link">
        {{ p.text }}
      </a>
    </div>
  </div>
</template>

<style scoped>
.nf {
  max-width: 640px;
  margin: 0 auto;
  padding: 6rem 1.5rem;
  text-align: center;
}
.nf__code {
  font-size: 4rem;
  font-weight: 800;
  line-height: 1;
  color: var(--vp-c-brand-1);
  margin: 0;
}
.nf__title {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 0.5rem 0 0.75rem;
  border: 0;
}
.nf__desc {
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
}
.nf__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: center;
  margin-top: 1.75rem;
}
.nf__link {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.45rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  color: var(--vp-c-text-1);
  transition: all 0.15s ease;
}
.nf__link:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  text-decoration: none;
}
</style>
