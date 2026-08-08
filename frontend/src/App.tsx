import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ToastViewport } from './components/ToastViewport';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { StockPage } from './pages/StockPage';
import { UploadPage } from './pages/UploadPage';
import { PackagesPage } from './pages/PackagesPage';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { ExpiryPage } from './pages/ExpiryPage';
import { TelegramPage } from './pages/TelegramPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PaymentSuccessPage } from './pages/PaymentSuccessPage';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/expiry" element={<ExpiryPage />} />
            <Route path="/telegram" element={<TelegramPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <ToastViewport />
      </AuthProvider>
    </ToastProvider>
  );
}
