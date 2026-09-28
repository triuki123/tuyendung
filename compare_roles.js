const modules = [
  { id: 'dashboard', name: 'Bảng Điều Khiển', permissions: ['view', 'export'] },
  { id: 'asset-management', name: 'Quản Lý Tài Sản', permissions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'hardware', name: 'Phần Cứng', permissions: ['view', 'create', 'edit', 'delete'] },
  { id: 'software', name: 'Phần Mềm', permissions: ['view', 'create', 'edit', 'delete'] },
  { id: 'tickets', name: 'Ticket Hỗ Trợ', permissions: ['view', 'create', 'edit', 'approve'] },
  { id: 'tasks', name: 'Nhiệm Vụ', permissions: ['view', 'create', 'edit', 'delete'] },
  { id: 'room-bookings', name: 'Đặt Phòng', permissions: ['view', 'create', 'edit', 'approve'] },
  { id: 'delete-requests', name: 'Duyệt Xóa Tài Sản', permissions: ['view', 'approve'] },
  { id: 'organization', name: 'Tổ Chức', permissions: ['view', 'create', 'edit', 'delete'] },
  { id: 'users', name: 'Người Dùng', permissions: ['view', 'create', 'edit', 'delete'] },
  { id: 'settings', name: 'Cài Đặt', permissions: ['view', 'edit'] },
  { id: 'history', name: 'Lịch Sử', permissions: ['view', 'export'] },
];

console.log('\n=== SO SÁNH QUYỀN: USER vs ADMIN ===\n');

// User permissions
console.log('📊 USER CÓ QUYỀN:');
console.log('   Modules: Tất cả (12 modules)');
console.log('   Quyền: view ONLY\n');

// Admin permissions
console.log('🔐 ADMIN CÓ QUYỀN:');
modules.forEach((mod, idx) => {
  let adminPerms;
  if (mod.id === 'settings') {
    adminPerms = ['view'];
  } else {
    adminPerms = mod.permissions.filter(p => p !== 'delete');
  }
  
  console.log(`   ${idx + 1}. ${mod.name}`);
  console.log(`      -> ${adminPerms.join(', ')}`);
});

console.log('\n=== KIỂM TRA: ADMIN CÓ TẤT CẢ QUYỀN CỦA USER KHÔNG? ===\n');

let allGood = true;
modules.forEach(mod => {
  const adminPerms = mod.id === 'settings' 
    ? ['view']
    : mod.permissions.filter(p => p !== 'delete');
  
  const hasView = adminPerms.includes('view');
  if (!hasView) {
    console.log(`❌ ${mod.name} - ADMIN KHÔNG CÓ 'view'`);
    allGood = false;
  }
});

if (allGood) {
  console.log('✅ ADMIN CÓ view QUYỀN TRÊN TẤT CẢ MODULE CỦA USER\n');
}

// Check visibility
console.log('\n=== SIDEBAR VISIBILITY ===\n');

console.log('👤 USER THẤY MODULES TRONG SIDEBAR:');
const userVisible = ['tickets', 'room-bookings', 'settings'];
userVisible.forEach(m => console.log(`   ✓ ${modules.find(mod => mod.id === m)?.name}`));

console.log('\n🔐 ADMIN THẤY MODULES TRONG SIDEBAR:');
modules.forEach(mod => {
  const visible = mod.id !== 'delete-requests';
  if (visible) {
    console.log(`   ✓ ${mod.name}`);
  }
});

console.log('\n❌ ADMIN KHÔNG THẤY NHƯNG CÓ QUYỀN:');
console.log('   - Duyệt Xóa Tài Sản (delete-requests)');
console.log('     -> Permission: view, approve');
console.log('     -> BUG: Bị ẩn khỏi sidebar nhưng lại có quyền!');

