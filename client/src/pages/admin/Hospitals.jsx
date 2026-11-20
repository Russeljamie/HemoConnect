import { useEffect, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Search, ShieldOff, ShieldCheck } from "lucide-react";

import OpenStreetMapLocationPicker from "../../components/OpenStreetMapLocationPicker";
import { adminAPI } from "../../services/api";
import "./hospitals.css";

const PAGE_SIZE = 15;
const EMPTY_HOSPITAL = {
  name: "",
  location: "",
  contactInfo: "",
  latitude: "",
  longitude: "",
};

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Hospitals() {
  const [searchInput, setSearchInput] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hospitals, setHospitals] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingHospitalId, setUpdatingHospitalId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hospitalForm, setHospitalForm] = useState(EMPTY_HOSPITAL);
  const [creatingHospital, setCreatingHospital] = useState(false);

  useEffect(() => {
    let cancelled = false;

    adminAPI
      .getHospitals({ ...filters, page, pageSize: PAGE_SIZE })
      .then((response) => {
        if (cancelled) return;
        setHospitals(response?.data?.hospitals || []);
        setPagination(response?.data?.pagination || { total: 0, totalPages: 0 });
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError.response?.data?.message ||
            "Unable to load hospitals. Please try again."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, page, refreshKey]);

  function applyFilters(event) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setError("");
    setNotice("");
    setFilters({ search: searchInput.trim(), status: statusInput });
  }

  function clearFilters() {
    setLoading(true);
    setError("");
    setNotice("");
    setSearchInput("");
    setStatusInput("");
    setPage(1);
    setFilters({ search: "", status: "" });
  }

  async function toggleStatus(hospital) {
    const status = hospital.isActive ? "INACTIVE" : "ACTIVE";
    setUpdatingHospitalId(hospital.hospitalId);
    setError("");
    setNotice("");

    try {
      await adminAPI.updateHospitalStatus(hospital.hospitalId, status);
      setNotice(`${hospital.name} is now ${status.toLowerCase()}.`);
      setLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to update this hospital. Please try again."
      );
    } finally {
      setUpdatingHospitalId(null);
    }
  }

  async function createHospital(event) {
    event.preventDefault();
    setCreatingHospital(true);
    setError("");
    setNotice("");

    try {
      const response = await adminAPI.createHospital({
        ...hospitalForm,
        latitude: Number(hospitalForm.latitude),
        longitude: Number(hospitalForm.longitude),
      });
      setHospitalForm(EMPTY_HOSPITAL);
      setNotice(`${response.data.hospital.name} was added to the hospital directory.`);
      setFilters({ search: "", status: "" });
      setSearchInput("");
      setStatusInput("");
      setPage(1);
      setLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to add this hospital. Please verify the details and try again."
      );
    } finally {
      setCreatingHospital(false);
    }
  }

  const firstRow = pagination.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(page * PAGE_SIZE, pagination.total);

  return (
    <section className="admin-hospitals-page" aria-labelledby="hospitals-heading">
      <header className="admin-hospitals-heading">
        <div>
          <h1 id="hospitals-heading">Hospitals</h1>
          <p>Review hospital contact details and platform access.</p>
        </div>
        <span className="admin-hospitals-count">{pagination.total} hospitals</span>
      </header>

      {error && <div className="admin-hospitals-message error" role="alert">{error}</div>}
      {notice && <div className="admin-hospitals-message success" role="status">{notice}</div>}

      <form className="admin-hospital-create-form" onSubmit={createHospital}>
        <h2>Add a hospital</h2>
        <p>Register a participating hospital with a verified permanent map pin. Active hospitals with coordinates can appear in nearby search and receive appointment bookings.</p>
        <div className="admin-hospital-create-fields">
          <label>
            Hospital name
            <input
              value={hospitalForm.name}
              onChange={(event) => setHospitalForm({ ...hospitalForm, name: event.target.value })}
              maxLength={150}
              required
            />
          </label>
          <label>
            Address or area
            <input
              value={hospitalForm.location}
              onChange={(event) => setHospitalForm({ ...hospitalForm, location: event.target.value })}
              maxLength={255}
              required
            />
          </label>
          <label>
            Contact details
            <input
              value={hospitalForm.contactInfo}
              onChange={(event) => setHospitalForm({ ...hospitalForm, contactInfo: event.target.value })}
              maxLength={100}
              required
            />
          </label>
        </div>
        <div className="admin-hospital-pin-map">
          <OpenStreetMapLocationPicker
            latitude={hospitalForm.latitude}
            longitude={hospitalForm.longitude}
            onLocationSelect={({ latitude, longitude }) => setHospitalForm((current) => ({
              ...current,
              latitude: latitude.toFixed(7),
              longitude: longitude.toFixed(7),
            }))}
          />
        </div>
        <div className="admin-hospital-coordinate-fields">
          <label>
            Latitude
            <input value={hospitalForm.latitude} readOnly required aria-label="Selected hospital latitude" />
          </label>
          <label>
            Longitude
            <input value={hospitalForm.longitude} readOnly required aria-label="Selected hospital longitude" />
          </label>
        </div>
        <button type="submit" className="primary-button" disabled={creatingHospital || !hospitalForm.latitude || !hospitalForm.longitude}>
          {creatingHospital ? "Adding hospital..." : "Add hospital to directory"}
        </button>
      </form>

      <form className="admin-hospital-filters" onSubmit={applyFilters}>
        <label className="admin-hospital-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, location, or contact"
            aria-label="Search hospitals"
          />
        </label>

        <label>
          <span className="sr-only">Filter by status</span>
          <select value={statusInput} onChange={(event) => setStatusInput(event.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>

        <button type="submit" className="primary-button">
          <Search size={16} />
          Apply filters
        </button>
        <button type="button" className="admin-hospital-clear" onClick={clearFilters}>
          Clear
        </button>
      </form>

      <div className="admin-hospitals-table-wrap">
        <table className="admin-hospitals-table">
          <thead>
            <tr>
              <th scope="col">Hospital</th>
              <th scope="col">Location</th>
              <th scope="col">Contact</th>
              <th scope="col">Added</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Hospital action</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="admin-hospitals-empty">Loading hospitals...</td></tr>
            ) : hospitals.length === 0 ? (
              <tr><td colSpan="6" className="admin-hospitals-empty">No hospitals match these filters.</td></tr>
            ) : hospitals.map((hospital) => (
              <tr key={hospital.hospitalId}>
                <td>
                  <strong><Building2 size={15} aria-hidden="true" />{hospital.name}</strong>
                </td>
                <td>{hospital.location}</td>
                <td>{hospital.contactInfo}</td>
                <td>{formatDate(hospital.createdAt)}</td>
                <td>
                  <span className={`admin-hospital-status ${hospital.isActive ? "active" : "inactive"}`}>
                    {hospital.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="admin-hospital-action-cell">
                  <button
                    type="button"
                    className="admin-hospital-action"
                    onClick={() => toggleStatus(hospital)}
                    disabled={updatingHospitalId === hospital.hospitalId}
                  >
                    {hospital.isActive ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                    {updatingHospitalId === hospital.hospitalId
                      ? "Saving..."
                      : hospital.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="admin-hospitals-pagination">
        <span>Showing {firstRow}-{lastRow} of {pagination.total}</span>
        <div>
          <button
            type="button"
            aria-label="Previous page"
            title="Previous page"
            disabled={page <= 1 || loading}
            onClick={() => {
              setLoading(true);
              setPage((value) => Math.max(1, value - 1));
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <span>Page {page} of {Math.max(1, pagination.totalPages)}</span>
          <button
            type="button"
            aria-label="Next page"
            title="Next page"
            disabled={page >= pagination.totalPages || loading}
            onClick={() => {
              setLoading(true);
              setPage((value) => value + 1);
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </footer>
    </section>
  );
}

export default Hospitals;