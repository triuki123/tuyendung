import { RoomUsageHistory } from '../components/RoomUsageHistory';

export default function RoomUsageHistoryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 md:p-8">
      <RoomUsageHistory isAdmin={true} />
    </div>
  );
}
