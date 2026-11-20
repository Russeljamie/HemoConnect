import { useEffect, useState } from "react";
import { AlertTriangle, Bell, ClipboardList, MapPin } from "lucide-react";

import { patientAPI } from "../services/api";
import "./donor-pages.css";
import "./patient-pages.css";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const URGENCY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const MIN_NEEDED_BY_DATE = new Date().toISOString().slice(0, 10);

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

export function PatientRequestsPage({ onRequestCreated, onNotificationRead }) {
  const [requests, setRequests] = useState([]);
  const [patients, setPatients] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [form, setForm] = useState({
    patientId: "",
    bloodType: "",
    quantityRequired: "1",
    urgencyLevel: "MEDIUM",
    neededBy: "",
    preferredHospitalId: "",
    latitude: "",
    longitude: "",
    description: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [readingId, setReadingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    patientAPI.getRequests()
      .then((response) => {
        if (cancelled) return;
        setRequests(response.data.requests || []);
        setPatients(response.data.patients || []);
        setHospitals(response.data.hospitals || []);
        setEnquiries(response.data.enquiries || []);
        setNotifications(response.data.notifications || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load your requests."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const intervalId = window.setInterval(() => setRefreshKey((current) => current + 1), 30000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [refreshKey]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function useCurrentLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location access is not available in this browser. Enter coordinates manually.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((current) => ({
          ...current,
          latitude: coords.latitude.toFixed(6),
          longitude: coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      () => {
        setError("Unable to get your location. Allow location access or enter coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function submitEnquiry(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await patientAPI.createAssistanceEnquiry({
        ...form,
        patientId: form.patientId ? Number(form.patientId) : undefined,
        quantityRequired: Number(form.quantityRequired),
        preferredHospitalId: form.preferredHospitalId ? Number(form.preferredHospitalId) : undefined,
        latitude: form.latitude === "" ? undefined : Number(form.latitude),
        longitude: form.longitude === "" ? undefined : Number(form.longitude),
      });
      onRequestCreated?.();
      setNotice(response.message || "Your assistance enquiry was submitted for hospital verification.");
      setForm({
        patientId: "",
        bloodType: "",
        quantityRequired: "1",
        urgencyLevel: "MEDIUM",
        neededBy: "",
        preferredHospitalId: "",
        latitude: "",
        longitude: "",
        description: "",
      });
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to submit your request."));
    } finally {
      setSaving(false);
    }
  }

  async function markNotificationRead(notificationId) {
    setError("");
    setReadingId(notificationId);
    try {
      await patientAPI.markNotificationRead(notificationId);
      setNotifications((current) => current.map((notification) =>
        notification.notificationId === notificationId
          ? { ...notification, status: "READ", readAt: new Date().toISOString() }
          : notification
      ));
      onNotificationRead?.(notificationId);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to mark this notification as read."));
    } finally {
      setReadingId(null);
    }
  }

  return (
    <section className="donor-page-panel patient-requests-page" aria-labelledby="patient-requests-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="patient-requests-heading">Request assistance</h1>
          <p>Submit an enquiry for hospital review and track authorized requests.</p>
        </div>
        <ClipboardList size={22} aria-hidden="true" />
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}

      <div className="donor-page-message" role="note">
        <AlertTriangle size={16} /> This form sends an assistance enquiry only. It does not create an official blood request or alert donors.
      </div>
      <form className="patient-request-form" onSubmit={submitEnquiry}>
        {patients.length > 0 && (
          <label>
            Patient record
            <select name="patientId" value={form.patientId} onChange={updateField} required>
              <option value="">Choose the patient</option>
              {patients.map((patient) => (
                <option key={patient.patientId} value={patient.patientId}>
                  {patient.firstName} {patient.lastName}{patient.hospital?.name ? ` · ${patient.hospital.name}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Blood type
          <select name="bloodType" value={form.bloodType} onChange={updateField} required>
            <option value="">Choose blood type</option>
            {BLOOD_TYPES.map((bloodType) => <option key={bloodType}>{bloodType}</option>)}
          </select>
        </label>
        <label>
          Units needed
          <input name="quantityRequired" type="number" min="1" max="20" value={form.quantityRequired} onChange={updateField} required />
        </label>
        <label>
          Urgency
          <select name="urgencyLevel" value={form.urgencyLevel} onChange={updateField} required>
            {URGENCY_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label>
          Needed by
          <input name="neededBy" type="date" min={MIN_NEEDED_BY_DATE} value={form.neededBy} onChange={updateField} required />
        </label>
        <div className="patient-request-location patient-request-notes">
          <div className="patient-request-location-heading">
            <span>Request location</span>
            <button type="button" className="donor-text-action" onClick={useCurrentLocation} disabled={locating}>
              <MapPin size={15} /> {locating ? "Getting location..." : "Use my location"}
            </button>
          </div>
          <p>Donors are matched by distance from this point. Coordinates stay private.</p>
          <div className="patient-request-coordinate-fields">
            <label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" value={form.latitude} onChange={updateField} required /></label>
            <label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" value={form.longitude} onChange={updateField} required /></label>
          </div>
        </div>
        <label>
          Preferred hospital <span className="patient-request-optional">Optional</span>
          <select name="preferredHospitalId" value={form.preferredHospitalId} onChange={updateField}>
            <option value="">No hospital selected</option>
            {hospitals.map((hospital) => (
              <option key={hospital.hospitalId} value={hospital.hospitalId}>{hospital.name} · {hospital.location}</option>
            ))}
          </select>
        </label>
        <label className="patient-request-notes">
          Describe the assistance needed
          <textarea name="description" rows="3" minLength="10" maxLength="2000" value={form.description} onChange={updateField} placeholder="Share relevant information for hospital staff" required />
        </label>
        <div className="patient-request-actions">
          <span>Hospital verification is required before an official request can be created.</span>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Submitting..." : "Submit assistance enquiry"}
          </button>
        </div>
      </form>

      <div className="patient-requests-list">
        <div className="patient-requests-list-heading"><h2>Assistance enquiries</h2><span>{enquiries.length} enquiries</span></div>
        {loading ? <p className="donor-table-empty">Loading enquiries...</p>
          : enquiries.length === 0 ? <p className="donor-table-empty">No assistance enquiries yet.</p>
            : <div className="donor-table-wrap"><table className="donor-table patient-request-table">
              <thead><tr><th>Submitted</th><th>Blood type</th><th>Units</th><th>Hospital</th><th>Status</th><th>Official request</th></tr></thead>
              <tbody>{enquiries.map((enquiry) => (
                <tr key={enquiry.enquiryId}>
                  <td>{formatDate(enquiry.createdAt)}</td>
                  <td>{enquiry.requestedBloodType || "Not specified"}</td>
                  <td>{enquiry.quantityRequired ?? "—"}</td>
                  <td>{enquiry.preferredHospital?.name || "Awaiting hospital assignment"}</td>
                  <td><span className="donor-status-tag">{enquiry.status.replaceAll("_", " ")}</span></td>
                  <td>{enquiry.resultingRequest ? `#${enquiry.resultingRequest.requestId} · ${enquiry.resultingRequest.status}` : "Not created"}</td>
                </tr>
              ))}</tbody>
            </table></div>}
      </div>

      <div className="patient-requests-list">
        <div className="patient-requests-list-heading">
          <h2>Authorized request tracking</h2>
          <span>{requests.length} requests</span>
        </div>
        <div className="donor-table-wrap">
          <table className="donor-table patient-request-table">
            <thead>
              <tr><th>Requested</th><th>Blood type</th><th>Units</th><th>Needed by</th><th>Hospital</th><th>Urgency</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="7" className="donor-table-empty">Loading requests...</td></tr>
                : requests.length === 0 ? <tr><td colSpan="7" className="donor-table-empty">No authorized blood requests are linked to your account.</td></tr>
                  : requests.map((request) => (
                    <tr key={request.requestId}>
                      <td>{formatDate(request.requestDate)}</td>
                      <td><strong className="donor-blood-type">{request.bloodType}</strong></td>
                      <td>{request.quantityRequired}</td>
                      <td>{formatDate(request.neededBy)}</td>
                      <td>{request.hospital?.name || "Not specified"}</td>
                      <td>{request.urgencyLevel}</td>
                      <td>
                        <span className="donor-status-tag">{request.status}</span>
                        <small className="patient-request-matching-status">
                          {request.matching?.alertedDonors
                            ? `${request.matching.alertedDonors} donors alerted · ${request.matching.responses} responses`
                            : request.matching?.currentWave
                              ? `Searching alert wave ${request.matching.currentWave}`
                              : "Matching pending"}
                        </small>
                        {request.history?.length > 0 && (
                          <small className="patient-request-matching-status">
                            Latest update: {request.history[request.history.length - 1].action.replaceAll("_", " ")}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="patient-requests-list">
        <div className="patient-requests-list-heading"><h2>Notifications</h2><Bell size={18} aria-hidden="true" /></div>
        {notifications.length === 0 ? <p className="donor-table-empty">No notifications.</p>
          : notifications.map((notification) => (
            <article key={notification.notificationId} className="donor-page-message">
              <div><strong>{notification.title || "Update"}</strong><p>{notification.message}</p><small>{formatDate(notification.createdAt)}</small></div>
              {notification.status !== "READ" && (
                <button className="donor-text-action" type="button" disabled={readingId === notification.notificationId} onClick={() => markNotificationRead(notification.notificationId)}>
                  {readingId === notification.notificationId ? "Saving..." : "Mark read"}
                </button>
              )}
            </article>
          ))}
      </div>
    </section>
  );
}