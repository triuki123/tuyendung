import { RoomBookingsClient } from './components/RoomBookingsClient';

export const metadata = {
  title: 'Đặt Phòng Họp — FADO AssetFlow',
  description: 'Quản lý đặt phòng họp',
};

export default function RoomBookingsPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <RoomBookingsClient />
    </div>
  );
}
