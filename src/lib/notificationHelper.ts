import { useNotifications } from '@/context/NotificationContext';

export function useNotificationHelper() {
  const { addNotification } = useNotifications();

  return {
    notifyTaskAssigned: (taskName: string, assignedBy: string) => {
      addNotification({
        type: 'task',
        title: 'Công việc mới',
        message: `Bạn được giao: ${taskName}`,
        assignedBy,
      });
    },

    notifyTicketAssigned: (ticketId: string, assignedBy: string, description: string) => {
      addNotification({
        type: 'ticket',
        title: `Ticket mới cho danh mục: ${ticketId.split('-')[0]}`,
        message: description,
        assignedBy,
        relatedId: ticketId,
        relatedUrl: '/tickets/admin',
      });
    },

    notifyAssetUpdate: (assetName: string, action: string) => {
      addNotification({
        type: 'asset',
        title: 'Cập nhật tài sản',
        message: `${assetName} - ${action}`,
      });
    },

    notifySystemMessage: (title: string, message: string) => {
      addNotification({
        type: 'system',
        title,
        message,
      });
    },

    notifyReminder: (taskName: string, assignedBy: string) => {
      addNotification({
        type: 'task',
        title: 'Nhắc nhở công việc',
        message: `Công việc "${taskName}" đang chờ xử lý`,
        assignedBy,
      });
    },
  };
}
