'use client';

import { Bell, Mail, MessageSquare } from 'lucide-react';

interface WatcherNotificationSettingsProps {
  userId: string;
  onSettingChange?: (setting: string, value: boolean) => Promise<void>;
}

export default function WatcherNotificationSettings({
  userId,
  onSettingChange,
}: WatcherNotificationSettingsProps) {
  const notificationOptions = [
    {
      id: 'telegram',
      label: 'Telegram',
      icon: MessageSquare,
      description: 'Nhận thông báo qua Telegram',
    },
    {
      id: 'email',
      label: 'Email',
      icon: Mail,
      description: 'Nhận thông báo qua email',
    },
  ];

  return (
    <div className="bg-white p-6 rounded border border-gray-200">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Bell className="w-4 h-4" />
        Cấu hình thông báo
      </h3>

      <div className="space-y-3">
        {notificationOptions.map((option) => {
          const Icon = option.icon;
          return (
            <label
              key={option.id}
              className="flex items-center gap-3 p-3 rounded border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <input
                type="checkbox"
                defaultChecked
                onChange={(e) =>
                  onSettingChange?.(option.id, e.target.checked)
                }
                className="w-4 h-4 rounded border-gray-300"
              />
              <Icon className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {option.label}
                </p>
                <p className="text-xs text-gray-500">{option.description}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
