import GenericFormClient from './components/GenericFormClient';

export const metadata = { title: 'Biểu Mẫu — FADO Group' };

/** Trang điền biểu mẫu nội bộ PUBLIC theo token — không cần đăng nhập. */
export default function PublicFormPage({ params }: { params: { token: string } }) {
  return <GenericFormClient token={params.token} />;
}
