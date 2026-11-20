import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authAPI } from "../services/api";
import "../styles/auth.css";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const hasValidToken = token.length >= 32 && token.length <= 100;
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await authAPI.resetPassword(token, password);
      setMessage(response.message);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to reset your password. Check your connection and try again."
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
            <h1>Choose a new password</h1>
            <p>Your new password must be at least 12 characters long.</p>
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-success" role="status">{message}</div>}
          {!message && (
            <form onSubmit={submit} className="auth-form">
              <div className="form-group">
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={submitting || !hasValidToken}
                />
              </div>
              <div className="form-group">
                <label htmlFor="confirm-password">Confirm new password</label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  disabled={submitting || !hasValidToken}
                />
              </div>
              {!hasValidToken && (
                <div className="auth-error" role="alert">
                  This reset link is invalid. Request a new one.
                </div>
              )}
              <button
                type="submit"
                className="auth-submit-button"
                disabled={submitting || !hasValidToken}
              >
                {submitting ? "Updating password..." : "Reset password"}
              </button>
            </form>
          )}
          {message ? (
            <p className="auth-register-text"><Link to="/login">Sign in</Link></p>
          ) : (
            <p className="auth-register-text">
              <Link to="/forgot-password">Request another reset link</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

export default ResetPassword;
