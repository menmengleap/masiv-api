import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Boxes,
  Upload,
  Package,
  ShoppingCart,
  Users,
  CalendarClock,
  Send,
  CreditCard,
  ScrollText,
  Settings,
  X,
} from 'lucide-react';
import { clsx } from './clsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/stock', label: 'API Stock', icon: Boxes },
  { to: '/upload', label: 'API Upload', icon: Upload },
  { to: '/packages', label: 'Packages', icon: Package },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/expiry', label: 'Expiry', icon: CalendarClock },
  { to: '/telegram', label: 'Telegram Bot', icon: Send },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-700/70 bg-ink-900 transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Masiv API" className="h-9 w-9 rounded-lg object-contain" />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Masiv API</p>
              <p className="text-[11px] text-gray-500">Admin Console</p>
            </div>
          </div>
          <button
            className="rounded-lg p-1 text-gray-500 hover:bg-ink-800 hover:text-gray-200 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand/15 text-brand-400 ring-1 ring-inset ring-brand/25'
                    : 'text-gray-400 hover:bg-ink-800 hover:text-gray-100',
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-700/70 px-5 py-3">
          <p className="text-[11px] text-gray-600">Masiv API · v1.0</p>
        </div>
      </aside>
    </>
  );
}
