import { Navigate, Route, Routes } from "react-router-dom";

import Login from "../pages/Login";
import Register from "../pages/Register";
import NotFound from "../pages/NotFound";
import ChangePassword from "../pages/ChangePassword";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import { PublicAssistanceEnquiryPage } from "../pages/PublicAssistanceEnquiryPage";
import App from "../App";
import { getCurrentUser, getDashboardPath, isAuthenticated } from "../services/api";

function ProtectedRoute({ children, requiredRole, allowPasswordChange = false }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const user = getCurrentUser();

  if (user?.mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/change-password" replace />;
  }

  if (!user?.mustChangePassword && allowPasswordChange) {
    return <Navigate to={getDashboardPath(user?.role)} replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to={getDashboardPath(user?.role)} replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Login */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      {/* Registration */}
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      <Route
        path="/assistance"
        element={
          <PublicRoute>
            <PublicAssistanceEnquiryPage />
          </PublicRoute>
        }
      />

      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/change-password"
        element={
          <ProtectedRoute allowPasswordChange>
            <ChangePassword />
          </ProtectedRoute>
        }
      />

      {/* Role-aware dashboard routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/patient-dashboard"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/patient/requests"
        element={
          <ProtectedRoute requiredRole="PATIENT">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/patient/appointments"
        element={
          <ProtectedRoute requiredRole="PATIENT">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/patient/medical-notes"
        element={
          <ProtectedRoute requiredRole="PATIENT">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hospital-dashboard"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hospital/inventory"
        element={
          <ProtectedRoute requiredRole="HOSPITAL_STAFF">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hospital/stock-insights"
        element={<Navigate to="/hospital/inventory" replace />}
      />

      <Route
        path="/hospital/requests"
        element={
          <ProtectedRoute requiredRole="HOSPITAL_STAFF">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hospital/donation-needs"
        element={
          <ProtectedRoute requiredRole="HOSPITAL_STAFF">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hospital/appointments"
        element={
          <ProtectedRoute requiredRole="HOSPITAL_STAFF">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hospital/staff"
        element={
          <ProtectedRoute requiredRole="HOSPITAL_STAFF">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ngo-dashboard"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ngo/campaigns"
        element={
          <ProtectedRoute requiredRole="NGO">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ngo/outreach"
        element={
          <ProtectedRoute requiredRole="NGO">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ngo/notifications"
        element={
          <ProtectedRoute requiredRole="NGO">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ngo/reports"
        element={
          <ProtectedRoute requiredRole="NGO">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users"
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/hospitals"
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/inventory"
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/donor/profile"
        element={
          <ProtectedRoute requiredRole="DONOR">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/donor/donations"
        element={
          <ProtectedRoute requiredRole="DONOR">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/donor/appointments"
        element={
          <ProtectedRoute requiredRole="DONOR">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/donor/alerts"
        element={
          <ProtectedRoute requiredRole="DONOR">
            <App />
          </ProtectedRoute>
        }
      />

      <Route
        path="/donor/campaigns"
        element={
          <ProtectedRoute requiredRole="DONOR">
            <App />
          </ProtectedRoute>
        }
      />

      {/* Default route */}
      <Route
        path="/"
        element={
          <Navigate
            to={getDashboardPath(JSON.parse(localStorage.getItem("hemoconnect_user") || "null")?.role || "DONOR")}
            replace
          />
        }
      />

      {/* Unknown route */}
      <Route
        path="*"
        element={<NotFound />}
      />
    </Routes>
  );
}

export default AppRoutes;
