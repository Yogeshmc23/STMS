/**
 * Route map (DESIGN.md §5): public auth screens + protected app shell.
 * Feature routes are added here as phases complete (Tasks, Calendar, …).
 */
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { GuestOnly, ProtectedRoute } from './auth/ProtectedRoute';
import { ToastProvider } from './components/Toast';
import { AppShell } from './components/Layout';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { HomePage } from './pages/Home';
import { TasksPage } from './pages/Tasks';
import { CalendarPage } from './pages/Calendar';
import { NotificationsPage } from './pages/Notifications';
import { AnalyticsPage } from './pages/Analytics';
import { ProfilePage } from './pages/Profile';
import { NotFoundPage } from './pages/NotFound';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            }
          />
          <Route
            path="/register"
            element={
              <GuestOnly>
                <RegisterPage />
              </GuestOnly>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
