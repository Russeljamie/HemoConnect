import { useEffect, useState } from "react";
import { CalendarDays, Megaphone } from "lucide-react";

import { ngoAPI } from "../services/api";
import "./donor-pages.css";
import "./ngo-pages.css";

const MIN_CAMPAIGN_DATE = new Date().toISOString().slice(0, 10);
const REPORT_TODAY = new Date().toISOString().slice(0, 10);
const ACTIVITY_TYPES = [
  ["COMMUNITY_VISIT", "Community visit"],
  ["SCHOOL_OUTREACH", "School outreach"],
  ["CORPORATE_DRIVE", "Corporate drive"],
  ["AWARENESS", "Awareness activity"],
  ["OTHER", "Other"],
];

const EMPTY_FORM = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  location: "",
  hospitalId: "",
  hospitalNeedId: "",
};

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function dateInputValue(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function NgoCampaignsPage({ onCampaignChanged }) {
  const [campaigns, setCampaigns] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [donationNeeds, setDonationNeeds] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([ngoAPI.getCampaigns(), ngoAPI.getDonationNeeds()])
      .then(([response, needResponse]) => {
        if (cancelled) return;
        setCampaigns(response.data.campaigns || []);
        setHospitals(response.data.hospitals || []);
        setDonationNeeds(needResponse.data.needs || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load campaigns."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function startEditing(campaign) {
    setError("");
    setNotice("");
    setEditingCampaignId(campaign.campaignId);
    setForm({
      name: campaign.name,
      description: campaign.description,
      startDate: dateInputValue(campaign.startDate),
      endDate: dateInputValue(campaign.endDate),
      location: campaign.location,
      hospitalId: campaign.hospitalId ? String(campaign.hospitalId) : "",
      hospitalNeedId: campaign.hospitalNeedId ? String(campaign.hospitalNeedId) : "",
    });
  }

  function cancelEditing() {
    setEditingCampaignId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function saveCampaign(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (form.endDate < form.startDate) {
      setError("End date must be on or after the start date.");
      return;
    }

    setSaving(true);
    const payload = {
      ...form,
      hospitalId: form.hospitalId ? Number(form.hospitalId) : null,
      hospitalNeedId: form.hospitalNeedId ? Number(form.hospitalNeedId) : null,
    };
    try {
      const response = editingCampaignId
        ? await ngoAPI.updateCampaign(editingCampaignId, payload)
        : await ngoAPI.createCampaign(payload);
      setNotice(response.message || "Campaign saved.");
      setEditingCampaignId(null);
      setForm(EMPTY_FORM);
      setLoading(true);
      setRefreshKey((current) => current + 1);
      onCampaignChanged?.();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to save this campaign."));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(campaign, status) {
    setError("");
    setNotice("");
    setUpdatingId(campaign.campaignId);
    try {
      const response = await ngoAPI.updateCampaign(campaign.campaignId, { status });
      setNotice(response.message || "Campaign status updated.");
      setLoading(true);
      setRefreshKey((current) => current + 1);
      onCampaignChanged?.();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update this campaign."));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="donor-page-panel ngo-campaigns-page" aria-labelledby="ngo-campaigns-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="ngo-campaigns-heading">Campaigns</h1>
          <p>Create and manage your organization’s blood drives.</p>
        </div>
        <Megaphone size={22} aria-hidden="true" />
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}

      <form className="ngo-campaign-form" onSubmit={saveCampaign}>
        <div className="ngo-campaign-form-heading">
          <h2>{editingCampaignId ? "Edit campaign" : "Create campaign"}</h2>
          {editingCampaignId && <button type="button" className="donor-text-action" onClick={cancelEditing}>Cancel edit</button>}
        </div>
        <label className="ngo-campaign-name">
          Campaign name
          <input name="name" minLength="3" maxLength="120" value={form.name} onChange={updateField} required />
        </label>
        <label>
          Start date
          <input name="startDate" type="date" min={editingCampaignId ? undefined : MIN_CAMPAIGN_DATE} value={form.startDate} onChange={updateField} required />
        </label>
        <label>
          End date
          <input name="endDate" type="date" min={form.startDate || (editingCampaignId ? undefined : MIN_CAMPAIGN_DATE)} value={form.endDate} onChange={updateField} required />
        </label>
        <label>
          Location
          <input name="location" minLength="2" maxLength="180" value={form.location} onChange={updateField} required />
        </label>
        <label>
          Partner hospital <span className="ngo-campaign-optional">Optional</span>
          <select name="hospitalId" value={form.hospitalId} onChange={updateField}>
            <option value="">Community campaign</option>
            {hospitals.map((hospital) => (
              <option key={hospital.hospitalId} value={hospital.hospitalId}>{hospital.name} · {hospital.location}</option>
            ))}
          </select>
        </label>
        <label>
          Hospital donation need <span className="ngo-campaign-optional">Optional</span>
          <select
            name="hospitalNeedId"
            value={form.hospitalNeedId}
            onChange={(event) => {
              const selectedNeed = donationNeeds.find((need) => String(need.needId) === event.target.value);
              setForm((current) => ({
                ...current,
                hospitalNeedId: event.target.value,
                hospitalId: selectedNeed ? String(selectedNeed.hospitalId) : current.hospitalId,
              }));
            }}
          >
            <option value="">No specific hospital need</option>
            {donationNeeds.map((need) => (
              <option key={need.needId} value={need.needId}>
                {need.hospital.name} · {need.bloodType} · {need.unitsNeeded} units by {formatDate(need.neededBy)}
              </option>
            ))}
          </select>
          <small>Campaign registration is not counted as a donation or inventory unit.</small>
        </label>
        <label className="ngo-campaign-description">
          Description
          <textarea name="description" minLength="10" maxLength="2000" rows="3" value={form.description} onChange={updateField} required />
        </label>
        <div className="ngo-campaign-form-actions">
          <span><CalendarDays size={15} /> New campaigns start as planned.</span>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingCampaignId ? "Save changes" : "Create campaign"}
          </button>
        </div>
      </form>

      <div className="ngo-campaign-list-heading">
        <h2>Campaign directory</h2>
        <span>{campaigns.length} campaigns</span>
      </div>
      <div className="donor-table-wrap">
        <table className="donor-table ngo-campaign-table">
          <thead><tr><th>Campaign</th><th>Dates</th><th>Location</th><th>Partner</th><th>Donors</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" className="donor-table-empty">Loading campaigns...</td></tr>
              : campaigns.length === 0 ? <tr><td colSpan="7" className="donor-table-empty">No campaigns yet.</td></tr>
                : campaigns.map((campaign) => (
                  <tr key={campaign.campaignId}>
                    <td><strong>{campaign.name}</strong><small className="ngo-campaign-description-preview">{campaign.description}</small></td>
                    <td>{formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}</td>
                    <td>{campaign.location}</td>
                    <td>{campaign.hospital?.name || "Community"}</td>
                    <td>{campaign._count?.donorRegistrations ?? 0}</td>
                    <td><span className="donor-status-tag">{campaign.status}</span></td>
                    <td className="ngo-campaign-actions">
                      {campaign.status === "PLANNED" && <button className="donor-text-action" type="button" disabled={updatingId === campaign.campaignId} onClick={() => updateStatus(campaign, "ACTIVE")}>Activate</button>}
                      {campaign.status === "ACTIVE" && <button className="donor-text-action" type="button" disabled={updatingId === campaign.campaignId} onClick={() => updateStatus(campaign, "COMPLETED")}>Complete</button>}
                      {["PLANNED", "ACTIVE"].includes(campaign.status) && (
                        <>
                          <button className="donor-text-action" type="button" onClick={() => startEditing(campaign)}>Edit</button>
                          <button className="donor-text-action danger" type="button" disabled={updatingId === campaign.campaignId} onClick={() => updateStatus(campaign, "CANCELLED")}>Cancel</button>
                        </>
                      )}
                      {["COMPLETED", "CANCELLED"].includes(campaign.status) && <span>Closed</span>}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function NgoOutreachPage() {
  const [activities, setActivities] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState({
    title: "",
    activityType: "COMMUNITY_VISIT",
    description: "",
    location: "",
    scheduledAt: "",
    campaignId: "",
    peopleReached: "0",
  });
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    ngoAPI.getOutreachActivities()
      .then((response) => {
        if (cancelled) return;
        setActivities(response.data.activities || []);
        setCampaigns(response.data.campaigns || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load outreach activities."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function startEditing(activity) {
    setError("");
    setNotice("");
    setEditingActivityId(activity.activityId);
    setForm({
      title: activity.title,
      activityType: activity.activityType,
      description: activity.description,
      location: activity.location,
      scheduledAt: new Date(activity.scheduledAt).toISOString().slice(0, 16),
      campaignId: activity.campaignId ? String(activity.campaignId) : "",
      peopleReached: String(activity.peopleReached),
    });
  }

  function resetForm() {
    setEditingActivityId(null);
    setForm({
      title: "",
      activityType: "COMMUNITY_VISIT",
      description: "",
      location: "",
      scheduledAt: "",
      campaignId: "",
      peopleReached: "0",
    });
    setError("");
  }

  async function saveActivity(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        campaignId: form.campaignId ? Number(form.campaignId) : null,
        peopleReached: Number(form.peopleReached),
      };
      const response = editingActivityId
        ? await ngoAPI.updateOutreachActivity(editingActivityId, payload)
        : await ngoAPI.createOutreachActivity(payload);
      setNotice(response.message || "Outreach activity saved.");
      resetForm();
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to save this outreach activity."));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(activity, status) {
    setError("");
    setNotice("");
    setUpdatingId(activity.activityId);
    try {
      const response = await ngoAPI.updateOutreachActivity(activity.activityId, { status });
      setNotice(response.message || "Outreach activity updated.");
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update this activity."));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="donor-page-panel ngo-campaigns-page" aria-labelledby="ngo-outreach-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="ngo-outreach-heading">Community outreach</h1>
          <p>Plan activities and record the people reached.</p>
        </div>
        <Megaphone size={22} aria-hidden="true" />
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}

      <form className="ngo-campaign-form" onSubmit={saveActivity}>
        <div className="ngo-campaign-form-heading">
          <h2>{editingActivityId ? "Edit activity" : "Schedule outreach"}</h2>
          {editingActivityId && <button type="button" className="donor-text-action" onClick={resetForm}>Cancel edit</button>}
        </div>
        <label className="ngo-campaign-name">
          Activity title
          <input name="title" minLength="3" maxLength="120" value={form.title} onChange={updateField} required />
        </label>
        <label>
          Activity type
          <select name="activityType" value={form.activityType} onChange={updateField} required>
            {ACTIVITY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Date and time
          <input name="scheduledAt" type="datetime-local" value={form.scheduledAt} onChange={updateField} required />
        </label>
        <label>
          Location
          <input name="location" minLength="2" maxLength="180" value={form.location} onChange={updateField} required />
        </label>
        <label>
          Related campaign <span className="ngo-campaign-optional">Optional</span>
          <select name="campaignId" value={form.campaignId} onChange={updateField}>
            <option value="">Standalone outreach</option>
            {campaigns.map((campaign) => <option key={campaign.campaignId} value={campaign.campaignId}>{campaign.name}</option>)}
          </select>
        </label>
        <label>
          People reached
          <input name="peopleReached" type="number" min="0" max="100000" value={form.peopleReached} onChange={updateField} required />
        </label>
        <label className="ngo-campaign-description">
          Description
          <textarea name="description" minLength="10" maxLength="2000" rows="3" value={form.description} onChange={updateField} required />
        </label>
        <div className="ngo-campaign-form-actions">
          <span>Activities begin as planned.</span>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingActivityId ? "Save changes" : "Schedule activity"}
          </button>
        </div>
      </form>

      <div className="ngo-campaign-list-heading">
        <h2>Outreach activity</h2>
        <span>{activities.length} activities</span>
      </div>
      <div className="donor-table-wrap">
        <table className="donor-table ngo-outreach-table">
          <thead><tr><th>Activity</th><th>Scheduled</th><th>Location</th><th>Campaign</th><th>People reached</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" className="donor-table-empty">Loading outreach activities...</td></tr>
              : activities.length === 0 ? <tr><td colSpan="7" className="donor-table-empty">No outreach activities yet.</td></tr>
                : activities.map((activity) => (
                  <tr key={activity.activityId}>
                    <td><strong>{activity.title}</strong><small className="ngo-campaign-description-preview">{ACTIVITY_TYPES.find(([value]) => value === activity.activityType)?.[1] || activity.activityType}</small></td>
                    <td>{formatDate(activity.scheduledAt)} · {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(activity.scheduledAt))}</td>
                    <td>{activity.location}</td>
                    <td>{activity.campaign?.name || "Standalone"}</td>
                    <td>{activity.peopleReached}</td>
                    <td><span className="donor-status-tag">{activity.status}</span></td>
                    <td className="ngo-campaign-actions">
                      {activity.status === "PLANNED" && <button className="donor-text-action" type="button" disabled={updatingId === activity.activityId} onClick={() => updateStatus(activity, "IN_PROGRESS")}>Start</button>}
                      {activity.status === "IN_PROGRESS" && <button className="donor-text-action" type="button" disabled={updatingId === activity.activityId} onClick={() => updateStatus(activity, "COMPLETED")}>Complete</button>}
                      {["PLANNED", "IN_PROGRESS"].includes(activity.status) && (
                        <>
                          <button className="donor-text-action" type="button" onClick={() => startEditing(activity)}>Edit</button>
                          <button className="donor-text-action danger" type="button" disabled={updatingId === activity.activityId} onClick={() => updateStatus(activity, "CANCELLED")}>Cancel</button>
                        </>
                      )}
                      {["COMPLETED", "CANCELLED"].includes(activity.status) && <span>Closed</span>}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function NgoNotificationsPage({ onUnreadCountChange }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    ngoAPI.getNotifications()
      .then((response) => {
        if (cancelled) return;
        setNotifications(response.data.notifications || []);
        setUnreadCount(response.data.unreadCount || 0);
        onUnreadCountChange?.(response.data.unreadCount || 0);
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
    setNotice("");
    setUpdatingId(notification.notificationId);
    try {
      await ngoAPI.markNotificationRead(notification.notificationId);
      setNotifications((current) => current.map((item) => item.notificationId === notification.notificationId
        ? { ...item, readAt: new Date().toISOString() }
        : item));
      setUnreadCount((count) => Math.max(0, count - 1));
      onUnreadCountChange?.((count) => Math.max(0, count - 1));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update this notification."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function markAllRead() {
    setError("");
    setNotice("");
    try {
      await ngoAPI.markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
      setUnreadCount(0);
      onUnreadCountChange?.(0);
      setNotice("All notifications marked as read.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update notifications."));
    }
  }

  const visibleNotifications = unreadOnly
    ? notifications.filter((notification) => !notification.readAt)
    : notifications;

  return (
    <section className="donor-page-panel ngo-campaigns-page ngo-notifications-page" aria-labelledby="ngo-notifications-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="ngo-notifications-heading">Notifications</h1>
          <p>Campaign activity updates for your organization.</p>
        </div>
        <span className="ngo-notification-count">{unreadCount} unread</span>
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}

      <div className="ngo-notification-toolbar">
        <label className="ngo-unread-filter">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
          Unread only
        </label>
        <button type="button" className="donor-text-action" onClick={markAllRead} disabled={unreadCount === 0}>Mark all as read</button>
      </div>

      <div className="ngo-notification-list" aria-live="polite">
        {loading ? <div className="donor-page-state" role="status">Loading notifications...</div>
          : visibleNotifications.length === 0 ? <div className="donor-page-state">{unreadOnly ? "No unread notifications." : "No campaign notifications yet."}</div>
            : visibleNotifications.map((notification) => (
              <article className={`ngo-notification-row${notification.readAt ? " read" : " unread"}`} key={notification.notificationId}>
                <div className="ngo-notification-copy">
                  <div className="ngo-notification-title-row">
                    <strong>{notification.title || "Notification"}</strong>
                    {!notification.readAt && <span className="ngo-unread-indicator">Unread</span>}
                  </div>
                  <p>{notification.message}</p>
                  {notification.campaign && <span className="ngo-notification-campaign">{notification.campaign.name}</span>}
                  <time dateTime={notification.createdAt}>{formatDate(notification.createdAt)} · {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(notification.createdAt))}</time>
                </div>
                {!notification.readAt && (
                  <button className="donor-text-action" type="button" disabled={updatingId === notification.notificationId} onClick={() => markRead(notification)}>
                    Mark read
                  </button>
                )}
              </article>
            ))}
      </div>
      <button className="ngo-notification-refresh" type="button" onClick={() => { setLoading(true); setRefreshKey((current) => current + 1); }}>
        Refresh
      </button>
    </section>
  );
}

export function NgoReportsPage() {
  const yearStart = `${REPORT_TODAY.slice(0, 4)}-01-01`;
  const [dateInputs, setDateInputs] = useState({ from: yearStart, to: REPORT_TODAY });
  const [filters, setFilters] = useState({ from: yearStart, to: REPORT_TODAY });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    ngoAPI.getReports(filters)
      .then((response) => {
        if (!cancelled) setReport(response.data);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load reports."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filters]);

  function applyFilters(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setFilters(dateInputs);
  }

  const metrics = report?.metrics || {};
  const metricCards = [
    ["Campaigns", metrics.campaigns ?? 0],
    ["Active campaigns", metrics.activeCampaigns ?? 0],
    ["Donor registrations", metrics.registeredDonors ?? 0],
    ["Outreach activities", metrics.outreachActivities ?? 0],
    ["People reached", metrics.peopleReached ?? 0],
  ];

  return (
    <section className="donor-page-panel ngo-campaigns-page ngo-reports-page" aria-labelledby="ngo-reports-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="ngo-reports-heading">Campaign and outreach report</h1>
          <p>Activity totals for the selected period.</p>
        </div>
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}

      <form className="ngo-report-filters" onSubmit={applyFilters}>
        <label>From<input type="date" value={dateInputs.from} max={dateInputs.to} onChange={(event) => setDateInputs((current) => ({ ...current, from: event.target.value }))} required /></label>
        <label>To<input type="date" value={dateInputs.to} min={dateInputs.from} max={REPORT_TODAY} onChange={(event) => setDateInputs((current) => ({ ...current, to: event.target.value }))} required /></label>
        <button className="primary-button" type="submit">Apply dates</button>
      </form>

      <div className="ngo-report-metrics" aria-live="polite">
        {metricCards.map(([label, value]) => (
          <div className="ngo-report-metric" key={label}>
            <span>{label}</span>
            <strong>{loading ? "—" : value}</strong>
          </div>
        ))}
      </div>

      <div className="ngo-campaign-list-heading">
        <h2>Campaign performance</h2>
        <span>{report?.campaigns?.length || 0} campaigns</span>
      </div>
      <div className="donor-table-wrap">
        <table className="donor-table ngo-campaign-table">
          <thead><tr><th>Campaign</th><th>Status</th><th>Donor registrations</th><th>Outreach activities</th><th>People reached</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="5" className="donor-table-empty">Loading report...</td></tr>
              : !report?.campaigns?.length ? <tr><td colSpan="5" className="donor-table-empty">No campaign data in this date range.</td></tr>
                : report.campaigns.map((campaign) => (
                  <tr key={campaign.campaignId}>
                    <td><strong>{campaign.name}</strong><small className="ngo-campaign-description-preview">{formatDate(campaign.startDate)} – {formatDate(campaign.endDate)} · {campaign.location}</small></td>
                    <td><span className="donor-status-tag">{campaign.status}</span></td>
                    <td>{campaign.registeredDonors}</td>
                    <td>{campaign.outreachActivities}</td>
                    <td>{campaign.peopleReached}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="ngo-campaign-list-heading">
        <h2>Outreach by activity type</h2>
        <span>{report?.activityTypes?.length || 0} types</span>
      </div>
      <div className="donor-table-wrap">
        <table className="donor-table ngo-activity-report-table">
          <thead><tr><th>Activity type</th><th>Activities</th><th>People reached</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="3" className="donor-table-empty">Loading report...</td></tr>
              : !report?.activityTypes?.length ? <tr><td colSpan="3" className="donor-table-empty">No outreach data in this date range.</td></tr>
                : report.activityTypes.map((item) => (
                  <tr key={item.activityType}>
                    <td>{ACTIVITY_TYPES.find(([value]) => value === item.activityType)?.[1] || item.activityType}</td>
                    <td>{item.activities}</td>
                    <td>{item.peopleReached}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}