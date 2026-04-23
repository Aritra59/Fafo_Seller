import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicShopPage } from './pages/PublicShopPage';
import { Dashboard } from './pages/Dashboard';
import { Demo } from './pages/Demo';
import { AddItem } from './pages/AddItem';
import { Home } from './pages/Home';
import { Menu } from './pages/Menu';
import { Orders } from './pages/Orders';
import { Login } from './pages/Login';
import { ShopOnboarding } from './pages/ShopOnboarding';
import { PlansBilling } from './pages/PlansBilling';
import { ShopProfile } from './pages/ShopProfile';
import { Customers } from './pages/Customers';
import { CustomerDetails } from './pages/CustomerDetails';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { Settings } from './pages/Settings';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { MenuManagement } from './pages/MenuManagement';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/shop/:code" element={<PublicShopPage />} />
        <Route path="/s/:slug" element={<PublicShopPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="demo" element={<Demo />} />
          <Route
            path="onboarding"
            element={
              <ProtectedRoute>
                <ShopOnboarding />
              </ProtectedRoute>
            }
          />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="orders/:orderId"
            element={
              <ProtectedRoute>
                <OrderDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="orders"
            element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="menu/add"
            element={
              <ProtectedRoute>
                <AddItem />
              </ProtectedRoute>
            }
          />
          <Route
            path="menu/edit/:productId"
            element={
              <ProtectedRoute>
                <AddItem />
              </ProtectedRoute>
            }
          />
          <Route
            path="menu"
            element={
              <ProtectedRoute>
                <Menu />
              </ProtectedRoute>
            }
          />
          <Route
            path="menu/groups"
            element={
              <ProtectedRoute>
                <MenuManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="profile"
            element={
              <ProtectedRoute>
                <ShopProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="billing"
            element={
              <ProtectedRoute>
                <PlansBilling />
              </ProtectedRoute>
            }
          />
          <Route
            path="customers"
            element={
              <ProtectedRoute>
                <Customers />
              </ProtectedRoute>
            }
          />
          <Route
            path="analytics"
            element={
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="customers/:customerId"
            element={
              <ProtectedRoute>
                <CustomerDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
