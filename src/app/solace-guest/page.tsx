import GuestClient from './components/GuestClient';

export const metadata = { title: 'Đặt món · Quán Cà Phê Solace' };

export default function SolaceGuestPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <GuestClient />
    </div>
  );
}
