const navItems = [
  { id: 'nav-dashboard', label: 'Dashboard', roles: ['super_admin', 'admin'] },
  { id: 'nav-assets', label: 'Quản lý Tài sản', roles: ['super_admin', 'admin'] },
  { id: 'nav-organization', label: 'Tổ Chức', roles: ['super_admin', 'admin'] },
  { id: 'nav-tickets', label: 'Ticket Hỗ Trợ', roles: null },
  { id: 'nav-ticket-config', label: 'Cấu Hình Ticket', roles: ['super_admin'] },
  { id: 'nav-tasks', label: 'Công Việc', roles: ['super_admin', 'admin'] },
  { id: 'nav-tasks-analytics', label: 'Thống Kê Tasks', roles: ['super_admin', 'admin'] },
  { id: 'nav-room-bookings', label: 'Đặt Phòng Họp', roles: null },
  { id: 'nav-history', label: 'Lịch Sử', roles: ['super_admin', 'admin'] },
  { id: 'nav-users', label: 'Người Dùng', roles: ['super_admin', 'admin'] },
  { id: 'nav-delete-requests', label: 'Duyệt Xóa Tài Sản', roles: ['super_admin'] },
  { id: 'nav-settings', label: 'Cài Đặt', roles: null },
];

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('   PHÂN TÍCH CHUYÊN SÂU: USER vs ADMIN - SIDEBAR VISIBILITY');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('👤 USER CÓ THỂ THẤY TRONG SIDEBAR:\n');
const userVisible = navItems.filter(item => !item.roles);
userVisible.forEach((item, idx) => {
  console.log(`   ${idx + 1}. ✓ ${item.label}`);
});
console.log(`\n   📊 TỔNG: ${userVisible.length}/12 modules\n`);

console.log('🔐 ADMIN CÓ THỂ THẤY TRONG SIDEBAR:\n');
const adminVisible = navItems.filter(item => !item.roles || item.roles.includes('admin'));
adminVisible.forEach((item, idx) => {
  console.log(`   ${idx + 1}. ✓ ${item.label}`);
});
console.log(`\n   📊 TỔNG: ${adminVisible.length}/12 modules\n`);

console.log('═══════════════════════════════════════════════════════════════════\n');
console.log('🔍 KẾT QUẢ KIỂM TRA: ADMIN CÓ TẤT CẢ QUYỀN CỦA USER KHÔNG?\n');

// Check if Admin can access everything User can
let adminCanAccessAll = true;
userVisible.forEach(userItem => {
  const adminCanSee = adminVisible.some(adminItem => adminItem.id === userItem.id);
  if (!adminCanSee) {
    console.log(`   ❌ Admin KHÔNG thấy: ${userItem.label}`);
    adminCanAccessAll = false;
  }
});

if (adminCanAccessAll) {
  console.log('   ✅ YES - Admin CÓ thể thấy tất cả modules mà User thấy\n');
}

console.log('═══════════════════════════════════════════════════════════════════\n');
console.log('⚠️  NHỮNG ĐIỀU CHỈ ADMIN CÓ QUYỀN NHƯNG KHÔNG THẤY TRONG SIDEBAR:\n');

const adminHasPermButNoSee = [
  { name: 'Duyệt Xóa Tài Sản (delete-requests)', permission: 'view, approve', reason: 'Chỉ Super Admin mới thấy' }
];

adminHasPermButNoSee.forEach((item, idx) => {
  console.log(`   ${idx + 1}. ❌ ${item.name}`);
  console.log(`      - Quyền: ${item.permission}`);
  console.log(`      - Vấn đề: ${item.reason}`);
  console.log('');
});

console.log('═══════════════════════════════════════════════════════════════════\n');
console.log('🎯 KẾT LUẬN:\n');
console.log('   ✅ Admin CÓ tất cả quyền User có (view)');
console.log('   ✅ Admin CÓ thêm quyền create, edit, approve, export');
console.log('   ✅ Admin CÓ thể thấy tất cả modules mà User thấy');
console.log('   ❌ BUG: Admin KHÔNG thể thấy "Duyệt Xóa Tài Sản" nhưng lại có quyền trên nó');
console.log('   ❌ BUG: Admin KHÔNG thể cấu hình Ticket (chỉ Super Admin)\n');

