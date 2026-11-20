import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Droplet,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ArrowRight,
  HeartPulse,
} from "lucide-react";

import {
  authAPI,
  getDashboardPath,
  saveAuthData,
} from "../services/api";
import "../styles/auth.css";

function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!formData.email.trim() || !formData.password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.login(
        formData.email.trim(),
        formData.password
      );

      saveAuthData(response);

      const targetPath = response?.data?.user?.mustChangePassword
        ? "/change-password"
        : getDashboardPath(response?.data?.user?.role);
      navigate(targetPath, { replace: true });
    } catch (err) {
      const message = err.response
        ? err.response.data?.message ||
          err.response.data?.error ||
          "Login failed. Please check your email and password."
        : "Unable to reach the HemoConnect server. Check your connection and try again.";

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Left branding panel */}
      <section className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="auth-logo">
            <Droplet size={30} fill="currentColor" />
          </div>

          <h1>HemoConnect</h1>

          <p className="auth-brand-subtitle">
            Blood Donation & Management System
          </p>

          <div className="auth-message">
            <HeartPulse size={28} />

            <h2>Every donation can save a life.</h2>

            <p>
              Connect with hospitals, respond to emergency blood
              requests, manage your donations, and make a difference
              in your community.
            </p>
          </div>

          <div className="auth-stats">
            <div>
              <strong>24/7</strong>
              <span>Emergency Support</span>
            </div>

            <div>
              <strong>8+</strong>
              <span>Blood Types</span>
            </div>

            <div>
              <strong>1</strong>
              <span>Mission: Save Lives</span>
            </div>
          </div>
        </div>
      </section>

      {/* Login panel */}
      <section className="auth-form-panel">
        <div className="auth-form-container">
          <div className="mobile-auth-logo">
            <div className="auth-logo">
              <Droplet size={25} fill="currentColor" />
            </div>

            <span>HemoConnect</span>
          </div>

          <div className="auth-heading">
            <h2>Welcome back</h2>

            <p>
              Sign in to your HemoConnect account to continue.
            </p>
          </div>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>

              <div className="input-wrapper">
                <Mail size={18} />

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <div className="password-label-row">
                <label htmlFor="password">Password</label>

                <Link to="/forgot-password" className="forgot-password">
                  Forgot password?
                </Link>
              </div>

              <div className="input-wrapper">
                <LockKeyhole size={18} />

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword((previous) => !previous)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-button"
              disabled={loading}
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>OR</span>
          </div>

          <p className="auth-register-text">
            Don't have an account?{" "}
            <Link to="/register">Create an account</Link>
          </p>

          <p className="auth-register-text">
            Need help with a blood request?{" "}
            <Link to="/assistance">Contact a hospital</Link>
          </p>

          <p className="auth-footer">
            © 2026 HemoConnect. Blood donation saves lives.
          </p>
        </div>
      </section>
    </div>
  );
}

export default Login;