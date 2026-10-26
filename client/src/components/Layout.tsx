/**
 * App shell (DESIGN.md §5/§8): sidebar on ≥768px, top bar + bottom nav below.
 * Nav entries only exist for routes that exist; phases add entries.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { APP_NAME } from '@stms/shared';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../hooks/useTheme';
import { useToast } from './Toast';
import { Icon } from './Icons';
import { NotificationBell } from './NotificationBell';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'home' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/notifications', label: 'Alerts', icon: 'bell' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { push } = useToast();
  const navigate = useNavigate();

  const onLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      push('danger', 'Sign-out failed. Try again.');
    }
  };

  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="book" size={22} />
          </span>
          <span>{APP_NAME}</span>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="btn btn-ghost nav-item"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>
          <button type="button" className="btn btn-ghost nav-item" onClick={onLogout}>
            <Icon name="logout" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="book" size={18} />
          </span>
          <span>{APP_NAME}</span>
        </div>
        <div className="topbar-actions">
          <NotificationBell signedIn />
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
          </button>
          <NavLink to="/profile" className="user-chip" aria-label="Your profile">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="user-chip-name">{user?.name}</span>
          </NavLink>
        </div>
      </header>

      <main id="main-content" className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Primary mobile">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `nav-item nav-item-compact${isActive ? ' nav-item-active' : ''}`
            }
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
