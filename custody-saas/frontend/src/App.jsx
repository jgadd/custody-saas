import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DetaineesPage from './pages/DetaineesPage';
import DetaineeDetailPage from './pages/DetaineeDetailPage';
import CellsPage from './pages/CellsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AdminDashboard from './admin/AdminDashboard';
import AdminStations from './admin/AdminStations';
import AdminUsers from './admin/AdminUsers';
import AdminPlans from './admin/AdminPlans';

function RequireAuth({ children }) {
  const user = useAuthStore(s => s.user);
  return user ? children : <Navigate to="/login" replace />;
}

function RequireSuperAdmin({ children }) {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="detainees" element={<DetaineesPage />} />
          <Route path="detainees/:id" element={<DetaineeDetailPage />} />
          <Route path="cells" element={<CellsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<RequireSuperAdmin><AdminDashboard /></RequireSuperAdmin>} />
          <Route path="admin/stations" element={<RequireSuperAdmin><AdminStations /></RequireSuperAdmin>} />
          <Route path="admin/users" element={<RequireSuperAdmin><AdminUsers /></RequireSuperAdmin>} />
          <Route path="admin/plans" element={<RequireSuperAdmin><AdminPlans /></RequireSuperAdmin>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
