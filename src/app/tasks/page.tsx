import AppLayout from '@/components/AppLayout';
import TasksClient from './components/TasksClient';

export default function TasksPage() {
  return (
    <AppLayout activePath="/tasks">
      <TasksClient />
    </AppLayout>
  );
}
