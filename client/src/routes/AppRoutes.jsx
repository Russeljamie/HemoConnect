import { Navigate, Route, Routes } from "react-router-dom";

import Login from "../pages/Login";
import Register from "../pages/Register";
import App from "../App";
import { isAuthenticated } from "../services/api";

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
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

      {/* Protected dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />

      {/* Default route */}
      <Route
        path="/"
        element={<Navigate to="/dashboard" replace />}
      />

      {/* Unknown route */}
      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />
    </Routes>
  );
}

export default AppRoutes;