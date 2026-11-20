import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { notificationsAPI } from "../services/api";
import "./donor-pages.css";
import "./ngo-pages.css";

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function NotificationsPage({ onUnreadCountChange }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    notificationsAPI.getNotifications()
      .then((response) => {
        if (cancelled) return;
        const items = response.data.notifications || [];
        const count = response.data.unreadCount ?? items.filter((item) => !item.readAt).length;
        setNotifications(items);
        setUnreadCount(count);
        onUnreadCountChange?.(count);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load notifications."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey, onUnreadCountChange]);

  async function markRead(notification) {
    setError("");
    setUpdatingId(notification.notificationId);
    try {
      await notificationsAPI.markNotificationRead(notification.notificationId);
      setNotifications((current) => current.map((item) => item.notificationId === notification.notificationId
        ? { ...item, readAt: new Date().toISOString(), status: "READ" }
        : item));
      setUnreadCount((count) => Math.max(0, count - 1));
      onUnreadCountChange?.((count) => Math.max(0, count - 1));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to mark this notification as read."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function markAllRead() {
    setError("");
    try {
      await notificationsAPI.markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt, status: "READ" }));
      setUnreadCount(0);
      onUnreadCountChange?.(0);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to mark notifications as read."));
    }
  }

  const visibleNotifications = unreadOnly
    ? notifications.filter((notification) => !notification.readAt)
    : notifications;

  return (
    <section className="donor-page-panel ngo-campaigns-page ngo-notifications-page" aria-labelledby="notifications-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="notifications-heading">Notifications</h1>
          <p>Updates and reminders for your HemoConnect account.</p>
        </div>
        <span className="ngo-notification-count">{unreadCount} unread</span>
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}

      <div className="ngo-notification-toolbar">
        <label className="ngo-unread-filter">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
          Unread only
        </label>
        <button type="button" className="donor-text-action" onClick={markAllRead} disabled={unreadCount === 0}>
          Mark all as read
        </button>
      </div>

      <div className="ngo-notification-list" aria-live="polite">
        {loading ? <div className="donor-page-state" role="status">Loading notifications...</div>
          : visibleNotifications.length === 0 ? (
            <div className="donor-page-state">
              <Bell size={18} aria-hidden="true" />
              {unreadOnly ? "No unread notifications." : "You have no notifications yet."}
            </div>
          ) : visibleNotifications.map((notification) => (
            <article className={`ngo-notification-row${notification.readAt ? " read" : " unread"}`} key={notification.notificationId}>
              <div className="ngo-notification-copy">
                <div className="ngo-notification-title-row">
                  <strong>{notification.title || "Notification"}</strong>
                  {!notification.readAt && <span className="ngo-unread-indicator">Unread</span>}
                </div>
                <p>{notification.message}</p>
                {notification.campaign && <span className="ngo-notification-campaign">{notification.campaign.name}</span>}
                <time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time>
              </div>
              {!notification.readAt && (
                <button className="donor-text-action" type="button" disabled={updatingId === notification.notificationId} onClick={() => markRead(notification)}>
                  {updatingId === notification.notificationId ? "Saving..." : "Mark read"}
                </button>
              )}
            </article>
          ))}
      </div>

      <button className="ngo-notification-refresh" type="button" onClick={() => { setError(""); setLoading(true); setRefreshKey((current) => current + 1); }}>
        Refresh
      </button>
    </section>
  );
}
