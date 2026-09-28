import { Suspense } from 'react';
import { Loader } from 'lucide-react';
import { ResetPasswordForm } from './ResetPasswordForm';

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center">
        <Loader className="animate-spin text-indigo-400 mx-auto mb-4" size={48} />
        <p className="text-ink-bright font-medium">Đang xác minh token...</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
