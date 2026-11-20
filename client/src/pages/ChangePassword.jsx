import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { authAPI, getCurrentUser, getDashboardPath, saveAuthData } from "../services/api";
import "../styles/auth.css";

function ChangePassword() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (form.newPassword !== form.confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const response = await authAPI.changePassword(form.currentPassword, form.newPassword);
      saveAuthData(response);
      navigate(getDashboardPath(response.data.user.role), { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-heading">
            <KeyRound size={28} aria-hidden="true" />
            <h1>Change your temporary password</h1>
            <p>
              Welcome, {user?.firstName || "staff member"}. Set a new password before accessing HemoConnect.
            </p>
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <form onSubmit={submit} className="auth-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Temporary password</label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={updateField}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength="12"
                maxLength="128"
                value={form.newPassword}
                onChange={updateField}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength="12"
                maxLength="128"
                value={form.confirmPassword}
                onChange={updateField}
                required
              />
            </div>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Updating password..." : "Change password"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default ChangePassword;
