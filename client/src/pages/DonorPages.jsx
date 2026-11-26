import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplet,
  MapPin,
  Search,
  X,
} from "lucide-react";

import { donorAPI, getCurrentUser } from "../services/api";
import { ageFromDateOfBirth, dateInputYearsAgo } from "../utils/dateOfBirth";
import "./donor-pages.css";
import OpenStreetMapLocationPicker from "../components/OpenStreetMapLocationPicker";

const PAGE_SIZE = 15;
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];

function errorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function PageMessage({ error, notice }) {
  return (
    <>
      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}
    </>
  );
}

export function DonorProfilePage({ onProfileUpdated }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    donorAPI.getProfile()
      .then((response) => {
      if (!cancelled) {
        setForm({
          ...response.data.user,
          birthDate: response.data.user.birthDate?.slice(0, 10) || "",
        });
      }
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, "Unable to load your profile."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await donorAPI.updateProfile({
        ...form,
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
      });
      setForm((current) => ({ ...current, ...response.data.user }));
      onProfileUpdated?.(response.data.user);
      setNotice("Your profile was updated.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to update your profile."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="donor-page-state" role="status">Loading your profile...</div>;
  if (!form) return <PageMessage error={error} />;

  return (
    <section className="donor-page-panel" aria-labelledby="donor-profile-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="donor-profile-heading">Donor profile</h1>
          <p>Your personal and donation details.</p>
        </div>
      </header>
      <PageMessage error={error} notice={notice} />
      <p className="donor-location-map-help wide-field">
        {form.nextEligibleDonationDate
          ? `Earliest date you may donate again: ${formatDate(form.nextEligibleDonationDate)}.`
          : "No successful donation date is currently recorded."} Hospital blood-bank staff make the final medical clearance decision.
      </p>
      <form className="donor-profile-form" onSubmit={saveProfile}>
        <label>First name<input name="firstName" value={form.firstName || ""} onChange={updateField} minLength="2" maxLength="50" required /></label>
        <label>Last name<input name="lastName" value={form.lastName || ""} onChange={updateField} minLength="2" maxLength="50" required /></label>
        <label>Email<input name="email" type="email" value={form.email || ""} onChange={updateField} maxLength="254" required /></label>
        <label>Phone<input name="phone" type="tel" value={form.phone || ""} onChange={updateField} minLength="10" maxLength="20" required /></label>
        <label>Blood type<select name="bloodType" value={form.bloodType || ""} onChange={updateField} required><option value="">Choose blood type</option>{BLOOD_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Date of birth<input name="birthDate" type="date" min={dateInputYearsAgo(100)} max={dateInputYearsAgo(18)} value={form.birthDate || ""} onChange={updateField} required /></label>
        <div className="donor-profile-age" aria-live="polite">
          Current age: {form.birthDate && ageFromDateOfBirth(form.birthDate) !== null ? ageFromDateOfBirth(form.birthDate) : "Enter a valid date of birth"}
        </div>
        <label>Gender<select name="gender" value={(form.gender || "").toUpperCase()} onChange={updateField} required><option value="">Choose gender</option>{GENDERS.map((gender) => <option key={gender} value={gender}>{gender.replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
        <label className="wide-field">Address<input name="address" value={form.address || ""} onChange={updateField} maxLength="255" required /></label>
        <div className="wide-field donor-location-fields">
          <div className="donor-location-heading">
            <span>Donor location <small>Required for nearby blood alerts</small></span>
            <button type="button" className="donor-text-action" onClick={useCurrentLocation} disabled={locating || saving}>
              <MapPin size={15} /> {locating ? "Getting location..." : "Use my location"}
            </button>
          </div>
          <div className="donor-location-coordinates">
            <label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" value={form.latitude ?? ""} onChange={updateField} /></label>
            <label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" value={form.longitude ?? ""} onChange={updateField} /></label>
          </div>
          <OpenStreetMapLocationPicker
            latitude={form.latitude}
            longitude={form.longitude}
            onLocationSelect={({ latitude, longitude }) => setForm((current) => ({
              ...current,
              latitude: latitude.toFixed(6),
              longitude: longitude.toFixed(6),
            }))}
          />
        </div>
        <div className="donor-form-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button></div>
      </form>
    </section>
  );
}

export function DonorDonationsPage() {
  const [donations, setDonations] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    donorAPI.getDonations({ page, pageSize: PAGE_SIZE })
      .then((response) => {
        if (cancelled) return;
        setDonations(response.data.donations || []);
        setPagination(response.data.pagination || { total: 0, totalPages: 0 });
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, "Unable to load donation history."));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  async function showDonation(donationId) {
    setDetailLoading(true);
    setError("");
    try {
      const response = await donorAPI.getDonation(donationId);
      setSelectedDonation(response.data.donation);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to load this donation record."));
    } finally {
      setDetailLoading(false);
    }
  }

  const firstRow = pagination.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(page * PAGE_SIZE, pagination.total);

  return (
    <section className="donor-page-panel" aria-labelledby="donor-donations-heading">
      <header className="donor-page-heading"><div><h1 id="donor-donations-heading">Donation history</h1><p>Your recorded donations.</p></div><span>{pagination.total} records</span></header>
      <PageMessage error={error} />
      <div className="donor-table-wrap">
        <table className="donor-table">
          <thead><tr><th>Date</th><th>Blood type</th><th>Quantity</th><th>Hospital</th><th>Status</th><th><span className="sr-only">Donation details</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6" className="donor-table-empty">Loading donation history...</td></tr>
              : donations.length === 0 ? <tr><td colSpan="6" className="donor-table-empty">No donation records yet.</td></tr>
                : donations.map((donation) => (
                  <tr key={donation.donationId}>
                    <td>{formatDate(donation.donationDate)}</td>
                    <td><strong className="donor-blood-type">{donation.bloodType}</strong></td>
                    <td>{donation.quantity} ml</td>
                    <td>{donation.hospital || "Not recorded"}</td>
                    <td><span className="donor-status-tag">{donation.status}</span></td>
                    <td><button type="button" className="donor-text-action" onClick={() => showDonation(donation.donationId)} disabled={detailLoading}>View</button></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <footer className="donor-pagination"><span>Showing {firstRow}-{lastRow} of {pagination.total}</span><div>
        <button type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={18} /></button>
        <span>Page {page} of {Math.max(1, pagination.totalPages)}</span>
        <button type="button" aria-label="Next page" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)}><ChevronRight size={18} /></button>
      </div></footer>
      {selectedDonation && (
        <div className="donor-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDonation(null); }}>
          <section className="donor-modal" role="dialog" aria-modal="true" aria-labelledby="donation-detail-heading">
            <header><h2 id="donation-detail-heading">Donation details</h2><button type="button" aria-label="Close donation details" onClick={() => setSelectedDonation(null)}><X size={19} /></button></header>
            <dl><dt>Date</dt><dd>{formatDate(selectedDonation.donationDate)}</dd><dt>Blood type</dt><dd>{selectedDonation.bloodType}</dd><dt>Quantity</dt><dd>{selectedDonation.quantity} ml</dd><dt>Status</dt><dd>{selectedDonation.status}</dd><dt>Hospital</dt><dd>{selectedDonation.hospital || "Not recorded"}</dd><dt>Notes</dt><dd>{selectedDonation.notes || "No notes"}</dd></dl>
          </section>
        </div>
      )}
    </section>
  );
}

export function DonorAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [donationEligibility, setDonationEligibility] = useState(null);
  const [questionnaireStatus, setQuestionnaireStatus] = useState(null);
  const [location, setLocation] = useState(null);
  const [nearbyHospitals, setNearbyHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [form, setForm] = useState({ slotId: "", purpose: "Blood Donation", hospitalId: "" });
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nearbySearchKey, setNearbySearchKey] = useState(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    donorAPI.getAppointments()
      .then((response) => {
        if (cancelled) return;
        setAppointments(response.data.appointments || []);
      })
      .catch((requestError) => { if (!cancelled) setError(errorMessage(requestError, "Unable to load appointments.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    donorAPI.getProfile()
      .then((response) => {
        if (!cancelled) setDonationEligibility(response.data.user);
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, "Unable to load your donation interval."));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    donorAPI.getQuestionnaireSubmissions()
      .then((response) => {
        if (cancelled) return;
        const submissions = response.data?.submissions || [];
        setQuestionnaireStatus(submissions[0]?.status || null);
      })
      .catch(() => {
        if (!cancelled) setQuestionnaireStatus(null);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedHospital) return undefined;

    let cancelled = false;
    donorAPI.getAppointmentSlots(selectedHospital.hospitalId)
      .then((response) => {
        if (!cancelled) setAvailableSlots(response.data.slots || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, "Unable to load appointment availability."));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedHospital]);

  useEffect(() => {
    if (
      !location ||
      !Number.isFinite(Number(location.latitude)) ||
      !Number.isFinite(Number(location.longitude))
    ) {
      return undefined;
    }

    let cancelled = false;
    const searchKey = `${Number(location.latitude)},${Number(location.longitude)}`;
    donorAPI.getNearbyHospitals(location)
      .then((response) => {
        if (!cancelled) setNearbyHospitals(response.data.hospitals || []);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setNearbyHospitals([]);
          setError(errorMessage(requestError, "Unable to find nearby hospitals."));
        }
      })
      .finally(() => {
        if (!cancelled) setNearbySearchKey(searchKey);
      });

    return () => { cancelled = true; };
  }, [location]);

  function updateSearchLocation(nextLocation) {
    setError("");
    setLocation(nextLocation);
    setNearbyHospitals([]);
    setNearbySearchKey(null);
    setSelectedHospital(null);
    setAvailableSlots([]);
    setSlotsLoading(false);
    setForm((current) => ({ ...current, hospitalId: "" }));
  }

  function useCurrentLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location access is not available in this browser. Choose a location on the map.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        updateSearchLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setError("Unable to get your location. Allow location access or choose a location on the map.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function selectHospital(hospital) {
    setSelectedHospital(hospital);
    setAvailableSlots([]);
    setSlotsLoading(true);
    setForm((current) => ({ ...current, hospitalId: String(hospital.hospitalId), slotId: "" }));
  }

  const currentSearchKey = location &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude))
    ? `${Number(location.latitude)},${Number(location.longitude)}`
    : null;
  const nearbyLoading = Boolean(currentSearchKey && nearbySearchKey !== currentSearchKey);

  async function bookAppointment(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await donorAPI.createAppointment({
        slotId: Number(form.slotId),
        purpose: form.purpose,
        hospitalId: Number(form.hospitalId),
        locationLatitude: Number(location.latitude),
        locationLongitude: Number(location.longitude),
      });
      setNotice(response.message || "Appointment booked.");
      setForm({ slotId: "", purpose: "Blood Donation", hospitalId: "" });
      setSelectedHospital(null);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to book this appointment."));
    } finally {
      setSaving(false);
    }
  }

  async function cancelAppointment(appointment) {
    if (!window.confirm("Cancel this appointment?")) return;
    setError("");
    setNotice("");
    try {
      const response = await donorAPI.cancelAppointment(appointment.appointmentId);
      setNotice(response.message || "Appointment cancelled.");
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to cancel this appointment."));
    }
  }

  return (
    <section className="donor-page-panel" aria-labelledby="donor-appointments-heading">
      <header className="donor-page-heading"><div><h1 id="donor-appointments-heading">Appointments</h1><p>Book a visit or manage upcoming appointments.</p></div></header>
      <PageMessage error={error} notice={notice} />
      <div className="donor-nearby-hospitals">
        <div className="donor-nearby-heading">
          <div>
            <h2>Nearby hospitals</h2>
            <p>Choose your location to see the three closest hospitals at their permanent map pins.</p>
          </div>
          <button type="button" className="donor-text-action" onClick={useCurrentLocation} disabled={locating || saving}>
            <MapPin size={15} /> {locating ? "Finding you..." : "Use my location"}
          </button>
        </div>
        <OpenStreetMapLocationPicker
          latitude={location?.latitude ?? ""}
          longitude={location?.longitude ?? ""}
          hospitals={nearbyHospitals}
          selectedHospitalId={selectedHospital?.hospitalId ?? null}
          onLocationSelect={updateSearchLocation}
          onHospitalSelect={selectHospital}
        />
        {nearbyLoading ? (
          <div className="donor-page-state" role="status">Finding the closest hospitals...</div>
        ) : !location ? (
          <div className="donor-page-state">Use your location or click the map to find nearby hospitals.</div>
        ) : nearbyHospitals.length === 0 ? (
          <div className="donor-page-state">No active hospitals with permanent map pins are available.</div>
        ) : (
          <div className="donor-nearby-hospital-list" aria-label="Three closest hospitals">
            {nearbyHospitals.map((hospital, index) => (
              <button
                type="button"
                className={`donor-nearby-hospital${selectedHospital?.hospitalId === hospital.hospitalId ? " selected" : ""}`}
                key={hospital.hospitalId}
                onClick={() => selectHospital(hospital)}
                aria-pressed={selectedHospital?.hospitalId === hospital.hospitalId}
              >
                <span className="donor-nearby-rank">{index + 1}</span>
                <span className="donor-nearby-hospital-info">
                  <strong>{hospital.name}</strong>
                  <small>{hospital.location}</small>
                </span>
                <span className="donor-nearby-distance">{hospital.distanceKm.toFixed(1)} km</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="donor-location-map-help">
        {donationEligibility?.nextEligibleDonationDate
          ? `Based on your last successful donation, choose a donation slot on or after ${formatDate(donationEligibility.nextEligibleDonationDate)}.`
          : "Hospital staff will make the final medical clearance decision for every donation."}
        {" "}This scheduling interval does not replace hospital medical screening.
      </p>
      {questionnaireStatus && (
        <p className="donor-location-map-help">
          Questionnaire status: <strong>{questionnaireStatus}</strong>.
          {questionnaireStatus === "PENDING" && " Your questionnaire is awaiting KNBTS review, so approval has not been issued yet."}
          {questionnaireStatus === "APPROVED" && " KNBTS has reviewed this submission; final booking eligibility is confirmed by the server."}
          {questionnaireStatus === "DECLINED" && " This submission was declined. Complete a new questionnaire only when eligible."}
          {questionnaireStatus === "DRAFT" && " Complete and submit the questionnaire before booking with an approval."}
        </p>
      )}
      <form className="donor-appointment-form" onSubmit={bookAppointment}>
        <label>Available appointment slot
          <select value={form.slotId} onChange={(event) => setForm({ ...form, slotId: event.target.value })} required disabled={!selectedHospital || slotsLoading}>
            <option value="">{slotsLoading ? "Loading available slots..." : selectedHospital ? "Choose an available slot" : "Choose a hospital first"}</option>
            {availableSlots.map((slot) => (
              <option
                key={slot.slotId}
                value={slot.slotId}
                disabled={
                  form.purpose === "Blood Donation" &&
                  donationEligibility?.nextEligibleDonationDate &&
                  String(slot.slotDate).slice(0, 10) < donationEligibility.nextEligibleDonationDate.slice(0, 10)
                }
              >
                {formatDate(slot.slotDate)} · {slot.time} · {slot.availableCount} place{slot.availableCount === 1 ? "" : "s"} left
                {form.purpose === "Blood Donation" &&
                donationEligibility?.nextEligibleDonationDate &&
                String(slot.slotDate).slice(0, 10) < donationEligibility.nextEligibleDonationDate.slice(0, 10)
                  ? " · before next eligible date"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>Visit type<select value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })}><option>Blood Donation</option><option>Blood Test</option></select></label>
        <label>Selected hospital<input type="text" value={selectedHospital?.name || ""} readOnly placeholder="Choose a nearby hospital above" required /></label>
        {selectedHospital && !slotsLoading && availableSlots.length === 0 && <p className="donor-location-map-help">This hospital has not published any available appointment slots.</p>}
        <button type="submit" className="primary-button" disabled={saving || loading || nearbyLoading || slotsLoading || !selectedHospital || !form.slotId}>{saving ? "Booking..." : "Book appointment"}</button>
      </form>
      <div className="donor-appointment-list">
        {loading ? <div className="donor-page-state" role="status">Loading appointments...</div>
          : appointments.length === 0 ? <div className="donor-page-state">No appointments yet. Book your next visit above.</div>
            : appointments.map((appointment) => {
              const canCancel = ["SCHEDULED", "CONFIRMED"].includes(appointment.status) && new Date(appointment.date) >= new Date(new Date().setHours(0, 0, 0, 0));
              return <article className="donor-appointment-row" key={appointment.appointmentId}>
                <div className="donor-appointment-icon"><CalendarDays size={19} /></div>
                <div className="donor-appointment-main"><strong>{formatDate(appointment.date)} · {appointment.time}</strong><span>{appointment.purpose} · {appointment.hospital?.name || "Hospital not assigned"}</span></div>
                <span className="donor-status-tag">{appointment.status}</span>
                {canCancel && <button type="button" className="donor-text-action danger" onClick={() => cancelAppointment(appointment)}>Cancel</button>}
              </article>;
            })}
      </div>
    </section>
  );
}

export function DonorAlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    donorAPI.getAlerts()
      .then((response) => { if (!cancelled) setAlerts(response.data.alerts || []); })
      .catch((requestError) => { if (!cancelled) setError(errorMessage(requestError, "Unable to load emergency requests.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const intervalId = window.setInterval(() => setRefreshKey((current) => current + 1), 30000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [refreshKey]);

  async function respondToAlert(requestId, response) {
    setBusyRequestId(requestId);
    setError("");
    setNotice("");
    try {
      const result = await donorAPI.respondToAlert(requestId, response);
      setNotice(result.message || "Your response was recorded.");
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to respond to this alert."));
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <section className="donor-page-panel" aria-labelledby="donor-alerts-heading">
      <header className="donor-page-heading"><div><h1 id="donor-alerts-heading">Emergency alerts</h1><p>Nearby blood requests matched to your blood type and location.</p></div><span>{alerts.length} alerts</span></header>
      <PageMessage error={error} notice={notice} />
      {loading ? <div className="donor-page-state" role="status">Loading emergency requests...</div>
        : alerts.length === 0 ? <div className="donor-page-state">There are no matching open requests right now.</div>
          : <div className="donor-alert-list">{alerts.map((alert) => <article className="donor-alert-row" key={alert.requestId}>
            <div className="donor-alert-symbol"><AlertTriangle size={19} /></div>
            <div className="donor-alert-content">
              <strong>{alert.bloodType} blood needed · {alert.urgencyLevel}</strong>
              <span>{alert.hospital?.name || "Nearby request"}</span>
              <small>{Number.isFinite(alert.distanceKm) ? `${alert.distanceKm.toFixed(1)} km away` : "Nearby"} · Alert wave {alert.wave}</small>
              <small>{alert.hospital?.location || (Number.isFinite(alert.latitude) && Number.isFinite(alert.longitude)
                ? `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`
                : "Location not provided")}</small>
              {alert.notes && <p>{alert.notes}</p>}
            </div>
            <div className="donor-alert-meta"><span>{alert.quantityRequired} units</span><small>Needed by {formatDate(alert.neededBy)}</small>
              {alert.matchStatus === "NOTIFIED" ? <div className="donor-alert-actions">
                <button type="button" className="primary-button" disabled={busyRequestId === alert.requestId} onClick={() => respondToAlert(alert.requestId, "ACCEPT")}>Accept</button>
                <button type="button" className="donor-text-action" disabled={busyRequestId === alert.requestId} onClick={() => respondToAlert(alert.requestId, "DECLINE")}>Decline</button>
              </div> : <strong className="donor-alert-response">{alert.matchStatus.toLowerCase()}</strong>}
            </div>
          </article>)}</div>}
    </section>
  );
}
