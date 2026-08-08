import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullScreenLoader } from './Spinner';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
