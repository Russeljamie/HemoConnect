import { useState } from "react";
import { Link } from "react-router-dom";
import { authAPI } from "../services/api";
import "../styles/auth.css";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const response = await authAPI.requestPasswordReset(email.trim());
      setMessage(response.message);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to request a password reset. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-form-panel auth-standalone-panel">
        <div className="auth-form-container">
          <div className="auth-heading">
            <h1>Reset your password</h1>
            <p>Enter the email address on your account to request a reset link.</p>
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-success" role="status">{message}</div>}
          <form onSubmit={submit} className="auth-form">
            <div className="form-group">
              <label htmlFor="reset-email">Email Address</label>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <button type="submit" className="auth-submit-button" disabled={submitting}>
              {submitting ? "Sending request..." : "Send reset link"}
            </button>
          </form>
          <p className="auth-register-text">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default ForgotPassword;
