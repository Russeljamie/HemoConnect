
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
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";

import { authAPI } from "../services/api";
import { ageFromDateOfBirth, dateInputYearsAgo } from "../utils/dateOfBirth";
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
    bloodType: "",
    birthDate: "",
    gender: "",
    address: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) setError("");
    if (success) setSuccess("");
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

    if (formData.password.length > 128) {
      return "Password cannot exceed 128 characters.";
    }

    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match.";
    }

    if (formData.role === "DONOR") {
      if (
        !formData.bloodType ||
        !formData.birthDate ||
        !formData.gender ||
        !formData.address.trim()
      ) {
        return "Please complete all required donor details.";
      }

      const age = ageFromDateOfBirth(formData.birthDate);

      if (age === null || age < 18 || age > 100) {
        return "Donor date of birth must represent an age between 18 and 100.";
      }
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
        ...(formData.role === "DONOR" && {
          bloodType: formData.bloodType,
          birthDate: formData.birthDate,
          gender: formData.gender,
          address: formData.address.trim(),
        }),
      };

      const response = await authAPI.register(registrationData);

      if (response?.data?.token) {
        setSuccess("Registration successful! Redirecting...");
        navigate("/dashboard");
        return;
      }

      if (response?.data?.success === false) {
        setError(response.data.message || "Registration failed.");
        return;
      }

      setSuccess(
        "Registration successful! Please sign in to continue."
      );

      setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (err) {
      const responseData = err.response?.data;

      const validationMessages = Array.isArray(responseData?.errors)
        ? responseData.errors
            .map((item) => item.msg || item.message)
            .filter(Boolean)
            .join(" ")
        : "";

      setError(
        validationMessages ||
          responseData?.message ||
          responseData?.error ||
          "Registration failed. Please check your details and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="auth-logo">
            <Droplet size={30} fill="currentColor" />
          </div>

          <h1>HemoConnect</h1>

          <p className="auth-brand-subtitle">
            Blood Donation &amp; Management System
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

      <section className="auth-form-panel">
        <div className="auth-form-container register-container">
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
                    minLength={2}
                    maxLength={50}
                    disabled={loading}
                    required
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
                    minLength={2}
                    maxLength={50}
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            </div>

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
                  required
                />
              </div>
            </div>

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
                  minLength={10}
                  maxLength={20}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Account Type</label>

              <div className="role-options">
                <label
                  className={`role-option ${
                    formData.role === "DONOR" ? "selected" : ""
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
                      Donate blood and respond to emergency requests.
                    </span>
                  </div>
                </label>

                <label
                  className={`role-option ${
                    formData.role === "PATIENT" ? "selected" : ""
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
                      Request blood and manage your blood requirements.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {formData.role === "DONOR" && (
              <>
                <div className="form-group">
                  <label htmlFor="bloodType">Blood Type</label>

                  <select
                    id="bloodType"
                    name="bloodType"
                    value={formData.bloodType}
                    onChange={handleChange}
                    disabled={loading}
                    required
                  >
                    <option value="">Select blood type</option>

                    {[
                      "A+",
                      "A-",
                      "B+",
                      "B-",
                      "AB+",
                      "AB-",
                      "O+",
                      "O-",
                    ].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="birthDate">Date of birth</label>

                    <input
                      id="birthDate"
                      name="birthDate"
                      type="date"
                      min={dateInputYearsAgo(100)}
                      max={dateInputYearsAgo(18)}
                      value={formData.birthDate}
                      onChange={handleChange}
                      disabled={loading}
                      required
                    />
                    {formData.birthDate && ageFromDateOfBirth(formData.birthDate) !== null && (
                      <small>Age: {ageFromDateOfBirth(formData.birthDate)} (calculated)</small>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="gender">Gender</label>

                    <select
                      id="gender"
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      disabled={loading}
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                      <option value="PREFER_NOT_TO_SAY">
                        Prefer not to say
                      </option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="address">Location / Address</label>

                  <div className="input-wrapper">
                    <MapPin size={18} />

                    <input
                      id="address"
                      name="address"
                      type="text"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="e.g. Westlands, Nairobi"
                      maxLength={255}
                      autoComplete="street-address"
                      disabled={loading}
                      required
                    />
                  </div>
                </div>
              </>
            )}

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
                  minLength={8}
                  maxLength={128}
                  disabled={loading}
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword((previous) => !previous)
                  }
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
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

            <div className="form-group">
              <label htmlFor="confirmPassword">
                Confirm Password
              </label>

              <div className="input-wrapper">
                <LockKeyhole size={18} />

                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowConfirmPassword((previous) => !previous)
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
            &copy; 2026 HemoConnect. Blood donation saves lives.
          </p>
        </div>
      </section>
    </div>
  );
}

export default Register;
