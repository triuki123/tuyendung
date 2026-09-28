import { Ticket } from '@/lib/types/ticket';

export type AssetStatus = 'available' | 'assigned' | 'maintenance' | 'broken' | 'retired' | 'cho_mua' | 'dang_mua';
export type AssetCategory = 'Laptop' | 'Màn hình' | 'Điện thoại' | 'Máy in' | 'Máy tính bảng' | 'Thiết bị mạng' | 'Máy chủ' | 'Phụ kiện';
export type UserRole = 'super_admin' | 'admin' | 'manager' | 'user';

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  avatar: string;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  category: AssetCategory;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: AssetStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  company: string | null;
  division: string | null;
  department: string | null;
  purchaseDate: string | null;
  warrantyExpiry: string | null;
  warrantyStatus?: 'active' | 'expired' | 'none' | null;
  warrantyMonths?: number | null;
  value: number | null;
  condition: string | null;
  location: string | null;
  notes: string | null;
  imageUrl: string;
  history: AssetHistoryEntry[];
  // Tên hiển thị (resolve qua JOIN ở API) — UI luôn ưu tiên các field này thay vì id
  categoryName?: string | null;
  companyName?: string | null;
  divisionName?: string | null;
  departmentName?: string | null;
}

export interface AssetHistoryEntry {
  id: string;
  date: string;
  action: string;
  performedBy: string;
  note: string;
}


export interface Task {
  id: string;
  code: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assignedTo: string;
  assignedToName: string;
  createdBy: string;
  dueDate: string;
  createdAt: string;
  relatedAsset?: string;
}

export interface DeleteRequest {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  department: string;
  position?: string;
  avatar: string;
  phone?: string;
  bio?: string;
  tags?: string[];
  status: 'active' | 'inactive';
  last_login?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export const MOCK_USERS: MockUser[] = [
  {
    id: 'usr-001',
    email: 'superadmin@assetflowpro.vn',
    name: 'Nguyễn Văn Hùng',
    role: 'super_admin',
    roleLabel: 'Super Admin',
    department: 'Ban Giám Đốc',
    position: 'Giám Đốc',
    avatar: 'NH',
    phone: '0901234567',
    bio: 'Giám đốc điều hành',
    status: 'active',
    last_login: '2026-05-13T10:30:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-05-13T10:30:00Z',
    created_by: 'system',
    updated_by: 'system',
  },
  {
    id: 'usr-002',
    email: 'hr.admin@assetflowpro.vn',
    name: 'Trần Thị Minh Châu',
    role: 'admin',
    roleLabel: 'Admin',
    department: 'Nhân Sự',
    position: 'Trưởng Phòng HR',
    avatar: 'MC',
    phone: '0912345678',
    bio: 'Quản lý nhân sự',
    tags: ['Tuyển Dụng', 'Pháp Lý', 'Nhân Sự'],
    status: 'active',
    last_login: '2026-05-12T15:45:00Z',
    created_at: '2026-01-05T08:00:00Z',
    updated_at: '2026-05-12T15:45:00Z',
    created_by: 'usr-001',
    updated_by: 'usr-001',
  },
  {
    id: 'usr-003',
    email: 'it.admin@assetflowpro.vn',
    name: 'Lê Quốc Bảo',
    role: 'admin',
    roleLabel: 'Admin',
    department: 'Công Nghệ Thông Tin',
    position: 'Trưởng Phòng IT',
    avatar: 'QB',
    phone: '0923456789',
    bio: 'Quản lý công nghệ thông tin',
    tags: ['IT Helpdesk', 'Mạng', 'Máy chủ'],
    status: 'active',
    last_login: '2026-05-13T08:15:00Z',
    created_at: '2026-01-10T09:30:00Z',
    updated_at: '2026-05-13T08:15:00Z',
    created_by: 'usr-001',
    updated_by: 'usr-001',
  },
  {
    id: 'usr-004',
    email: 'user@assetflowpro.vn',
    name: 'Phạm Thị Lan Anh',
    role: 'user',
    roleLabel: 'Người Dùng',
    department: 'Kế Toán',
    position: 'Kế Toán Trưởng',
    avatar: 'LA',
    phone: '0934567890',
    bio: 'Chuyên viên kế toán',
    status: 'active',
    last_login: '2026-05-11T14:20:00Z',
    created_at: '2026-02-15T10:00:00Z',
    updated_at: '2026-05-11T14:20:00Z',
    created_by: 'usr-002',
    updated_by: 'usr-002',
  },
];

export const COMPANIES = [
  'AssetFlow Pro Vietnam',
  'AssetFlow Pro Singapore',
  'AssetFlow Pro Thailand',
];

export const DIVISIONS = [
  'Công Nghệ',
  'Hành Chính',
  'Tài Chính',
  'Sản Xuất',
  'Bán Hàng',
];

export const DEPARTMENTS = [
  'Ban Giám Đốc',
  'Công Nghệ Thông Tin',
  'Nhân Sự',
  'Kế Toán',
  'Kinh Doanh',
  'Marketing',
  'Vận Hành',
  'Pháp Lý',
];

export const EMPLOYEES: Employee[] = [
  { id: 'emp-001', name: 'Nguyễn Văn Hùng', email: 'hung.nv@company.vn', department: 'Ban Giám Đốc', position: 'Giám Đốc', avatar: 'NH' },
  { id: 'emp-002', name: 'Trần Thị Minh Châu', email: 'chau.ttm@company.vn', department: 'Nhân Sự', position: 'Trưởng Phòng HR', avatar: 'MC' },
  { id: 'emp-003', name: 'Lê Quốc Bảo', email: 'bao.lq@company.vn', department: 'Công Nghệ Thông Tin', position: 'Trưởng Phòng IT', avatar: 'QB' },
  { id: 'emp-004', name: 'Phạm Thị Lan Anh', email: 'anh.ptl@company.vn', department: 'Kế Toán', position: 'Kế Toán Trưởng', avatar: 'LA' },
  { id: 'emp-005', name: 'Hoàng Minh Tuấn', email: 'tuan.hm@company.vn', department: 'Kinh Doanh', position: 'Trưởng Phòng Kinh Doanh', avatar: 'MT' },
  { id: 'emp-006', name: 'Đặng Thị Thu Hà', email: 'ha.dtt@company.vn', department: 'Marketing', position: 'Marketing Manager', avatar: 'TH' },
  { id: 'emp-007', name: 'Vũ Đức Thắng', email: 'thang.vd@company.vn', department: 'Vận Hành', position: 'Trưởng Vận Hành', avatar: 'DT' },
  { id: 'emp-008', name: 'Ngô Thị Bích Ngọc', email: 'ngoc.ntb@company.vn', department: 'Pháp Lý', position: 'Luật Sư Nội Bộ', avatar: 'BN' },
  { id: 'emp-009', name: 'Trương Công Minh', email: 'minh.tc@company.vn', department: 'Công Nghệ Thông Tin', position: 'Senior Developer', avatar: 'CM' },
  { id: 'emp-010', name: 'Bùi Thị Thanh Huyền', email: 'huyen.btt@company.vn', department: 'Kinh Doanh', position: 'Sales Executive', avatar: 'TH' },
];

export const MOCK_ASSETS: Asset[] = [
  {
    id: 'asset-001',
    code: 'AF-IT-2026-001',
    name: 'Dell Latitude 5540',
    category: 'Laptop',
    brand: 'Dell',
    model: 'Latitude 5540',
    serialNumber: 'DL5540-VN-20240312',
    status: 'assigned',
    assignedTo: 'emp-003',
    assignedToName: 'Lê Quốc Bảo',
    company: 'AssetFlow Pro Vietnam',
    division: 'Công Nghệ',
    department: 'Công Nghệ Thông Tin',
    purchaseDate: '2024-03-12',
    warrantyExpiry: '2027-03-12',
    value: 28500000,
    condition: 'Tốt',
    location: 'Tầng 4 - Phòng IT',
    notes: 'Máy chủ phát triển chính của team IT',
    imageUrl: '',
    history: [
      { id: 'h-001-1', date: '2024-03-12', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Nhận từ nhà cung cấp Dell Vietnam' },
      { id: 'h-001-2', date: '2024-03-15', action: 'Phân bổ', performedBy: 'Nguyễn Văn Hùng', note: 'Cấp cho Trưởng Phòng IT' },
      { id: 'h-001-3', date: '2025-01-10', action: 'Bảo trì', performedBy: 'Lê Quốc Bảo', note: 'Nâng cấp RAM 32GB' },
    ],
  },
  {
    id: 'asset-002',
    code: 'AF-IT-2026-002',
    name: 'MacBook Pro 14" M3',
    category: 'Laptop',
    brand: 'Apple',
    model: 'MacBook Pro 14 M3',
    serialNumber: 'FVFXQ2MNVN1',
    status: 'assigned',
    assignedTo: 'emp-009',
    assignedToName: 'Trương Công Minh',
    company: 'AssetFlow Pro Vietnam',
    division: 'Công Nghệ',
    department: 'Công Nghệ Thông Tin',
    purchaseDate: '2024-06-20',
    warrantyExpiry: '2027-06-20',
    value: 52000000,
    condition: 'Rất tốt',
    location: 'Tầng 4 - Phòng IT',
    notes: 'Máy lập trình iOS/macOS',
    imageUrl: '',
    history: [
      { id: 'h-002-1', date: '2024-06-20', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Mua từ Apple Premium Reseller' },
      { id: 'h-002-2', date: '2024-06-22', action: 'Phân bổ', performedBy: 'Lê Quốc Bảo', note: 'Cấp cho Senior Developer' },
    ],
  },
  {
    id: 'asset-003',
    code: 'AF-IT-2026-003',
    name: 'HP EliteBook 840 G10',
    category: 'Laptop',
    brand: 'HP',
    model: 'EliteBook 840 G10',
    serialNumber: 'HP840G10-VN-0891',
    status: 'available',
    assignedTo: null,
    assignedToName: null,
    company: 'AssetFlow Pro Vietnam',
    division: 'Công Nghệ',
    department: 'Công Nghệ Thông Tin',
    purchaseDate: '2024-09-05',
    warrantyExpiry: '2027-09-05',
    value: 24800000,
    condition: 'Mới',
    location: 'Kho IT - Tầng 4',
    notes: 'Dự phòng cho nhân viên mới',
    imageUrl: '',
    history: [
      { id: 'h-003-1', date: '2024-09-05', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Mua bổ sung Q3/2024' },
    ],
  },
  {
    id: 'asset-004',
    code: 'AF-HR-2026-001',
    name: 'Lenovo ThinkPad X1 Carbon',
    category: 'Laptop',
    brand: 'Lenovo',
    model: 'ThinkPad X1 Carbon Gen 11',
    serialNumber: 'LNV-X1C11-20240218',
    status: 'assigned',
    assignedTo: 'emp-002',
    assignedToName: 'Trần Thị Minh Châu',
    company: 'AssetFlow Pro Vietnam',
    division: 'Hành Chính',
    department: 'Nhân Sự',
    purchaseDate: '2024-02-18',
    warrantyExpiry: '2027-02-18',
    value: 31200000,
    condition: 'Tốt',
    location: 'Tầng 3 - Phòng HR',
    notes: 'Máy của Trưởng Phòng HR',
    imageUrl: '',
    history: [
      { id: 'h-004-1', date: '2024-02-18', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Nhận từ nhà cung cấp Lenovo' },
      { id: 'h-004-2', date: '2024-02-20', action: 'Phân bổ', performedBy: 'Nguyễn Văn Hùng', note: 'Cấp cho Trưởng Phòng HR' },
    ],
  },
  {
    id: 'asset-005',
    code: 'AF-IT-2026-004',
    name: 'Dell UltraSharp U2722D',
    category: 'Màn hình',
    brand: 'Dell',
    model: 'UltraSharp U2722D',
    serialNumber: 'DELU2722-VN-1204',
    status: 'assigned',
    assignedTo: 'emp-003',
    assignedToName: 'Lê Quốc Bảo',
    company: 'AssetFlow Pro Vietnam',
    division: 'Công Nghệ',
    department: 'Công Nghệ Thông Tin',
    purchaseDate: '2024-03-12',
    warrantyExpiry: '2027-03-12',
    value: 9800000,
    condition: 'Tốt',
    location: 'Tầng 4 - Phòng IT',
    notes: 'Màn hình phụ 27 inch 4K',
    imageUrl: '',
    history: [
      { id: 'h-005-1', date: '2024-03-12', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Mua kèm laptop' },
    ],
  },
  {
    id: 'asset-006',
    code: 'AF-IT-2026-005',
    name: 'iPhone 15 Pro',
    category: 'Điện thoại',
    brand: 'Apple',
    model: 'iPhone 15 Pro 256GB',
    serialNumber: 'IPHONE15P-VN-0056',
    status: 'assigned',
    assignedTo: 'emp-001',
    assignedToName: 'Nguyễn Văn Hùng',
    company: 'AssetFlow Pro Vietnam',
    division: 'Hành Chính',
    department: 'Ban Giám Đốc',
    purchaseDate: '2024-01-15',
    warrantyExpiry: '2026-01-15',
    value: 29900000,
    condition: 'Rất tốt',
    location: 'Văn Phòng Giám Đốc',
    notes: 'Điện thoại công tác của Giám Đốc',
    imageUrl: '',
    history: [
      { id: 'h-006-1', date: '2024-01-15', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Mua mới' },
      { id: 'h-006-2', date: '2024-01-16', action: 'Phân bổ', performedBy: 'Lê Quốc Bảo', note: 'Cấp cho Giám Đốc' },
    ],
  },
  {
    id: 'asset-007',
    code: 'AF-IT-2026-006',
    name: 'HP LaserJet Pro M404dn',
    category: 'Máy in',
    brand: 'HP',
    model: 'LaserJet Pro M404dn',
    serialNumber: 'HPLJ404-VN-0023',
    status: 'maintenance',
    assignedTo: null,
    assignedToName: null,
    company: 'AssetFlow Pro Vietnam',
    division: 'Hành Chính',
    department: 'Nhân Sự',
    purchaseDate: '2023-06-10',
    warrantyExpiry: '2026-06-10',
    value: 8500000,
    condition: 'Cần bảo trì',
    location: 'Tầng 3 - Phòng HR',
    notes: 'Đang bảo trì thay mực',
    imageUrl: '',
    history: [
      { id: 'h-007-1', date: '2023-06-10', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Mua mới' },
      { id: 'h-007-2', date: '2026-01-20', action: 'Bảo trì', performedBy: 'Lê Quốc Bảo', note: 'Thay mực in' },
    ],
  },
  {
    id: 'asset-008',
    code: 'AF-IT-2026-007',
    name: 'Cisco Catalyst 2960',
    category: 'Thiết bị mạng',
    brand: 'Cisco',
    model: 'Catalyst 2960-X',
    serialNumber: 'CISCO2960-VN-001',
    status: 'assigned',
    assignedTo: 'emp-003',
    assignedToName: 'Lê Quốc Bảo',
    company: 'AssetFlow Pro Vietnam',
    division: 'Công Nghệ',
    department: 'Công Nghệ Thông Tin',
    purchaseDate: '2023-01-05',
    warrantyExpiry: '2028-01-05',
    value: 45000000,
    condition: 'Tốt',
    location: 'Server Room - Tầng 4',
    notes: 'Switch core của toàn bộ hệ thống mạng',
    imageUrl: '',
    history: [
      { id: 'h-008-1', date: '2023-01-05', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Mua mới' },
    ],
  },
  {
    id: 'asset-009',
    code: 'AF-IT-2026-008',
    name: 'Dell PowerEdge R740',
    category: 'Máy chủ',
    brand: 'Dell',
    model: 'PowerEdge R740',
    serialNumber: 'DELLR740-VN-001',
    status: 'assigned',
    assignedTo: 'emp-003',
    assignedToName: 'Lê Quốc Bảo',
    company: 'AssetFlow Pro Vietnam',
    division: 'Công Nghệ',
    department: 'Công Nghệ Thông Tin',
    purchaseDate: '2022-08-15',
    warrantyExpiry: '2027-08-15',
    value: 180000000,
    condition: 'Tốt',
    location: 'Server Room - Tầng 4',
    notes: 'Máy chủ chính của hệ thống',
    imageUrl: '',
    history: [
      { id: 'h-009-1', date: '2022-08-15', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Mua mới' },
    ],
  },
  {
    id: 'asset-010',
    code: 'AF-KT-2026-001',
    name: 'iPad Pro 12.9" M2',
    category: 'Máy tính bảng',
    brand: 'Apple',
    model: 'iPad Pro 12.9 M2',
    serialNumber: 'IPADPRO-VN-0034',
    status: 'broken',
    assignedTo: 'emp-004',
    assignedToName: 'Phạm Thị Lan Anh',
    company: 'AssetFlow Pro Vietnam',
    division: 'Tài Chính',
    department: 'Kế Toán',
    purchaseDate: '2023-11-20',
    warrantyExpiry: '2025-11-20',
    value: 32000000,
    condition: 'Hỏng màn hình',
    location: 'Tầng 2 - Phòng Kế Toán',
    notes: 'Màn hình bị vỡ, cần sửa chữa',
    imageUrl: '',
    history: [
      { id: 'h-010-1', date: '2023-11-20', action: 'Nhập kho', performedBy: 'Lê Quốc Bảo', note: 'Mua mới' },
      { id: 'h-010-2', date: '2025-12-01', action: 'Báo hỏng', performedBy: 'Phạm Thị Lan Anh', note: 'Màn hình bị vỡ do va đập' },
    ],
  },
];

export const MOCK_TICKETS: Ticket[] = [
  {
    id: 'ticket-001',
    code: 'TK-2026-001',
    title: 'Laptop không khởi động được',
    description: 'Máy tính Dell Latitude 5540 không thể khởi động, màn hình đen hoàn toàn sau khi bấm nút nguồn.',
    asset_code: 'AF-IT-2026-001',
    asset_name: 'Dell Latitude 5540',
    priority: 'critical',
    status: 'open',
    created_by: 'usr-004',
    created_by_name: 'Phạm Thị Lan Anh',
    support_category: 'IT Helpdesk',
    created_at: '2026-05-10T08:30:00',
    updated_at: '2026-05-10T08:30:00',
  },
  {
    id: 'ticket-002',
    code: 'TK-2026-002',
    title: 'Máy in hết mực',
    description: 'Máy in HP LaserJet tầng 3 đã hết mực, cần thay thế gấp để in tài liệu quan trọng.',
    asset_code: 'AF-IT-2026-006',
    asset_name: 'HP LaserJet Pro M404dn',
    priority: 'medium',
    status: 'in_progress',
    created_by: 'usr-002',
    created_by_name: 'Trần Thị Minh Châu',
    support_category: 'IT Helpdesk',
    created_at: '2026-05-09T14:00:00',
    updated_at: '2026-05-10T09:00:00',
  },
  {
    id: 'ticket-003',
    code: 'TK-2026-003',
    title: 'Yêu cầu cấp laptop mới',
    description: 'Nhân viên mới cần được cấp laptop để làm việc. Vị trí: Senior Developer.',
    asset_code: '',
    asset_name: '',
    priority: 'high',
    status: 'open',
    created_by: 'usr-002',
    created_by_name: 'Trần Thị Minh Châu',
    support_category: 'IT Helpdesk',
    created_at: '2026-05-08T10:15:00',
    updated_at: '2026-05-08T10:15:00',
  },
  {
    id: 'ticket-004',
    code: 'TK-2026-004',
    title: 'iPad bị vỡ màn hình',
    description: 'iPad Pro của phòng kế toán bị vỡ màn hình do va đập, cần sửa chữa hoặc thay thế.',
    asset_code: 'AF-KT-2026-001',
    asset_name: 'iPad Pro 12.9" M2',
    priority: 'high',
    status: 'open',
    created_by: 'usr-004',
    created_by_name: 'Phạm Thị Lan Anh',
    support_category: 'IT Helpdesk',
    created_at: '2026-05-07T16:45:00',
    updated_at: '2026-05-07T16:45:00',
  },
  {
    id: 'ticket-005',
    code: 'TK-2026-005',
    title: 'Kết nối mạng chậm',
    description: 'Toàn bộ tầng 3 bị chậm mạng từ sáng nay, ảnh hưởng đến công việc.',
    asset_code: 'AF-IT-2026-007',
    asset_name: 'Cisco Catalyst 2960',
    priority: 'high',
    status: 'in_progress',
    created_by: 'usr-002',
    created_by_name: 'Trần Thị Minh Châu',
    support_category: 'Mạng',
    created_at: '2026-05-11T07:30:00',
    updated_at: '2026-05-11T09:00:00',
  },
  {
    id: 'ticket-006',
    code: 'TK-2026-006',
    title: 'Cài đặt phần mềm kế toán',
    description: 'Cần cài đặt phần mềm MISA Accounting 2026 cho máy tính phòng kế toán.',
    asset_code: 'AF-HR-2026-001',
    asset_name: 'Lenovo ThinkPad X1 Carbon',
    priority: 'low',
    status: 'resolved',
    created_by: 'usr-004',
    created_by_name: 'Phạm Thị Lan Anh',
    support_category: 'IT Helpdesk',
    created_at: '2026-05-05T11:00:00',
    updated_at: '2026-05-06T14:30:00',
  },
];

export const MOCK_TASKS: Task[] = [
  {
    id: 'task-001',
    code: 'TASK-2026-001',
    title: 'Kiểm kê tài sản Q2/2026',
    description: 'Thực hiện kiểm kê toàn bộ tài sản IT trong quý 2/2026, cập nhật trạng thái và vị trí.',
    priority: 'high',
    status: 'in_progress',
    assignedTo: 'usr-003',
    assignedToName: 'Lê Quốc Bảo',
    createdBy: 'usr-001',
    dueDate: '2026-06-30',
    createdAt: '2026-05-01T08:00:00',
  },
  {
    id: 'task-002',
    code: 'TASK-2026-002',
    title: 'Bảo trì định kỳ máy chủ',
    description: 'Thực hiện bảo trì định kỳ hệ thống máy chủ Dell PowerEdge, kiểm tra RAID và backup.',
    priority: 'high',
    status: 'todo',
    assignedTo: 'usr-003',
    assignedToName: 'Lê Quốc Bảo',
    createdBy: 'usr-001',
    dueDate: '2026-05-20',
    createdAt: '2026-05-01T08:00:00',
    relatedAsset: 'AF-IT-2026-008',
  },
  {
    id: 'task-003',
    code: 'TASK-2026-003',
    title: 'Cập nhật danh sách tài sản nhân sự',
    description: 'Rà soát và cập nhật danh sách tài sản được phân bổ cho phòng Nhân Sự.',
    priority: 'medium',
    status: 'done',
    assignedTo: 'usr-002',
    assignedToName: 'Trần Thị Minh Châu',
    createdBy: 'usr-001',
    dueDate: '2026-05-10',
    createdAt: '2026-04-28T09:00:00',
  },
  {
    id: 'task-004',
    code: 'TASK-2026-004',
    title: 'Mua sắm thiết bị Q3/2026',
    description: 'Lập kế hoạch và đề xuất mua sắm thiết bị IT cho quý 3/2026.',
    priority: 'medium',
    status: 'todo',
    assignedTo: 'usr-003',
    assignedToName: 'Lê Quốc Bảo',
    createdBy: 'usr-001',
    dueDate: '2026-06-15',
    createdAt: '2026-05-05T10:00:00',
  },
  {
    id: 'task-005',
    code: 'TASK-2026-005',
    title: 'Đào tạo sử dụng hệ thống AssetFlow',
    description: 'Tổ chức buổi đào tạo cho nhân viên mới về cách sử dụng hệ thống quản lý tài sản.',
    priority: 'low',
    status: 'cancelled',
    assignedTo: 'usr-002',
    assignedToName: 'Trần Thị Minh Châu',
    createdBy: 'usr-001',
    dueDate: '2026-05-15',
    createdAt: '2026-04-20T14:00:00',
  },
];

export const MOCK_DELETE_REQUESTS: DeleteRequest[] = [
  {
    id: 'del-001',
    assetId: 'asset-010',
    assetCode: 'AF-KT-2026-001',
    assetName: 'iPad Pro 12.9" M2',
    requestedBy: 'usr-003',
    requestedByName: 'Lê Quốc Bảo',
    requestedAt: '2026-05-10T10:00:00',
    reason: 'Tài sản hỏng nặng, chi phí sửa chữa cao hơn giá trị còn lại. Đề xuất thanh lý.',
    status: 'pending',
  },
];

export const MONTHLY_ASSET_DATA = [
  { month: 'T6/25', acquired: 3, retired: 0, total: 142 },
  { month: 'T7/25', acquired: 2, retired: 1, total: 143 },
  { month: 'T8/25', acquired: 5, retired: 0, total: 148 },
  { month: 'T9/25', acquired: 1, retired: 2, total: 147 },
  { month: 'T10/25', acquired: 4, retired: 0, total: 151 },
  { month: 'T11/25', acquired: 2, retired: 1, total: 152 },
  { month: 'T12/25', acquired: 6, retired: 0, total: 158 },
  { month: 'T1/26', acquired: 3, retired: 1, total: 160 },
  { month: 'T2/26', acquired: 2, retired: 0, total: 162 },
  { month: 'T3/26', acquired: 4, retired: 2, total: 164 },
  { month: 'T4/26', acquired: 5, retired: 1, total: 168 },
  { month: 'T5/26', acquired: 2, retired: 0, total: 170 },
];

export const DEPARTMENT_ASSET_DATA = [
  { department: 'IT', assets: 52, value: 485000000 },
  { department: 'Kinh Doanh', assets: 28, value: 220000000 },
  { department: 'HR', assets: 18, value: 145000000 },
  { department: 'Kế Toán', assets: 22, value: 168000000 },
  { department: 'Marketing', assets: 15, value: 132000000 },
  { department: 'Vận Hành', assets: 20, value: 156000000 },
  { department: 'BGĐ', assets: 8, value: 95000000 },
  { department: 'Pháp Lý', assets: 7, value: 58000000 },
];

export const STATUS_DISTRIBUTION = [
  { status: 'Đang dùng', count: 98, color: '#6366f1' },
  { status: 'Sẵn sàng', count: 42, color: '#10b981' },
  { status: 'Bảo trì', count: 18, color: '#f59e0b' },
  { status: 'Hỏng', count: 7, color: '#C62828' },
  { status: 'Thanh lý', count: 5, color: '#64748b' },
];

export function formatVND(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export const MOCK_ROOM_BOOKINGS = [
  {
    id: 'booking-001',
    room_name: 'Phòng họp tầng 3',
    booking_date: '2026-05-20',
    start_time: '09:00',
    end_time: '10:30',
    purpose: 'Họp định hướng Q2',
    requested_by: 'usr-004',
    requested_by_name: 'Phạm Thị Lan Anh',
    status: 'approved',
    approved_by: 'usr-003',
    approved_at: '2026-05-13',
  },
  {
    id: 'booking-002',
    room_name: 'Phòng họp tầng 2',
    booking_date: '2026-05-21',
    start_time: '14:00',
    end_time: '15:30',
    purpose: 'Review dự án X',
    requested_by: 'usr-004',
    requested_by_name: 'Phạm Thị Lan Anh',
    status: 'pending',
  },
];

export function generateAssetCode(category: string, department: string): string {
  const catMap: Record<string, string> = {
    'Laptop': 'IT', 'Màn hình': 'IT', 'Điện thoại': 'IT',
    'Máy in': 'IT', 'Máy tính bảng': 'IT', 'Thiết bị mạng': 'IT',
    'Máy chủ': 'IT', 'Phụ kiện': 'IT',
  };
  const deptMap: Record<string, string> = {
    'Công Nghệ Thông Tin': 'IT', 'Nhân Sự': 'HR', 'Kế Toán': 'ACC',
    'Kinh Doanh': 'BD', 'Marketing': 'MKT', 'Vận Hành': 'OPS',
    'Ban Giám Đốc': 'BOD', 'Pháp Lý': 'LEG',
  };
  const prefix = deptMap[department] || catMap[category] || 'GEN';
  const year = new Date().getFullYear();
  const num = String(Math.floor(Math.random() * 900) + 100);
  return `AF-${prefix}-${year}-${num}`;
}
