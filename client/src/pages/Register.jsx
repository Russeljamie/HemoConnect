import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Droplet,
  Eye,
  EyeOff,
  HeartPulse,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";

import { authAPI, saveAuthData } from "../services/api";
import "../styles/auth.css";

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "DONOR",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }

    if (success) {
      setSuccess("");
    }
  };

  const validateForm = () => {
    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.email.trim() ||
      !formData.phone.trim() ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      return "Please complete all required fields.";
    }

    if (formData.password.length < 8) {
      return "Password must be at least 8 characters long.";
    }

    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match.";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const registrationData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,
        role: formData.role,
      };

      const response = await authAPI.register(registrationData);

      /*
       * If the backend returns authentication data immediately,
       * save it. Otherwise the user will simply be redirected
       * to the login page.
       */
      if (response?.data?.token) {
        saveAuthData(response);
        navigate("/dashboard");
        return;
      }

      setSuccess(
        "Registration successful! Please sign in to continue."
      );

      setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (err) {
      const backendMessage =
        err.response?.data?.message ||
        err.response?.data?.error;

      if (Array.isArray(err.response?.data?.errors)) {
        const validationMessages = err.response.data.errors
          .map((item) => item.message)
          .filter(Boolean)
          .join(" ");

        setError(
          validationMessages ||
            backendMessage ||
            "Registration failed. Please check your details."
        );
      } else {
        setError(
          backendMessage ||
            "Registration failed. Please check your details and try again."
        );
      }
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

            <h2>Join the community. Help save lives.</h2>

            <p>
              Create your HemoConnect account and connect with
              hospitals, donation campaigns, emergency requests,
              appointments, and other blood donation services.
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

      {/* Registration panel */}
      <section className="auth-form-panel">
        <div className="auth-form-container register-container">
          {/* Mobile branding */}
          <div className="mobile-auth-logo">
            <div className="auth-logo">
              <Droplet size={25} fill="currentColor" />
            </div>

            <span>HemoConnect</span>
          </div>

          <div className="auth-heading">
            <h2>Create your account</h2>

            <p>
              Join HemoConnect and become part of a community that
              saves lives.
            </p>
          </div>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="auth-success" role="status">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {/* First and last name */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">First Name</label>

                <div className="input-wrapper">
                  <UserRound size={18} />

                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="First name"
                    value={formData.firstName}
                    onChange={handleChange}
                    autoComplete="given-name"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>

                <div className="input-wrapper">
                  <UserRound size={18} />

                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    placeholder="Last name"
                    value={formData.lastName}
                    onChange={handleChange}
                    autoComplete="family-name"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Email */}
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

            {/* Phone */}
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>

              <div className="input-wrapper">
                <Phone size={18} />

                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="e.g. 0712345678"
                  value={formData.phone}
                  onChange={handleChange}
                  autoComplete="tel"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Role */}
            <div className="form-group">
              <label htmlFor="role">Account Type</label>

              <div className="role-options">
                <label
                  className={`role-option ${
                    formData.role === "DONOR"
                      ? "selected"
                      : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value="DONOR"
                    checked={formData.role === "DONOR"}
                    onChange={handleChange}
                    disabled={loading}
                  />

                  <div>
                    <strong>Donor</strong>
                    <span>
                      Donate blood and respond to emergency
                      requests.
                    </span>
                  </div>
                </label>

                <label
                  className={`role-option ${
                    formData.role === "PATIENT"
                      ? "selected"
                      : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value="PATIENT"
                    checked={formData.role === "PATIENT"}
                    onChange={handleChange}
                    disabled={loading}
                  />

                  <div>
                    <strong>Patient</strong>
                    <span>
                      Request blood and manage your blood
                      requirements.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="password">Password</label>

              <div className="input-wrapper">
                <LockKeyhole size={18} />

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword(
                      (previous) => !previous
                    )
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

            {/* Confirm password */}
            <div className="form-group">
              <label htmlFor="confirmPassword">
                Confirm Password
              </label>

              <div className="input-wrapper">
                <LockKeyhole size={18} />

                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowConfirmPassword(
                      (previous) => !previous
                    )
                  }
                  aria-label={
                    showConfirmPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="auth-submit-button"
              disabled={loading}
            >
              {loading ? (
                <span>Creating account...</span>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>OR</span>
          </div>

          <p className="auth-register-text">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>

          <p className="auth-footer">
            © 2026 HemoConnect. Blood donation saves lives.
          </p>
        </div>
      </section>
    </div>
  );
}

export default Register;