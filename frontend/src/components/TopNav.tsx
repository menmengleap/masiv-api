import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Menu, KeyRound, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useHealth } from '../hooks/useHealth';
import { clsx } from './clsx';
import { ChangePasswordModal } from './ChangePasswordModal';

export function TopNav({ onMenu }: { onMenu: () => void }) {
  const { admin, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: health, error } = useHealth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const online = !!health && !error;

  const handleLogout = async () => {
    await logout();
    toast.info('Signed out');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-ink-700/70 bg-ink-900/80 px-4 backdrop-blur lg:px-6">
      <button
        className="rounded-lg p-2 text-gray-400 hover:bg-ink-800 hover:text-gray-100 lg:hidden"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex flex-1 items-center justify-end gap-4">
        {/* System status */}
        <div className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-850 px-3 py-1.5">
          <span
            className={clsx(
              'h-2 w-2 rounded-full',
              online ? 'bg-ok shadow-[0_0_8px] shadow-ok/60' : 'bg-danger',
            )}
          />
          <span className="text-xs font-medium text-gray-300">
            {online ? 'System Online' : 'System Offline'}
          </span>
        </div>

        {/* Admin menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => window.setTimeout(() => setMenuOpen(false), 150)}
            className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 hover:bg-ink-800"
          >
            <img src="/logo.png" alt="Profile" className="h-7 w-7 rounded-full object-contain" />
            <span className="hidden text-sm font-medium text-gray-200 sm:inline">
              {admin?.username ?? 'admin'}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-3">
                <img src="/logo.png" alt="Profile" className="h-8 w-8 rounded-full object-contain" />
                <div>
                  <p className="text-sm font-medium text-gray-100">{admin?.username}</p>
                  <p className="text-xs text-gray-500">Administrator</p>
                </div>
              </div>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setMenuOpen(false);
                  setPwOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-ink-800"
              >
                <KeyRound className="h-4 w-4" />
                Change password
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleLogout();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-danger hover:bg-ink-800"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </header>
  );
}
