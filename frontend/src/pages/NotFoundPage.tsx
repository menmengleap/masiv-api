import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 text-center">
      <p className="text-6xl font-black text-brand">404</p>
      <p className="text-lg text-gray-300">This page could not be found.</p>
      <Link to="/" className="btn-primary">
        Back to Dashboard
      </Link>
    </div>
  );
}
