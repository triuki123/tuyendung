// Module Permissions System
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'notify' | 'payment' | 'hr' | 'account' | 'internal' | 'manage' | 'conclude' | 'lock';

export interface ModulePermission {
  action: PermissionAction;
  label: string;
  description: string;
  color?: string;
}

/** Module con — phân quyền riêng, key permission phẳng (cùng cấp với module mẹ trong map). */
export interface ModuleChild {
  id: string;
  name: string;
  icon?: string;
  description: string;
  permissions: ModulePermission[];
}

export interface Module {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  permissions: ModulePermission[];
  children?: ModuleChild[];
  order: number;
}

// Bộ action chuẩn dùng lại cho nhiều module/con
const A = {
  view:    { action: 'view'    as PermissionAction, label: 'Xem',          description: 'Xem dữ liệu' },
  create:  { action: 'create'  as PermissionAction, label: 'Thêm',         description: 'Thêm mới' },
  edit:    { action: 'edit'    as PermissionAction, label: 'Sửa',          description: 'Chỉnh sửa' },
  delete:  { action: 'delete'  as PermissionAction, label: 'Xóa',          description: 'Xóa' },
  approve: { action: 'approve' as PermissionAction, label: 'Phê duyệt',    description: 'Phê duyệt' },
  export:  { action: 'export'  as PermissionAction, label: 'Xuất dữ liệu', description: 'Xuất dữ liệu' },
  notify:  { action: 'notify'  as PermissionAction, label: 'Nhận thông báo', description: 'Nhận thông báo' },
};

export const MODULES: Module[] = [
  {
    id: 'dashboard',
    name: 'Bảng Điều Khiển',
    icon: '📊',
    color: '#3B82F6',
    description: 'Xem bảng điều khiển và báo cáo tổng quan',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem bảng điều khiển' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất báo cáo' },
    ],
    order: 1,
  },
  {
    id: 'asset-management',
    name: 'Quản Lý Tài Sản',
    icon: '📦',
    color: '#10B981',
    description: 'Quản lý tài sản công ty (phần cứng, phần mềm, domain, email)',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem danh sách tài sản' },
      { action: 'create', label: 'Thêm', description: 'Thêm tài sản mới' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa tài sản' },
      { action: 'delete', label: 'Xóa', description: 'Xóa tài sản' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất danh sách tài sản' },
    ],
    children: [
      {
        id: 'hardware',
        name: 'Phần Cứng',
        icon: '🖥️',
        description: 'Quản lý phần cứng',
        permissions: [A.view, A.create, A.edit, A.delete, A.export],
      },
      {
        id: 'software',
        name: 'Phần Mềm',
        icon: '💾',
        description: 'Quản lý phần mềm',
        permissions: [A.view, A.create, A.edit, A.delete, A.export],
      },
      {
        id: 'asset-domains',
        name: 'Tên Miền (Domain)',
        icon: '🌐',
        description: 'Quản lý tên miền',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'asset-emails',
        name: 'Email / Zimbra',
        icon: '📧',
        description: 'Quản lý tài khoản email Zimbra',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
    ],
    order: 2,
  },
  {
    id: 'tickets',
    name: 'Ticket Hỗ Trợ',
    icon: '🎫',
    color: '#EF4444',
    description: 'Quản lý ticket hỗ trợ',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem ticket' },
      { action: 'create', label: 'Thêm', description: 'Tạo ticket mới' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa ticket' },
      { action: 'delete', label: 'Xóa', description: 'Xóa ticket' },
      { action: 'approve', label: 'Phê duyệt', description: 'Phê duyệt/Đóng ticket' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất danh sách ticket' },
    ],
    order: 3,
  },
  {
    id: 'ticket-config',
    name: 'Cấu Hình Ticket',
    icon: '🛠️',
    color: '#EF4444',
    description: 'Cấu hình danh mục, mức ưu tiên & quy tắc cho Ticket Hỗ Trợ',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem cấu hình ticket' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa cấu hình ticket' },
    ],
    order: 8,
  },
  {
    id: 'tasks',
    name: 'Nhiệm Vụ',
    icon: '✅',
    color: '#06B6D4',
    description: 'Quản lý nhiệm vụ công việc',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem nhiệm vụ' },
      { action: 'create', label: 'Thêm', description: 'Tạo nhiệm vụ mới' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa nhiệm vụ' },
      { action: 'delete', label: 'Xóa', description: 'Xóa nhiệm vụ' },
      { action: 'approve', label: 'Phê duyệt', description: 'Duyệt/đóng nhiệm vụ' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất báo cáo nhiệm vụ' },
    ],
    children: [
      {
        id: 'tasks-analytics',
        name: 'Phân Tích Công Việc',
        icon: '📈',
        description: 'Xem báo cáo & phân tích công việc',
        permissions: [A.view, A.export],
      },
    ],
    order: 4,
  },
  {
    id: 'room-bookings',
    name: 'Đặt Phòng',
    icon: '🏢',
    color: '#EC4899',
    description: 'Quản lý đặt phòng',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem danh sách đặt phòng' },
      { action: 'create', label: 'Thêm', description: 'Tạo đặt phòng mới' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa đặt phòng' },
      { action: 'delete', label: 'Hủy', description: 'Hủy/xóa đặt phòng' },
      { action: 'approve', label: 'Phê duyệt', description: 'Phê duyệt đặt phòng' },
    ],
    order: 5,
  },
  {
    id: 'delete-requests',
    name: 'Duyệt Xóa Tài Sản',
    icon: '🗑️',
    color: '#EF4444',
    description: 'Duyệt và quản lý yêu cầu xóa tài sản',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem yêu cầu xóa tài sản' },
      { action: 'approve', label: 'Phê duyệt', description: 'Duyệt/từ chối yêu cầu xóa tài sản' },
    ],
    order: 6,
  },
  {
    id: 'duyet-yeu-cau',
    name: 'Duyệt Yêu Cầu',
    icon: '🧾',
    color: '#F59E0B',
    description: 'Xét duyệt bù công/tăng ca, bảng công và yêu cầu xóa tài sản',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem các yêu cầu cần duyệt' },
      { action: 'approve', label: 'Phê duyệt', description: 'Duyệt/từ chối yêu cầu' },
    ],
    order: 7,
  },
  {
    id: 'organization',
    name: 'Tổ Chức',
    icon: '🏛️',
    color: '#6366F1',
    description: 'Quản lý cấu trúc tổ chức',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem cấu trúc tổ chức' },
      { action: 'create', label: 'Thêm', description: 'Thêm phòng ban/vị trí' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa phòng ban/vị trí' },
      { action: 'delete', label: 'Xóa', description: 'Xóa phòng ban/vị trí' },
    ],
    children: [
      {
        id: 'org-companies',
        name: 'Cơ Cấu Tổ Chức',
        icon: '🏢',
        description: 'Công ty, phòng ban, bộ phận',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'org-job-titles',
        name: 'Chức Danh',
        icon: '🏷️',
        description: 'Quản lý chức danh',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'org-positions',
        name: 'Vị Trí Công Việc',
        icon: '📍',
        description: 'Quản lý vị trí công việc',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'org-tags',
        name: 'Tags Tổ Chức',
        icon: '🔖',
        description: 'Quản lý nhãn tổ chức',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
    ],
    order: 7,
  },
  {
    id: 'users',
    name: 'Người Dùng',
    icon: '👥',
    color: '#14B8A6',
    description: 'Quản lý người dùng',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem danh sách người dùng' },
      { action: 'create', label: 'Thêm', description: 'Tạo người dùng mới' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa người dùng' },
      { action: 'delete', label: 'Xóa', description: 'Xóa người dùng' },
      { action: 'approve', label: 'Duyệt', description: 'Duyệt người dùng mới từ luồng onboarding' },
      { action: 'notify', label: 'Nhận thông báo', description: 'Nhận thông báo khi có hồ sơ nhân sự chờ duyệt tạo tài khoản' },
    ],
    order: 8,
  },
  {
    id: 'settings',
    name: 'Cài Đặt',
    icon: '⚙️',
    color: '#64748B',
    description: 'Quản lý cài đặt hệ thống',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem cài đặt' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa cài đặt' },
    ],
    order: 9,
  },
  {
    id: 'history',
    name: 'Lịch Sử',
    icon: '📜',
    color: '#78716C',
    description: 'Xem lịch sử hoạt động',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem lịch sử hoạt động' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất lịch sử' },
    ],
    order: 10,
  },
  {
    id: 'announcements',
    name: 'Thông Báo - Truyền Thông',
    icon: '📣',
    color: '#F59E0B',
    description: 'Đăng và quản lý thông báo nội bộ',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem thông báo' },
      { action: 'create', label: 'Đăng bài', description: 'Đăng thông báo mới' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa thông báo đã đăng' },
      { action: 'delete', label: 'Xóa', description: 'Xóa thông báo' },
    ],
    order: 11,
  },
  {
    id: 'hr',
    name: 'Quản Lý Hồ Sơ',
    icon: '🧑‍💼',
    color: '#0EA5E9',
    description: 'Quản lý hợp đồng & hồ sơ nhân sự',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem hợp đồng & hồ sơ' },
      { action: 'create', label: 'Thêm', description: 'Tạo hợp đồng mới' },
      { action: 'edit', label: 'Sửa', description: 'Sửa hợp đồng, đính kèm, cấu hình' },
      { action: 'delete', label: 'Xóa', description: 'Xóa hợp đồng' },
      { action: 'approve', label: 'Duyệt', description: 'Duyệt gia hạn hợp đồng' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất danh sách hợp đồng' },
    ],
    order: 12,
  },
  {
    id: 'forms',
    name: 'Biểu Mẫu',
    icon: '📝',
    color: '#A855F7',
    description: 'Cấu hình biểu mẫu onboarding & gửi link cho nhân sự mới',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem cấu hình biểu mẫu & danh sách lời mời' },
      { action: 'create', label: 'Gửi link', description: 'Tạo lời mời & gửi link biểu mẫu cho nhân sự mới' },
      { action: 'edit', label: 'Sửa', description: 'Bật/tắt, chỉnh sửa trường của biểu mẫu' },
      { action: 'delete', label: 'Xóa', description: 'Xóa lời mời/biểu mẫu' },
    ],
    order: 13,
  },
  {
    id: 'hr-resources',
    name: 'Nguồn Nhân Lực',
    icon: '🧲',
    color: '#F97316',
    description: 'Tuyển dụng, Onboarding, Offboarding, Kho CV, Kho JD',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem tổng quan Nguồn Nhân Lực' },
      { action: 'create', label: 'Thêm', description: 'Thêm dữ liệu Nguồn Nhân Lực' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa dữ liệu Nguồn Nhân Lực' },
      { action: 'delete', label: 'Xóa', description: 'Xóa dữ liệu Nguồn Nhân Lực' },
      { action: 'approve', label: 'Xác nhận', description: 'Xác nhận thông tin & gửi quản trị viên' },
      { action: 'notify', label: 'Nhận thông báo', description: 'Nhận thông báo khi có nhân sự mới nộp biểu mẫu & cập nhật onboarding' },
    ],
    children: [
      {
        id: 'hr-recruitment-dashboard',
        name: 'Tình Hình Tuyển Dụng',
        icon: '📈',
        description: 'Dashboard biểu đồ tuyển dụng & cơ cấu lao động',
        permissions: [A.view, A.export],
      },
      {
        id: 'hr-requisitions',
        name: 'Tiếp Nhận Yêu Cầu Tuyển Dụng',
        icon: '📋',
        description: 'Tiếp nhận & xử lý yêu cầu tuyển dụng từ phòng ban',
        permissions: [A.view, A.create, A.edit, A.approve],
      },
      {
        id: 'hr-onboarding',
        name: 'Onboarding',
        icon: '🧑‍🎓',
        description: 'Tiếp nhận nhân sự mới',
        permissions: [A.view, A.create, A.edit, A.approve],
      },
      {
        id: 'hr-offboarding',
        name: 'Offboarding',
        icon: '🚪',
        description: 'Quy trình nghỉ việc',
        permissions: [A.view, A.create, A.edit, A.approve],
      },
      {
        id: 'hr-cv',
        name: 'Kho CV',
        icon: '📄',
        description: 'Kho hồ sơ ứng viên',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'hr-jd',
        name: 'Kho JD',
        icon: '📑',
        description: 'Kho mô tả công việc',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
    ],
    order: 14,
  },
  {
    id: 'recruitment-order',
    name: 'Yêu Cầu Tuyển Dụng',
    icon: '📣',
    color: '#F97316',
    description: 'Cổng đặt yêu cầu tuyển dụng cho phòng ban (mục Hoạt Động)',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem các yêu cầu tuyển dụng' },
      { action: 'create', label: 'Tạo', description: 'Đặt yêu cầu tuyển dụng mới' },
      { action: 'edit', label: 'Sửa', description: 'Sửa yêu cầu tuyển dụng' },
      { action: 'delete', label: 'Hủy', description: 'Hủy yêu cầu tuyển dụng' },
      { action: 'notify', label: 'Nhận nhắc', description: 'Nhận nhắc yêu cầu tuyển dụng sắp hết hạn' },
    ],
    order: 15,
  },
  {
    id: 'design-requests',
    name: 'Yêu Cầu Thiết Kế',
    icon: '🎨',
    color: '#D946EF',
    description: 'Tiếp nhận, xử lý, bàn giao và lưu trữ yêu cầu thiết kế',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem yêu cầu thiết kế' },
      { action: 'create', label: 'Tạo', description: 'Tạo yêu cầu thiết kế' },
      { action: 'edit', label: 'Xử lý', description: 'Tiếp nhận, cập nhật và bàn giao kết quả' },
      { action: 'delete', label: 'Xóa', description: 'Xóa yêu cầu thiết kế' },
      { action: 'notify', label: 'Nhận nhắc', description: 'Nhận thông báo khi có yêu cầu mới hoặc sắp tới hạn' },
    ],
    order: 16,
  },
  {
    id: 'cham-cong',
    name: 'Dữ Liệu Chấm Công',
    icon: '⏱️',
    color: '#14B8A6',
    description: 'Điểm danh, tra cứu dữ liệu chấm công, cấu hình máy & loại phép',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem dữ liệu chấm công cá nhân' },
      { action: 'create', label: 'Chấm công', description: 'Điểm danh vào/ra ca' },
      { action: 'edit', label: 'Bù công / Tăng ca', description: 'Gửi yêu cầu bù công và tăng ca' },
      { action: 'approve', label: 'Xác nhận bảng công', description: 'Duyệt bảng công cấp dưới (Quản Lý)' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất bảng công tổng hợp (HCNS)' },
    ],
    children: [
      {
        id: 'cham-cong-checkin',
        name: 'Điểm Danh',
        icon: '📍',
        description: 'Điểm danh vào/ra ca',
        permissions: [A.view, A.create],
      },
      {
        id: 'cham-cong-lookup',
        name: 'Tra Cứu Công',
        icon: '🔎',
        description: 'Tra cứu & tổng hợp bảng công',
        permissions: [A.view, A.export],
      },
      {
        id: 'cham-cong-machines',
        name: 'Cấu Hình Máy Chấm Công',
        icon: '🖲️',
        description: 'Quản lý máy chấm công ZKTeco/ADMS',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'cham-cong-diligence',
        name: 'Theo Dõi Chuyên Cần',
        icon: '🏅',
        description: 'Tổng hợp chỉ số chuyên cần: đúng giờ, đi trễ, về sớm, nghỉ phép, vắng mặt',
        permissions: [A.view, A.export],
      },
      {
        id: 'cham-cong-leave-config',
        name: 'Cấu Hình Loại Phép',
        icon: '🗓️',
        description: 'Quản lý loại phép & chính sách phép năm',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
    ],
    order: 16,
  },
  {
    id: 'tra-cuu',
    name: 'Tra Cứu',
    icon: '🔎',
    color: '#0EA5E9',
    description: 'Tra cứu tài sản, văn bản, thông báo, đầu mối và lịch sử',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Tra cứu dữ liệu' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất kết quả tra cứu' },
    ],
    children: [
      { id: 'tra-cuu-dau-moi',  name: 'Đầu Mối',   icon: '🧭', description: 'Tra cứu đầu mối liên hệ',  permissions: [A.view] },
      { id: 'tra-cuu-tai-san',  name: 'Tài Sản',   icon: '📦', description: 'Tra cứu tài sản',          permissions: [A.view, A.export] },
      { id: 'tra-cuu-van-ban',  name: 'Văn Bản',   icon: '📄', description: 'Tra cứu văn bản',          permissions: [A.view] },
      { id: 'tra-cuu-thong-bao', name: 'Thông Báo', icon: '📣', description: 'Tra cứu thông báo',        permissions: [A.view] },
      { id: 'tra-cuu-lich-su',  name: 'Lịch Sử',   icon: '📜', description: 'Tra cứu lịch sử hoạt động', permissions: [A.view, A.export] },
    ],
    order: 17,
  },
  {
    id: 'email-signature',
    name: 'Chữ Ký Email',
    icon: '✍️',
    color: '#8B5CF6',
    description: 'Tạo & quản lý chữ ký email cá nhân theo mẫu chuẩn thương hiệu',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem & tạo chữ ký của mình' },
      { action: 'edit', label: 'Sửa', description: 'Chỉnh sửa chữ ký' },
    ],
    order: 19,
  },
  {
    id: 'ho-so-nang-luc',
    name: 'Hồ Sơ Năng Lực',
    icon: '🌟',
    color: '#0EA5E9',
    description: 'Biên soạn hồ sơ năng lực (trang landing) để chào khách hàng và gán cho nhân sự',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Mở trình biên soạn hồ sơ năng lực' },
      { action: 'edit', label: 'Biên soạn', description: 'Biên soạn & gán hồ sơ cho nhân sự' },
    ],
    order: 21,
  },
  {
    id: 'email-center',
    name: 'Trung Tâm Email',
    icon: '✉️',
    color: '#0EA5E9',
    description: 'Soạn & gửi email hàng loạt theo template (đề nghị TT, HR, tài khoản, nội bộ)',
    permissions: [
      { action: 'payment', label: 'Đề Nghị Thanh Toán', description: 'Gửi email đề nghị thanh toán' },
      { action: 'hr', label: 'Nhân Sự', description: 'Gửi email onboarding / phỏng vấn / hợp đồng' },
      { action: 'account', label: 'Tài Khoản', description: 'Gửi email thông tin tài khoản nội bộ' },
      { action: 'internal', label: 'Nội Bộ', description: 'Gửi email nội bộ (sinh nhật, mời họp…)' },
      { action: 'manage', label: 'Quản lý template', description: 'Sửa / tạo / xóa template email' },
    ],
    order: 22,
  },
  {
    id: 'my-hr',
    name: 'Hợp Đồng & Hồ Sơ',
    icon: '📋',
    color: '#0EA5E9',
    description: 'Tự phục vụ: xem hợp đồng & hồ sơ cá nhân, gửi yêu cầu đổi hồ sơ',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem hợp đồng & hồ sơ của mình' },
      { action: 'create', label: 'Gửi yêu cầu', description: 'Gửi yêu cầu đổi hồ sơ' },
    ],
    order: 18,
  },
  {
    id: 'solace',
    name: 'Quán Cà Phê Solace',
    icon: '☕',
    color: '#8B4513',
    description: 'Quán cà phê nội bộ: đặt món, ví tín dụng, bán hàng (POS), kho & minigame',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Truy cập khu vận hành quán Solace' },
    ],
    children: [
      {
        id: 'solace-pos',
        name: 'Bán Hàng (POS)',
        icon: '🧾',
        description: 'Tạo & xử lý đơn tại quầy, thu tiền, in hoá đơn',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'solace-menu',
        name: 'Thực Đơn & Công Thức',
        icon: '📋',
        description: 'Quản lý danh mục, món, tuỳ chọn & công thức pha chế',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'solace-inventory',
        name: 'Kho Nguyên Liệu',
        icon: '📦',
        description: 'Nguyên liệu, nhập/xuất/điều chỉnh kho, kiểm kê',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'solace-wallet',
        name: 'Ví & Nạp Tiền',
        icon: '💳',
        description: 'Quản lý ví tín dụng, nạp tiền, giao dịch',
        permissions: [A.view, A.create, A.edit],
      },
      {
        id: 'solace-debt',
        name: 'Công Nợ',
        icon: '📒',
        description: 'Theo dõi & thu công nợ thành viên',
        permissions: [A.view, A.edit],
      },
      {
        id: 'solace-minigame',
        name: 'Minigame Quà Tặng',
        icon: '🎁',
        description: 'Cấu hình minigame & kho quà tặng',
        permissions: [A.view, A.create, A.edit],
      },
      {
        id: 'solace-reports',
        name: 'Báo Cáo Quán',
        icon: '📈',
        description: 'Doanh thu, giá vốn, tiêu hao nguyên liệu, kết ca',
        permissions: [A.view, A.export],
      },
      {
        id: 'solace-cash',
        name: 'Sổ Quỹ Quán',
        icon: '💵',
        description: 'Số dư tiền mặt & ngân hàng, thu/chi, mua nguyên liệu, chuyển quỹ, kiểm quỹ',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
      {
        id: 'solace-settings',
        name: 'Cấu Hình Quán',
        icon: '⚙️',
        description: 'Giờ hoạt động, ca làm, hạn mức nợ, người nhận thông báo, ngân hàng',
        permissions: [A.view, A.edit],
      },
      {
        id: 'solace-marketing',
        name: 'Marketing',
        icon: '📣',
        description: 'Soạn & gửi bài quảng bá tới khách đã liên kết bot Solace qua Telegram',
        permissions: [A.view, A.create, A.edit, A.delete],
      },
    ],
    order: 20,
  },
  // Chi Phí — tạo/duyệt/thảo luận chi phí, nối Kế toán (docs/technical/expense-module-roadmap.md).
  // Quyền create xét PER-COMPANY qua membership (11.0); approve còn gate theo chuỗi/rule duyệt.
  {
    id: 'expense',
    name: 'Chi Phí',
    icon: '💸',
    color: '#F59E0B',
    description: 'Đề nghị chi phí: tạo, duyệt phân cấp theo hạn mức, trao đổi, nối Kế toán',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem phiếu chi trong phạm vi của mình' },
      { action: 'create', label: 'Tạo', description: 'Tạo/sửa phiếu chi (theo công ty được gán)' },
      { action: 'approve', label: 'Duyệt', description: 'Duyệt phiếu chi (theo chuỗi/hạn mức được ráp)' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất danh sách phiếu chi' },
      { action: 'delete', label: 'Xóa', description: 'Xóa phiếu chi tạo sai khi còn ở nháp hoặc bị từ chối' },
      { action: 'manage', label: 'Cấu hình', description: 'Danh mục loại chi phí, quy tắc duyệt, quy tắc số phiếu' },
    ],
    order: 23,
  },
  // KPI & Đánh giá — cách ly theo company_id (kể cả admin), 3 tầng: tự nhận xét → quản lý → cấp cao chốt.
  {
    id: 'kpi',
    name: 'KPI & Đánh Giá',
    icon: '🎯',
    color: '#8B5CF6',
    description: 'Chỉ tiêu KPI theo kỳ, tự nhận xét — quản lý đánh giá — cấp cao chốt điểm, xếp hạng hiệu suất',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem phiếu KPI trong phạm vi của mình' },
      { action: 'create', label: 'Tự nhận xét', description: 'Nộp tự nhận xét kết quả công việc theo chỉ tiêu' },
      { action: 'approve', label: 'Quản lý đánh giá', description: 'Chấm điểm/nhận xét cho nhân viên cấp dưới' },
      { action: 'conclude', label: 'Chốt điểm cấp cao', description: 'Đánh giá/chốt điểm cuối cùng (vd Giám đốc)' },
      { action: 'export', label: 'Xuất dữ liệu', description: 'Xuất báo cáo KPI theo kỳ' },
      { action: 'manage', label: 'Cấu hình', description: 'Bộ chỉ tiêu mẫu, chu kỳ đánh giá, tích hợp, bật xếp hạng' },
    ],
    order: 24,
  },
  // Warehouse — quản lý công nhân kho/xưởng (mini-site /warehouse).
  // ⚠️ Quyền NGHIÊM NGẶT: KHÔNG bypass super_admin — ai không tick là không thấy/không làm được.
  // Luật nằm ở STRICT_RBAC_UNIT_IDS trong src/lib/rolePolicy.ts (menu, AppLayout,
  // Command Palette, App Launcher dùng chung); server chặn lại bằng lib/warehouse/adminGuard.
  {
    id: 'warehouse',
    name: 'Kho / Xưởng',
    icon: '🏭',
    color: '#F59E0B',
    description: 'Quản lý công nhân kho: chấm công GPS+ảnh, sản lượng, xếp hạng, duyệt yêu cầu (mini-site /warehouse)',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem tổng quan kho + dữ liệu công/sản lượng' },
      { action: 'create', label: 'Thêm', description: 'Tạo tài khoản công nhân, ca, sản phẩm, đăng tin' },
      { action: 'edit', label: 'Sửa', description: 'Sửa giờ công, nhập sản lượng, duyệt yêu cầu, cấu hình kho' },
      { action: 'delete', label: 'Xóa', description: 'Ngưng công nhân, xóa tin' },
    ],
    order: 25,
  },
  // Pháp Chế — pháp lý doanh nghiệp VN: giấy phép/văn bản, lịch tuân thủ, hợp đồng
  // thương mại, ủy quyền + sổ con dấu. Mô hình TẬP TRUNG: ai có quyền thấy MỌI công ty
  // (không cách ly theo company switcher — đầu mối pháp chế tập đoàn).
  // ⚠️ Quyền NGHIÊM NGẶT như warehouse: không tick là không thấy menu.
  {
    id: 'legal',
    name: 'Pháp Chế',
    icon: '⚖️',
    color: '#0EA5E9',
    description: 'Giấy phép & văn bản pháp lý, lịch tuân thủ, hợp đồng thương mại, ủy quyền, sổ con dấu — mọi công ty',
    permissions: [
      { action: 'view', label: 'Xem', description: 'Xem sổ văn bản, lịch tuân thủ, hợp đồng, ủy quyền của mọi công ty' },
      { action: 'create', label: 'Thêm', description: 'Thêm văn bản, hợp đồng, ủy quyền, ghi sổ con dấu' },
      { action: 'edit', label: 'Sửa', description: 'Sửa bản ghi, đổi trạng thái, đánh dấu đã nộp, quản lý danh mục loại văn bản' },
      { action: 'delete', label: 'Xóa', description: 'Xóa bản ghi & file đính kèm' },
      { action: 'lock', label: 'Đặt khóa', description: 'Đặt/gỡ mật khẩu bảo mật từng hồ sơ; người có quyền này mở hồ sơ khóa không cần nhập mật khẩu' },
    ],
    order: 26,
  },
  // BMHS — quyền quản trị Bảo Mật Hồ Sơ (đặt/reset mật khẩu khóa hồ sơ, xem/tải không cần nhập).
  // Nhãn cố ý viết tắt "BMHS" cho kín đáo. CHỈ hiển thị/gán được cho super_admin (lọc ở PermissionsPanel).
  {
    id: 'bmhs',
    name: 'BMHS',
    icon: '🛡️',
    color: '#64748B',
    description: 'Quản trị Bảo Mật Hồ Sơ — bật/tắt khóa, đặt/đổi/reset mật khẩu, xem/tải hồ sơ đã khóa',
    permissions: [
      { action: 'manage', label: 'Quản lý', description: 'Bật/tắt khóa hồ sơ, đặt/đổi/reset mật khẩu, xem-tải hồ sơ đã khóa không cần nhập' },
    ],
    order: 99,
  },
];

/** Module chỉ super_admin mới thấy/gán được (ẩn khỏi ma trận quyền của vai trò khác). */
export const SUPER_ADMIN_ONLY_MODULE_IDS = ['bmhs'];

export interface UserModulePermissions {
  [moduleId: string]: PermissionAction[];
}

/** Modules every authenticated employee can use for their own work/data. */
export const SELF_SERVICE_MODULE_IDS = [
  'tickets',
  'tasks',
  'room-bookings',
  'cham-cong',
  'tra-cuu',
  'my-hr',
  'email-signature',
  'qr',
  'solace',
  'settings',
  'notifications',
  'kpi',
] as const;

/** Extra workflow modules that are intrinsic to the Manager role. */
export const MANAGER_CORE_MODULE_IDS = [
  'dashboard',
  'duyet-yeu-cau',
  'recruitment-order',
] as const;

export function getModuleById(id: string): Module | undefined {
  return MODULES.find(m => m.id === id);
}

/** Tìm module con theo id (duyệt mọi module). */
export function getModuleChildById(id: string): ModuleChild | undefined {
  for (const m of MODULES) {
    const child = m.children?.find(c => c.id === id);
    if (child) return child;
  }
  return undefined;
}

/** Trả id module mẹ của một module con (undefined nếu không phải module con). */
export function getParentModuleId(childId: string): string | undefined {
  for (const m of MODULES) {
    if (m.children?.some(c => c.id === childId)) return m.id;
  }
  return undefined;
}

export function getPermissionsByModule(moduleId: string): ModulePermission[] {
  const module = getModuleById(moduleId);
  if (module) return module.permissions;
  return getModuleChildById(moduleId)?.permissions || [];
}

/** Danh sách phẳng mọi đơn vị phân quyền (module mẹ + con) — dùng cho preset & thống kê. */
export function getAllPermissionUnits(): { id: string; name: string; description: string; icon?: string; color?: string; permissions: ModulePermission[] }[] {
  const units: { id: string; name: string; description: string; icon?: string; color?: string; permissions: ModulePermission[] }[] = [];
  for (const m of MODULES) {
    units.push({ id: m.id, name: m.name, description: m.description, icon: m.icon, color: m.color, permissions: m.permissions });
    for (const c of m.children || []) units.push({ id: c.id, name: c.name, description: c.description, icon: c.icon, color: m.color, permissions: c.permissions });
  }
  return units;
}

/**
 * Module MẶC ĐỊNH TẮT cho MỌI vai trò — kể cả super_admin mới tạo / nút "reset về
 * mặc định" / quyền mẫu. Dữ liệu tối nhạy cảm: chỉ được cấp bằng cách TICK ĐÍCH DANH
 * trong ma trận Phân Quyền (yêu cầu của user cho Pháp Chế).
 */
export const DEFAULT_OFF_MODULE_IDS = ['legal'];

// Mặc định quyền dựa trên vai trò
export function getDefaultPermissions(role: 'super_admin' | 'admin' | 'manager' | 'user'): UserModulePermissions {
  const units = getAllPermissionUnits();
  const permissions: UserModulePermissions = Object.fromEntries(
    units.map(unit => [unit.id, [] as PermissionAction[]])
  );

  if (role === 'super_admin') {
    for (const unit of units) {
      if (DEFAULT_OFF_MODULE_IDS.includes(unit.id)) continue;  // giữ [] — phải tick tay
      permissions[unit.id] = unit.permissions.map(permission => permission.action);
    }
    return permissions;
  }

  const grant = (unitId: string, actions: PermissionAction[]) => {
    const supported = new Set(getPermissionsByModule(unitId).map(permission => permission.action));
    permissions[unitId] = actions.filter(action => supported.has(action));
  };

  // Self-service baseline. Data scope is enforced separately by the server.
  grant('tickets', ['view', 'create', 'edit']);
  grant('tasks', ['view', 'edit']);
  grant('room-bookings', ['view', 'create', 'edit', 'delete']);
  grant('cham-cong', ['view', 'create', 'edit']);
  grant('cham-cong-checkin', ['view', 'create']);
  grant('cham-cong-lookup', ['view']);
  grant('tra-cuu', ['view']);
  grant('tra-cuu-dau-moi', ['view']);
  grant('tra-cuu-tai-san', ['view']);
  grant('tra-cuu-van-ban', ['view']);
  grant('tra-cuu-thong-bao', ['view']);
  grant('tra-cuu-lich-su', ['view']);
  grant('my-hr', ['view', 'create']);
  grant('email-signature', ['view', 'edit']);
  grant('solace', ['view']);
  grant('settings', ['view', 'edit']);

  if (role === 'manager') {
    grant('dashboard', ['view']);
    grant('tasks', ['view', 'create', 'edit']);
    grant('duyet-yeu-cau', ['view', 'approve']);
    grant('recruitment-order', ['view', 'create', 'edit', 'delete', 'notify']);
    grant('cham-cong', ['view', 'create', 'edit', 'approve']);
  }

  // Admin deliberately receives only the self-service baseline here.
  // Operational/admin modules must come from the role template or an explicit grant.
  return permissions;
}

/**
 * Merge mandatory role capabilities with explicit grants.
 * Explicit grants may add modules, but cannot remove the self-service baseline
 * or the workflow capabilities intrinsic to Manager.
 */
export function getEffectiveRolePermissions(
  role: 'super_admin' | 'admin' | 'manager' | 'user',
  explicit?: UserModulePermissions | null
): UserModulePermissions {
  const baseline = getDefaultPermissions(role);
  if (role === 'super_admin') {
    // Baseline super_admin = mọi module TRỪ nhóm DEFAULT_OFF (vd 'legal').
    // Với nhóm đó, quyền TICK ĐÍCH DANH trong ma trận Phân Quyền mới có hiệu lực —
    // nếu bỏ qua explicit ở đây thì super_admin tick cũng không bao giờ dùng được.
    const effective = { ...baseline };
    for (const id of DEFAULT_OFF_MODULE_IDS) {
      const actions = explicit?.[id];
      if (Array.isArray(actions) && actions.length) effective[id] = [...actions];
    }
    return effective;
  }

  const effective: UserModulePermissions = {};
  const unitIds = new Set([...Object.keys(baseline), ...Object.keys(explicit || {})]);
  for (const unitId of unitIds) {
    // Đã cấu hình đích danh cho đơn vị này (KỂ CẢ mảng rỗng = cố ý bỏ tick) → tôn trọng cấu hình.
    // Trước đây hợp nhất (union) với baseline nên bỏ tick không bao giờ có tác dụng:
    // vd bỏ 'cham-cong-checkin' vẫn bị baseline trả lại ['view','create'] → thẻ Chấm Công vẫn hiện.
    // Đơn vị KHÔNG có trong cấu hình → giữ nguyên baseline của vai trò (không khóa nhầm).
    const explicitActions = explicit?.[unitId];
    effective[unitId] = Array.isArray(explicitActions)
      ? Array.from(new Set(explicitActions))
      : [...(baseline[unitId] || [])];
  }
  return effective;
}
