import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, ArrowLeft } from 'lucide-react';

export function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const orderId = params.get('order');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
          <CheckCircle className="h-12 w-12 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Payment Successful</h1>
        <p className="mt-3 text-gray-400">
          Your payment has been received and your API key is being delivered via Telegram.
        </p>
        {orderId && (
          <p className="mt-2 text-sm text-gray-500">
            Order: <span className="font-mono text-gray-400">{orderId}</span>
          </p>
        )}
        <p className="mt-6 text-sm text-gray-500">
          Please return to the Telegram bot to view your API credentials.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
