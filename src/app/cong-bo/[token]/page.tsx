import PublicDocDetailClient from '../components/PublicDocDetailClient';

export const metadata = { title: 'Văn Bản Công Khai — FADO Group' };

/** Trang xem văn bản công khai theo token — không cần đăng nhập. */
export default function PublicDocPage({ params }: { params: { token: string } }) {
  return <PublicDocDetailClient token={params.token} />;
}
