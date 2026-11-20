import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";

import { patientAPI } from "../services/api";
import "./donor-pages.css";
import "./patient-pages.css";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const URGENCY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const MIN_NEEDED_BY_DATE = new Date().toISOString().slice(0, 10);

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function PublicAssistanceEnquiryPage() {
  const [hospitals, setHospitals] = useState([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    submitterName: "",
    submitterEmail: "",
    bloodType: "",
    quantityRequired: "1",
    urgencyLevel: "MEDIUM",
    neededBy: "",
    preferredHospitalId: "",
    description: "",
  });
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [enquiry, setEnquiry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    patientAPI.getHospitals()
      .then((response) => {
        if (!cancelled) setHospitals(response.data.hospitals || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load hospital options."));
      })
      .finally(() => {
        if (!cancelled) setLoadingHospitals(false);
      });
    return () => { cancelled = true; };
  }, []);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitEnquiry(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await patientAPI.createAssistanceEnquiry({
        ...form,
        quantityRequired: Number(form.quantityRequired),
        preferredHospitalId: form.preferredHospitalId ? Number(form.preferredHospitalId) : undefined,
      });
      setEnquiry(response.data.enquiry);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to submit the assistance enquiry."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="public-assistance-shell">
      <section className="donor-page-panel public-assistance-panel" aria-labelledby="public-assistance-heading">
        <header className="donor-page-heading">
          <div>
            <h1 id="public-assistance-heading">Request hospital assistance</h1>
            <p>Share your contact details and blood need with a hospital team for verification.</p>
          </div>
          <ClipboardList size={22} aria-hidden="true" />
        </header>
        {error && <div className="donor-page-message error" role="alert">{error}</div>}
        {enquiry ? (
          <div className="public-assistance-confirmation" role="status">
            <h2>Enquiry submitted for hospital verification</h2>
            <p>Your reference number is <strong>#{enquiry.enquiryId}</strong>. This is not an official blood request and no donors have been alerted.</p>
            <p>Keep this reference available when contacting the hospital. Once verified, hospital staff can create and coordinate an official request.</p>
            <Link to="/login">Sign in to track requests if you have an account</Link>
            <button type="button" className="donor-text-action" onClick={() => setEnquiry(null)}>Submit another enquiry</button>
          </div>
        ) : (
          <>
            <div className="donor-page-message" role="note">
              <AlertTriangle size={16} /> An assistance enquiry does not trigger donor matching. Only authorized hospital staff can verify it and create an official request.
            </div>
            <form className="patient-request-form public-enquiry-form" onSubmit={submitEnquiry}>
              <label>Patient first name<input name="firstName" minLength="2" maxLength="50" value={form.firstName} onChange={updateField} required /></label>
              <label>Patient last name<input name="lastName" minLength="2" maxLength="50" value={form.lastName} onChange={updateField} required /></label>
              <label>Patient contact phone<input name="phone" type="tel" minLength="10" maxLength="20" value={form.phone} onChange={updateField} required /></label>
              <label>Your name<input name="submitterName" minLength="2" maxLength="100" value={form.submitterName} onChange={updateField} required /></label>
              <label>Your email <span className="patient-request-optional">Optional</span><input name="submitterEmail" type="email" value={form.submitterEmail} onChange={updateField} /></label>
              <label>Blood type<select name="bloodType" value={form.bloodType} onChange={updateField} required><option value="">Choose blood type</option>{BLOOD_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>Units needed<input name="quantityRequired" type="number" min="1" max="20" value={form.quantityRequired} onChange={updateField} required /></label>
              <label>Urgency<select name="urgencyLevel" value={form.urgencyLevel} onChange={updateField} required>{URGENCY_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label>
              <label>Needed by<input name="neededBy" type="date" min={MIN_NEEDED_BY_DATE} value={form.neededBy} onChange={updateField} required /></label>
              <label>
                Preferred hospital <span className="patient-request-optional">Optional</span>
                <select name="preferredHospitalId" value={form.preferredHospitalId} onChange={updateField} disabled={loadingHospitals}>
                  <option value="">{loadingHospitals ? "Loading hospitals..." : "No preference"}</option>
                  {hospitals.map((hospital) => <option key={hospital.hospitalId} value={hospital.hospitalId}>{hospital.name} · {hospital.location}</option>)}
                </select>
              </label>
              <label className="patient-request-notes">Describe the assistance needed<textarea name="description" rows="4" minLength="10" maxLength="2000" value={form.description} onChange={updateField} required /></label>
              <div className="patient-request-actions">
                <Link to="/login">Already have an account? Sign in</Link>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit for hospital verification"}</button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
