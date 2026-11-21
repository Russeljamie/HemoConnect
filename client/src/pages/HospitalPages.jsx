import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, Droplet, MapPin, UserPlus } from "lucide-react";

import { hospitalAPI } from "../services/api";
import "./donor-pages.css";
import "./hospital-pages.css";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MIN_NEEDED_BY_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_REPORT_TO = new Date().toISOString().slice(0, 10);
const DEFAULT_REPORT_FROM = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

export function HospitalInventoryPage({ onInventoryUpdated }) {
  const [inventory, setInventory] = useState([]);
  const [form, setForm] = useState({ bloodType: "", unitsChange: "", reason: "" });
  const [minimumDrafts, setMinimumDrafts] = useState({});
  const [reportFilters, setReportFilters] = useState({
    from: DEFAULT_REPORT_FROM,
    to: DEFAULT_REPORT_TO,
    bloodType: "",
  });
  const [report, setReport] = useState({ summary: {}, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMinimumId, setSavingMinimumId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    hospitalAPI.getInventory()
      .then((response) => {
        if (!cancelled) setInventory(response.data.inventory || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load hospital inventory."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    hospitalAPI.getInventoryTransactions(reportFilters)
      .then((response) => {
        if (!cancelled) setReport(response.data || { summary: {}, transactions: [] });
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load inventory movements."));
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });
    return () => { cancelled = true; };
  }, [reportFilters, refreshKey]);

  async function adjustStock(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await hospitalAPI.adjustInventory({
        ...form,
        unitsChange: Number(form.unitsChange),
      });
      setNotice(response.message || "Inventory updated.");
      setForm({ bloodType: "", unitsChange: "", reason: "" });
      setLoading(true);
      setReportLoading(true);
      setRefreshKey((current) => current + 1);
      onInventoryUpdated?.();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to adjust inventory."));
    } finally {
      setSaving(false);
    }
  }

  async function saveMinimum(item) {
    const minimumUnits = Number(minimumDrafts[item.inventoryId] ?? item.minimumUnits);
    if (!Number.isInteger(minimumUnits) || minimumUnits < 0 || minimumUnits > 100000) {
      setError("Minimum stock must be a whole number from 0 to 100000.");
      return;
    }

    setError("");
    setNotice("");
    setSavingMinimumId(item.inventoryId);
    try {
      const response = await hospitalAPI.updateInventoryMinimum(item.inventoryId, minimumUnits);
      setInventory((current) => current.map((record) => (
        record.inventoryId === item.inventoryId ? response.data.inventory : record
      )));
      setMinimumDrafts((current) => {
        const next = { ...current };
        delete next[item.inventoryId];
        return next;
      });
      setNotice(response.message || "Minimum stock level updated.");
      onInventoryUpdated?.();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update the minimum stock level."));
    } finally {
      setSavingMinimumId(null);
    }
  }

  function exportTransactions() {
    const columns = ["Date", "Blood type", "Movement", "Units changed", "Reason"];
    const rows = report.transactions.map((transaction) => [
      new Date(transaction.createdAt).toISOString(),
      transaction.bloodType,
      getMovementLabel(transaction.transactionType),
      transaction.unitsChanged,
      transaction.reason || "",
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "hospital-inventory-movements.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateReportFilter(key, value) {
    setReportLoading(true);
    setReportFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="donor-page-panel hospital-operations-page" aria-labelledby="hospital-inventory-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="hospital-inventory-heading">Blood inventory</h1>
          <p>Manage current stock, minimum levels, and every recorded stock movement.</p>
        </div>
        <Droplet size={22} aria-hidden="true" />
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}

      <div className="hospital-inventory-guidance">
        <strong>Blood-drive stock:</strong> Add only accepted, usable units after screening and release.
        Enter a reason such as “Blood drive — 5 units released”. Donor collection records are in millilitres
        and do not automatically change inventory.
      </div>

      <form className="hospital-stock-form" onSubmit={adjustStock}>
        <label>
          Blood type
          <select value={form.bloodType} onChange={(event) => setForm({ ...form, bloodType: event.target.value })} required>
            <option value="">Choose blood type</option>
            {BLOOD_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label>
          Units change (+/-)
          <input type="number" min="-1000" max="1000" step="1" value={form.unitsChange} onChange={(event) => setForm({ ...form, unitsChange: event.target.value })} required />
        </label>
        <label>
          Reason
          <input maxLength="250" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required />
        </label>
        <button className="primary-button" type="submit" disabled={saving || Number(form.unitsChange) === 0 || form.reason.trim().length < 3}>
          {saving ? "Updating..." : "Update stock"}
        </button>
      </form>

      <div className="donor-table-wrap">
        <table className="donor-table hospital-inventory-table">
          <thead><tr><th>Blood type</th><th>Available</th><th>Minimum units</th><th>Stock status</th><th>Last updated</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="5" className="donor-table-empty">Loading inventory...</td></tr>
              : inventory.length === 0 ? <tr><td colSpan="5" className="donor-table-empty">No inventory records yet.</td></tr>
                : inventory.map((item) => {
                  const isLow = item.unitsAvailable <= item.minimumUnits;
                  return (
                    <tr key={item.inventoryId}>
                      <td><strong className="donor-blood-type">{item.bloodType}</strong></td>
                      <td>{item.unitsAvailable} units</td>
                      <td>
                        <form className="hospital-minimum-form" onSubmit={(event) => { event.preventDefault(); saveMinimum(item); }}>
                          <input
                            aria-label={`Minimum units for ${item.bloodType}`}
                            type="number"
                            min="0"
                            max="100000"
                            step="1"
                            value={minimumDrafts[item.inventoryId] ?? item.minimumUnits}
                            onChange={(event) => setMinimumDrafts((current) => ({ ...current, [item.inventoryId]: event.target.value }))}
                          />
                          <button type="submit" disabled={savingMinimumId === item.inventoryId}>
                            {savingMinimumId === item.inventoryId ? "Saving..." : "Save"}
                          </button>
                        </form>
                      </td>
                      <td><span className={`donor-status-tag${isLow ? " hospital-stock-low" : ""}`}>{isLow ? "At/below minimum" : "Available"}</span></td>
                      <td>{formatDate(item.updatedAt)}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <section className="hospital-movements" aria-labelledby="hospital-movements-heading">
        <div className="hospital-movements-heading">
          <div>
            <h2 id="hospital-movements-heading">Stock movements</h2>
            <p>Request fulfillment and manual changes are shown separately.</p>
          </div>
          <button className="primary-button" type="button" onClick={exportTransactions} disabled={reportLoading || report.transactions.length === 0}>
            Export CSV
          </button>
        </div>
        <div className="hospital-movement-filters">
          <label>From <input type="date" required value={reportFilters.from} max={reportFilters.to} onChange={(event) => updateReportFilter("from", event.target.value)} /></label>
          <label>To <input type="date" required value={reportFilters.to} min={reportFilters.from} max={DEFAULT_REPORT_TO} onChange={(event) => updateReportFilter("to", event.target.value)} /></label>
          <label>Blood type
            <select value={reportFilters.bloodType} onChange={(event) => updateReportFilter("bloodType", event.target.value)}>
              <option value="">All blood types</option>
              {BLOOD_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
        </div>
        <div className="hospital-movement-summary" aria-live="polite">
          <div><span>Added</span><strong>{report.summary?.unitsAdded || 0} units</strong></div>
          <div><span>Fulfilled requests</span><strong>{report.summary?.unitsFulfilled || 0} units</strong></div>
          <div><span>Manual removals</span><strong>{report.summary?.unitsManuallyRemoved || 0} units</strong></div>
          <div><span>Total outflow</span><strong>{report.summary?.totalUnitsOut || 0} units</strong></div>
        </div>
        <div className="donor-table-wrap">
          <table className="donor-table hospital-movement-table">
            <thead><tr><th>Date</th><th>Blood type</th><th>Movement</th><th>Units changed</th><th>Reason</th></tr></thead>
            <tbody>
              {reportLoading ? <tr><td colSpan="5" className="donor-table-empty">Loading movements...</td></tr>
                : report.transactions.length === 0 ? <tr><td colSpan="5" className="donor-table-empty">No stock movements in this period.</td></tr>
                  : report.transactions.map((transaction) => (
                    <tr key={transaction.transactionId}>
                      <td>{formatDate(transaction.createdAt)}</td>
                      <td><strong className="donor-blood-type">{transaction.bloodType}</strong></td>
                      <td>{getMovementLabel(transaction.transactionType)}</td>
                      <td>{transaction.unitsChanged > 0 ? "+" : ""}{transaction.unitsChanged}</td>
                      <td>{transaction.reason || "—"}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function getMovementLabel(transactionType) {
  if (transactionType === "REQUEST_FULFILLMENT") return "Request fulfillment";
  if (transactionType === "STOCK_ADDITION") return "Manual addition";
  if (transactionType === "STOCK_REMOVAL") return "Manual removal";
  return transactionType;
}

export function HospitalDonationNeedsPage() {
  const [needs, setNeeds] = useState([]);
  const [form, setForm] = useState({ bloodType: "", unitsNeeded: "1", neededBy: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    hospitalAPI.getDonationNeeds()
      .then((response) => {
        if (!cancelled) setNeeds(response.data.needs || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load hospital donation needs."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function createNeed(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await hospitalAPI.createDonationNeed({
        ...form,
        unitsNeeded: Number(form.unitsNeeded),
      });
      setNotice(response.message || "Donation need published to partner NGOs.");
      setForm({ bloodType: "", unitsNeeded: "1", neededBy: "", notes: "" });
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to publish this donation need."));
    } finally {
      setSaving(false);
    }
  }

  async function updateNeed(need, status) {
    setError("");
    setNotice("");
    try {
      const response = await hospitalAPI.updateDonationNeed(need.needId, status);
      setNotice(response.message || "Donation need updated.");
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update this donation need."));
    }
  }

  return (
    <section className="donor-page-panel hospital-operations-page" aria-labelledby="hospital-needs-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="hospital-needs-heading">Donation needs</h1>
          <p>Publish blood-drive priorities to your partner NGOs. This is separate from patient requests.</p>
        </div>
        <Droplet size={22} aria-hidden="true" />
      </header>
      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}
      <form className="hospital-stock-form" onSubmit={createNeed}>
        <label>Blood type<select value={form.bloodType} onChange={(event) => setForm({ ...form, bloodType: event.target.value })} required><option value="">Choose blood type</option>{BLOOD_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Units needed<input type="number" min="1" max="10000" value={form.unitsNeeded} onChange={(event) => setForm({ ...form, unitsNeeded: event.target.value })} required /></label>
        <label>Needed by<input type="date" min={MIN_NEEDED_BY_DATE} value={form.neededBy} onChange={(event) => setForm({ ...form, neededBy: event.target.value })} required /></label>
        <label className="hospital-form-wide">Notes<input maxLength="500" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Publishing..." : "Publish donation need"}</button>
      </form>
      <div className="donor-table-wrap">
        <table className="donor-table hospital-requests-table">
          <thead><tr><th>Blood type</th><th>Units needed</th><th>Needed by</th><th>Campaigns</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan="6" className="donor-table-empty">Loading donation needs...</td></tr>
            : needs.length === 0 ? <tr><td colSpan="6" className="donor-table-empty">No donation needs published.</td></tr>
              : needs.map((need) => <tr key={need.needId}>
                <td><strong className="donor-blood-type">{need.bloodType}</strong></td>
                <td>{need.unitsNeeded}</td>
                <td>{formatDate(need.neededBy)}</td>
                <td>{need._count?.campaigns || 0}</td>
                <td><span className="donor-status-tag">{need.status}</span></td>
                <td>
                  {need.status === "OPEN" && <button className="donor-text-action" type="button" onClick={() => updateNeed(need, "IN_PROGRESS")}>Coordinate</button>}
                  {need.status === "IN_PROGRESS" && <button className="donor-text-action" type="button" onClick={() => updateNeed(need, "FULFILLED")}>Mark fulfilled</button>}
                  {["OPEN", "IN_PROGRESS"].includes(need.status) && <button className="donor-text-action danger" type="button" onClick={() => updateNeed(need, "CANCELLED")}>Cancel</button>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HospitalRequestsPage({ onRequestUpdated }) {
  const [requests, setRequests] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [patients, setPatients] = useState([]);
  const [requestForm, setRequestForm] = useState({
    patientId: "",
    firstName: "",
    lastName: "",
    phone: "",
    bloodType: "",
    quantityRequired: "1",
    urgencyLevel: "MEDIUM",
    neededBy: "",
    latitude: "",
    longitude: "",
    notes: "",
  });
  const [accessForm, setAccessForm] = useState({ patientId: "", email: "", relationship: "" });
  const [fulfillmentQuantities, setFulfillmentQuantities] = useState({});
  const [enquiryLocations, setEnquiryLocations] = useState({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([hospitalAPI.getRequests(), hospitalAPI.getEnquiries(), hospitalAPI.getPatients()])
      .then(([requestsResponse, enquiriesResponse, patientsResponse]) => {
        if (cancelled) return;
        setRequests(requestsResponse.data.requests || []);
        setEnquiries(enquiriesResponse.data.enquiries || []);
        setPatients(patientsResponse.data.patients || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load incoming requests."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  function refreshData(message) {
    if (message) setNotice(message);
    setLoading(true);
    setRefreshKey((current) => current + 1);
    onRequestUpdated?.();
  }

  async function createOfficialRequest(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    const patientId = requestForm.patientId ? Number(requestForm.patientId) : undefined;
    const payload = {
      bloodType: requestForm.bloodType,
      quantityRequired: Number(requestForm.quantityRequired),
      urgencyLevel: requestForm.urgencyLevel,
      neededBy: requestForm.neededBy,
      latitude: requestForm.latitude === "" ? undefined : Number(requestForm.latitude),
      longitude: requestForm.longitude === "" ? undefined : Number(requestForm.longitude),
      notes: requestForm.notes || undefined,
      ...(patientId ? { patientId } : {
        patient: {
          firstName: requestForm.firstName,
          lastName: requestForm.lastName,
          phone: requestForm.phone,
          bloodType: requestForm.bloodType,
        },
      }),
    };
    try {
      const response = await hospitalAPI.createRequest(payload);
      setRequestForm({
        patientId: "", firstName: "", lastName: "", phone: "", bloodType: "",
        quantityRequired: "1", urgencyLevel: "MEDIUM", neededBy: "",
        latitude: "", longitude: "", notes: "",
      });
      refreshData(response.message || "Official request created.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to create the official request."));
    } finally {
      setSaving(false);
    }
  }

  async function grantAccess(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await hospitalAPI.createPatientAccess(
        Number(accessForm.patientId),
        accessForm.email,
        accessForm.relationship
      );
      setAccessForm({ patientId: "", email: "", relationship: "" });
      setNotice(response.message || "Patient access granted.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to grant patient access."));
    } finally {
      setSaving(false);
    }
  }

  async function updateRequest(request, status) {
    setError("");
    setNotice("");
    setUpdatingId(request.requestId);
    try {
      const response = await hospitalAPI.updateRequest(request.requestId, status);
      refreshData(response.message || "Request updated.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update this request."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function fulfillRequest(request) {
    setError("");
    setNotice("");
    setUpdatingId(request.requestId);
    try {
      const quantity = Number(fulfillmentQuantities[request.requestId] || Math.max(
        1,
        request.quantityRequired - (request.fulfilledQuantity || 0)
      ));
      const response = await hospitalAPI.fulfillRequest(request.requestId, quantity);
      refreshData(response.message || "Fulfillment recorded.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to record fulfillment."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function reviewEnquiry(enquiry, decision) {
    setError("");
    setNotice("");
    setUpdatingId(`enquiry-${enquiry.enquiryId}`);
    try {
      const response = await hospitalAPI.reviewEnquiry(enquiry.enquiryId, decision);
      refreshData(response.message || "Enquiry reviewed.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to review this enquiry."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function convertEnquiry(enquiry) {
    setError("");
    setNotice("");
    setUpdatingId(`enquiry-${enquiry.enquiryId}`);
    const location = enquiryLocations[enquiry.enquiryId] || {};
    try {
      const response = await hospitalAPI.convertEnquiry(enquiry.enquiryId, {
        latitude: location.latitude === "" ? undefined : Number(location.latitude),
        longitude: location.longitude === "" ? undefined : Number(location.longitude),
      });
      refreshData(response.message || "Verified enquiry converted to an official request.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to convert this enquiry."));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="donor-page-panel hospital-operations-page" aria-labelledby="hospital-requests-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="hospital-requests-heading">Hospital request coordination</h1>
          <p>Create official requests, verify assistance enquiries, and record fulfillment.</p>
        </div>
        <ClipboardList size={22} aria-hidden="true" />
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}
      <div className="donor-page-message" role="note">
        Assistance enquiries are reviewed from the shared hospital queue below. <a href="#hospital-assistance-enquiries">Jump to enquiries</a>
      </div>

      <form className="hospital-stock-form hospital-request-create-form" onSubmit={createOfficialRequest}>
        <h2>Create official blood request</h2>
        <p>Only hospital staff can create an official request and start donor matching.</p>
        <label>
          Patient record <span className="hospital-form-optional">Optional</span>
          <select value={requestForm.patientId} onChange={(event) => setRequestForm({ ...requestForm, patientId: event.target.value })}>
            <option value="">Create an accountless patient record</option>
            {patients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.firstName} {patient.lastName} · {patient.phone}</option>)}
          </select>
        </label>
        {!requestForm.patientId && <>
          <label>Patient first name<input value={requestForm.firstName} onChange={(event) => setRequestForm({ ...requestForm, firstName: event.target.value })} minLength="2" maxLength="50" required /></label>
          <label>Patient last name<input value={requestForm.lastName} onChange={(event) => setRequestForm({ ...requestForm, lastName: event.target.value })} minLength="2" maxLength="50" required /></label>
          <label>Patient phone<input value={requestForm.phone} onChange={(event) => setRequestForm({ ...requestForm, phone: event.target.value })} minLength="10" maxLength="20" required /></label>
        </>}
        <label>Blood type<select value={requestForm.bloodType} onChange={(event) => setRequestForm({ ...requestForm, bloodType: event.target.value })} required><option value="">Choose blood type</option>{BLOOD_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Units required<input type="number" min="1" max="20" value={requestForm.quantityRequired} onChange={(event) => setRequestForm({ ...requestForm, quantityRequired: event.target.value })} required /></label>
        <label>Urgency<select value={requestForm.urgencyLevel} onChange={(event) => setRequestForm({ ...requestForm, urgencyLevel: event.target.value })} required>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((level) => <option key={level}>{level}</option>)}</select></label>
        <label>Needed by<input type="date" min={MIN_NEEDED_BY_DATE} value={requestForm.neededBy} onChange={(event) => setRequestForm({ ...requestForm, neededBy: event.target.value })} required /></label>
        <label>Request latitude <span className="hospital-form-optional">Uses hospital location if blank</span><input type="number" step="any" min="-90" max="90" value={requestForm.latitude} onChange={(event) => setRequestForm({ ...requestForm, latitude: event.target.value })} /></label>
        <label>Request longitude <span className="hospital-form-optional">Uses hospital location if blank</span><input type="number" step="any" min="-180" max="180" value={requestForm.longitude} onChange={(event) => setRequestForm({ ...requestForm, longitude: event.target.value })} /></label>
        <label className="hospital-form-wide">Notes<input maxLength="500" value={requestForm.notes} onChange={(event) => setRequestForm({ ...requestForm, notes: event.target.value })} /></label>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Creating..." : "Create request and notify matched donors"}</button>
      </form>

      <form className="hospital-stock-form hospital-access-form" onSubmit={grantAccess}>
        <h2><UserPlus size={18} /> Grant family representative access</h2>
        <label>Patient<select value={accessForm.patientId} onChange={(event) => setAccessForm({ ...accessForm, patientId: event.target.value })} required><option value="">Select patient</option>{patients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.firstName} {patient.lastName}</option>)}</select></label>
        <label>Representative account email<input type="email" value={accessForm.email} onChange={(event) => setAccessForm({ ...accessForm, email: event.target.value })} required /></label>
        <label>Relationship<input maxLength="80" value={accessForm.relationship} onChange={(event) => setAccessForm({ ...accessForm, relationship: event.target.value })} required /></label>
        <button className="primary-button" type="submit" disabled={saving || !patients.length}>Grant access</button>
      </form>

      <div className="hospital-enquiries-list" id="hospital-assistance-enquiries">
        <h2>Assistance enquiries requiring hospital verification</h2>
        <p className="hospital-enquiries-guidance">
          This is a shared queue for authorized staff at this hospital; enquiries are not assigned to a specific staff member. The reviewer is recorded after verification or rejection.
        </p>
        {loading ? <p className="donor-table-empty">Loading enquiries...</p>
          : enquiries.length === 0 ? <p className="donor-table-empty">No assistance enquiries are awaiting review.</p>
            : enquiries.map((enquiry) => (
              <article className="hospital-enquiry-card" key={enquiry.enquiryId}>
                <div>
                  <strong>{enquiry.patient?.firstName} {enquiry.patient?.lastName} · {enquiry.requestedBloodType || "Blood type not specified"}</strong>
                  <p>{enquiry.description}</p>
                  <small>{enquiry.patient?.phone} · {enquiry.preferredHospital?.name || "Unassigned enquiry"} · {formatDate(enquiry.createdAt)}</small>
                  {enquiry.reviewedByStaff && <small className="hospital-enquiry-reviewer">Reviewed by {enquiry.reviewedByStaff.user.firstName} {enquiry.reviewedByStaff.user.lastName}</small>}
                  {enquiry.reviewNotes && <p>Review: {enquiry.reviewNotes}</p>}
                </div>
                <span className="donor-status-tag">{enquiry.status.replaceAll("_", " ")}</span>
                {["PENDING_HOSPITAL_VERIFICATION", "UNDER_REVIEW"].includes(enquiry.status) && (
                  <div className="hospital-enquiry-actions">
                    <button className="donor-text-action" type="button" disabled={updatingId === `enquiry-${enquiry.enquiryId}`} onClick={() => reviewEnquiry(enquiry, "VERIFY")}>Verify</button>
                    <button className="donor-text-action danger" type="button" disabled={updatingId === `enquiry-${enquiry.enquiryId}`} onClick={() => reviewEnquiry(enquiry, "REJECT")}>Reject</button>
                  </div>
                )}
                {enquiry.status === "VERIFIED" && (
                  <div className="hospital-enquiry-actions">
                    {!enquiry.latitude && !enquiry.longitude && <span className="hospital-form-optional"><MapPin size={14} /> Hospital coordinates must be configured or enter below</span>}
                    <input aria-label="Fallback latitude" type="number" step="any" min="-90" max="90" placeholder="Latitude (optional)" value={enquiryLocations[enquiry.enquiryId]?.latitude || ""} onChange={(event) => setEnquiryLocations({ ...enquiryLocations, [enquiry.enquiryId]: { ...enquiryLocations[enquiry.enquiryId], latitude: event.target.value } })} />
                    <input aria-label="Fallback longitude" type="number" step="any" min="-180" max="180" placeholder="Longitude (optional)" value={enquiryLocations[enquiry.enquiryId]?.longitude || ""} onChange={(event) => setEnquiryLocations({ ...enquiryLocations, [enquiry.enquiryId]: { ...enquiryLocations[enquiry.enquiryId], longitude: event.target.value } })} />
                    <button className="primary-button" type="button" disabled={updatingId === `enquiry-${enquiry.enquiryId}`} onClick={() => convertEnquiry(enquiry)}>Create official request &amp; match donors</button>
                  </div>
                )}
              </article>
            ))}
      </div>

      <div className="patient-requests-list">
        <div className="patient-requests-list-heading"><h2>Request history</h2><span>{requests.length} requests</span></div>
      <div className="donor-table-wrap">
        <table className="donor-table hospital-requests-table">
          <thead><tr><th>Blood type</th><th>Units / fulfilled</th><th>Urgency</th><th>Needed by</th><th>Patient</th><th>Hospital</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="8" className="donor-table-empty">Loading requests...</td></tr>
              : requests.length === 0 ? <tr><td colSpan="8" className="donor-table-empty">No hospital requests.</td></tr>
                : requests.map((request) => {
                  const isAssigned = request.status === "IN_PROGRESS" && request.hospital;
                  const canFulfill = request.hospital && ["OPEN", "IN_PROGRESS", "PARTIALLY_FULFILLED"].includes(request.status);
                  return (
                    <tr key={request.requestId}>
                      <td><strong className="donor-blood-type">{request.bloodType}</strong></td>
                      <td>{request.quantityRequired} / {request.fulfilledQuantity || 0}</td>
                      <td>{request.urgencyLevel === "CRITICAL" && <AlertTriangle size={14} aria-label="Critical urgency" />} {request.urgencyLevel}</td>
                      <td>{formatDate(request.neededBy)}</td>
                      <td>{request.patient ? `${request.patient.firstName} ${request.patient.lastName}` : "Patient"}</td>
                      <td>{request.hospital?.name || "Open queue"}</td>
                      <td><span className="donor-status-tag">{request.status}</span></td>
                      <td>
                        {canFulfill && <div className="hospital-fulfillment-control">
                          <input aria-label={`Fulfillment units for request ${request.requestId}`} type="number" min="1" max={request.quantityRequired - (request.fulfilledQuantity || 0)} value={fulfillmentQuantities[request.requestId] ?? Math.max(1, request.quantityRequired - (request.fulfilledQuantity || 0))} onChange={(event) => setFulfillmentQuantities({ ...fulfillmentQuantities, [request.requestId]: event.target.value })} />
                          <button className="donor-text-action" type="button" disabled={updatingId === request.requestId} onClick={() => fulfillRequest(request)}>Fulfill from stock</button>
                        </div>}
                        {["OPEN", "PENDING", "URGENT"].includes(request.status) && <button className="donor-text-action" type="button" disabled={updatingId === request.requestId} onClick={() => updateRequest(request, "IN_PROGRESS")}>Claim</button>}
                        {isAssigned && <button className="donor-text-action danger" type="button" disabled={updatingId === request.requestId} onClick={() => updateRequest(request, "OPEN")}>Release</button>}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      </div>
    </section>
  );
}

export function HospitalAppointmentsPage({ onAppointmentUpdated }) {
  const [appointments, setAppointments] = useState([]);
  const [slots, setSlots] = useState([]);
  const [slotForm, setSlotForm] = useState({ date: "", time: "", capacity: "10" });
  const [donationForm, setDonationForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingSlotId, setUpdatingSlotId] = useState(null);
  const [savingSlot, setSavingSlot] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    hospitalAPI.getAppointments()
      .then((response) => {
        if (!cancelled) setAppointments(response.data.appointments || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load appointments."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    hospitalAPI.getAppointmentSlots()
      .then((slotsResponse) => {
        if (cancelled) return;
        setSlots(slotsResponse.data.slots || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load appointment slots."));
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function createSlot(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSavingSlot(true);
    try {
      const response = await hospitalAPI.createAppointmentSlot({
        ...slotForm,
        capacity: Number(slotForm.capacity),
      });
      setNotice(response.message || "Appointment slot published.");
      setSlotForm((current) => ({ ...current, time: "" }));
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to publish this appointment slot."));
    } finally {
      setSavingSlot(false);
    }
  }

  async function updateSlotStatus(slot, status) {
    setError("");
    setNotice("");
    setUpdatingSlotId(slot.slotId);
    try {
      const response = await hospitalAPI.updateAppointmentSlot(slot.slotId, status);
      setNotice(response.message || "Appointment slot updated.");
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update this appointment slot."));
    } finally {
      setUpdatingSlotId(null);
    }
  }

  async function updateStatus(appointment, status) {
    setError("");
    setNotice("");
    setUpdatingId(appointment.appointmentId);
    try {
      const response = await hospitalAPI.updateAppointmentStatus(appointment.appointmentId, status);
      setNotice(response.message || "Appointment status updated.");
      setLoading(true);
      setRefreshKey((current) => current + 1);
      onAppointmentUpdated?.();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to update this appointment."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function recordDonation(event) {
    event.preventDefault();
    if (!donationForm) return;
    setError("");
    setNotice("");
    setUpdatingId(donationForm.appointmentId);
    try {
      const response = await hospitalAPI.recordAppointmentDonation(
        donationForm.appointmentId,
        { quantity: Number(donationForm.quantity), notes: donationForm.notes }
      );
      setNotice(response.message || "Successful donation recorded.");
      setDonationForm(null);
      setLoading(true);
      setRefreshKey((current) => current + 1);
      onAppointmentUpdated?.();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to record this donation."));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="donor-page-panel hospital-operations-page" aria-labelledby="hospital-appointments-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="hospital-appointments-heading">Hospital appointments</h1>
          <p>Confirm, complete, or cancel scheduled visits.</p>
        </div>
        <ClipboardList size={22} aria-hidden="true" />
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}

      <section className="hospital-appointment-management" aria-labelledby="hospital-slots-heading">
        <h2 id="hospital-slots-heading">Appointment availability</h2>
        <p>Publish date and time slots with a donor capacity. Hospital map pins are set centrally and do not need to be updated here.</p>
        <form className="donor-appointment-form" onSubmit={createSlot}>
          <label>Date<input type="date" min={MIN_NEEDED_BY_DATE} value={slotForm.date} onChange={(event) => setSlotForm({ ...slotForm, date: event.target.value })} required /></label>
          <label>Time<input type="time" value={slotForm.time} onChange={(event) => setSlotForm({ ...slotForm, time: event.target.value })} required /></label>
          <label>Capacity<input type="number" min="1" max="100" value={slotForm.capacity} onChange={(event) => setSlotForm({ ...slotForm, capacity: event.target.value })} required /></label>
          <button type="submit" className="primary-button" disabled={savingSlot}>{savingSlot ? "Publishing..." : "Publish slot"}</button>
        </form>
        <div className="donor-table-wrap">
          <table className="donor-table hospital-appointments-table">
            <thead><tr><th>Date</th><th>Time</th><th>Booked / Capacity</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {slots.length === 0 ? <tr><td colSpan="5" className="donor-table-empty">No upcoming slots published.</td></tr>
                : slots.map((slot) => (
                  <tr key={slot.slotId}>
                    <td>{formatDate(slot.slotDate)}</td>
                    <td>{slot.time}</td>
                    <td>{slot.bookedCount} / {slot.capacity}</td>
                    <td><span className="donor-status-tag">{slot.status}</span></td>
                    <td><button className={`donor-text-action${slot.status === "OPEN" ? " danger" : ""}`} type="button" disabled={updatingSlotId === slot.slotId} onClick={() => updateSlotStatus(slot, slot.status === "OPEN" ? "CLOSED" : "OPEN")}>{slot.status === "OPEN" ? "Close" : "Reopen"}</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="donor-table-wrap">
        <table className="donor-table hospital-appointments-table">
          <thead><tr><th>Date</th><th>Time</th><th>Person</th><th>Contact</th><th>Visit type</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" className="donor-table-empty">Loading appointments...</td></tr>
              : appointments.length === 0 ? <tr><td colSpan="7" className="donor-table-empty">No appointments for this hospital.</td></tr>
                : appointments.map((appointment) => {
                  const person = appointment.donor || appointment.patient;
                  const contact = appointment.donor?.user || appointment.patient;
                  return (
                    <tr key={appointment.appointmentId}>
                      <td>{formatDate(appointment.date)}</td>
                      <td>{appointment.time}</td>
                      <td>{person ? `${person.firstName} ${person.lastName}` : "Not specified"}</td>
                      <td>{contact?.phone || contact?.email || "Not provided"}</td>
                      <td>{appointment.purpose}</td>
                      <td><span className="donor-status-tag">{appointment.status}</span></td>
                      <td className="hospital-appointment-actions">
                        {appointment.status === "SCHEDULED" && (
                          <>
                            <button className="donor-text-action" type="button" disabled={updatingId === appointment.appointmentId} onClick={() => updateStatus(appointment, "CONFIRMED")}>Confirm</button>
                            <button className="donor-text-action danger" type="button" disabled={updatingId === appointment.appointmentId} onClick={() => updateStatus(appointment, "CANCELLED")}>Cancel</button>
                          </>
                        )}
                        {appointment.status === "CONFIRMED" && (
                          <>
                            {appointment.purpose.toLowerCase() !== "blood donation" && (
                              <button className="donor-text-action" type="button" disabled={updatingId === appointment.appointmentId} onClick={() => updateStatus(appointment, "COMPLETED")}>Complete</button>
                            )}
                            {appointment.purpose.toLowerCase() === "blood donation" && appointment.donor && (
                              <button
                                className="donor-text-action"
                                type="button"
                                disabled={updatingId === appointment.appointmentId || !appointment.donor.bloodType}
                                onClick={() => setDonationForm({ appointmentId: appointment.appointmentId, quantity: "450", notes: "" })}
                                title={!appointment.donor.bloodType ? "Donor profile needs a blood type before recording a donation." : undefined}
                              >
                                Record donation
                              </button>
                            )}
                            <button className="donor-text-action danger" type="button" disabled={updatingId === appointment.appointmentId} onClick={() => updateStatus(appointment, "CANCELLED")}>Cancel</button>
                          </>
                        )}
                        {["COMPLETED", "CANCELLED"].includes(appointment.status) && <span>Closed</span>}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {donationForm && (
        <form className="hospital-stock-form" onSubmit={recordDonation}>
          <strong className="hospital-form-wide">Record a successful donation only after completing hospital screening, medical clearance, and collection.</strong>
          <label>Collected volume (ml)<input type="number" min="1" max="1000" value={donationForm.quantity} onChange={(event) => setDonationForm((current) => ({ ...current, quantity: event.target.value }))} required /></label>
          <label>Notes (optional)<input type="text" maxLength="500" value={donationForm.notes} onChange={(event) => setDonationForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          <button type="submit" className="primary-button" disabled={Boolean(updatingId)}>{updatingId ? "Recording..." : "Confirm successful donation"}</button>
          <button type="button" className="donor-text-action" onClick={() => setDonationForm(null)} disabled={Boolean(updatingId)}>Cancel</button>
        </form>
      )}
    </section>
  );
}

export function HospitalStaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    hospitalAPI.getStaff()
      .then((response) => {
        if (!cancelled) setStaff(response.data.staff || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError, "Unable to load the hospital staff directory."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="donor-page-panel hospital-operations-page" aria-labelledby="hospital-staff-heading">
      <header className="donor-page-heading">
        <div>
          <h1 id="hospital-staff-heading">Hospital staff</h1>
          <p>Staff directory for your hospital.</p>
        </div>
        <ClipboardList size={22} aria-hidden="true" />
      </header>

      {error && <div className="donor-page-message error" role="alert">{error}</div>}

      <div className="donor-table-wrap">
        <table className="donor-table hospital-staff-table">
          <thead><tr><th>Name</th><th>Designation</th><th>Email</th><th>Phone</th><th>Account</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="5" className="donor-table-empty">Loading staff directory...</td></tr>
              : staff.length === 0 ? <tr><td colSpan="5" className="donor-table-empty">No staff members found.</td></tr>
                : staff.map((member) => (
                  <tr key={member.staffId}>
                    <td><strong>{member.user.firstName} {member.user.lastName}</strong></td>
                    <td>{member.designation}</td>
                    <td><a href={`mailto:${member.user.email}`}>{member.user.email}</a></td>
                    <td><a href={`tel:${member.user.phone}`}>{member.user.phone}</a></td>
                    <td><span className="donor-status-tag">{member.user.status}</span></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}