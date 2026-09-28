// Multi-language support
export type Language = 'vi' | 'en' | 'zh';

export const translations: Record<Language, Record<string, string>> = {
  vi: {
    // Settings
    'settings.title': 'Cài Đặt',
    'settings.subtitle': 'Quản lý tài khoản và cài đặt ứng dụng',
    'settings.general': 'Cài Đặt Chung',
    'settings.general.subtitle': 'Quản lý cài đặt ứng dụng chung',
    'settings.profile': 'Thông Tin Cá Nhân',
    'settings.security': 'Bảo Mật',
    'settings.notifications': 'Thông Báo',
    'settings.sessions': 'Phiên Đăng Nhập',

    // General Settings
    'general.language': 'Ngôn Ngữ',
    'general.theme': 'Giao Diện',
    'general.autosave': 'Lưu tự động',
    'general.save': 'Lưu Cài Đặt',

    // Language & Theme Options
    'language.vi': 'Tiếng Việt',
    'language.en': 'English',
    'language.zh': '中文',
    'theme.light': 'Sáng',
    'theme.dark': 'Tối',
    'theme.auto': 'Tự động',

    // Messages
    'message.saved': 'Cài đặt đã được lưu',
    'message.error': 'Có lỗi xảy ra',
  },
  en: {
    // Settings
    'settings.title': 'Settings',
    'settings.subtitle': 'Manage your account and application settings',
    'settings.general': 'General Settings',
    'settings.general.subtitle': 'Manage general application settings',
    'settings.profile': 'Personal Information',
    'settings.security': 'Security',
    'settings.notifications': 'Notifications',
    'settings.sessions': 'Login Sessions',

    // General Settings
    'general.language': 'Language',
    'general.theme': 'Theme',
    'general.autosave': 'Auto-save',
    'general.save': 'Save Settings',

    // Language & Theme Options
    'language.vi': 'Tiếng Việt',
    'language.en': 'English',
    'language.zh': '中文',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.auto': 'Auto',

    // Messages
    'message.saved': 'Settings saved',
    'message.error': 'An error occurred',
  },
  zh: {
    // Settings
    'settings.title': '设置',
    'settings.subtitle': '管理您的账户和应用程序设置',
    'settings.general': '常规设置',
    'settings.general.subtitle': '管理常规应用程序设置',
    'settings.profile': '个人信息',
    'settings.security': '安全',
    'settings.notifications': '通知',
    'settings.sessions': '登录会话',

    // General Settings
    'general.language': '语言',
    'general.theme': '主题',
    'general.autosave': '自动保存',
    'general.save': '保存设置',

    // Language & Theme Options
    'language.vi': 'Tiếng Việt',
    'language.en': 'English',
    'language.zh': '中文',
    'theme.light': '浅色',
    'theme.dark': '深色',
    'theme.auto': '自动',

    // Messages
    'message.saved': '设置已保存',
    'message.error': '发生错误',
  },
};

export function t(key: string, language: Language = 'vi'): string {
  return translations[language]?.[key] || key;
}
