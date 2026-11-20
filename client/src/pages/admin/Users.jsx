import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, UserCheck, UserX } from "lucide-react";

import { adminAPI, getCurrentUser } from "../../services/api";
import "./users.css";

const PAGE_SIZE = 15;

const roleLabels = {
  DONOR: "Donor",
  PATIENT: "Patient",
  HOSPITAL_STAFF: "Hospital staff",
  NGO: "NGO",
  ADMIN: "Admin",
};

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Users() {
  const currentUser = getCurrentUser();
  const [searchInput, setSearchInput] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [filters, setFilters] = useState({ search: "", role: "", status: "" });
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [users, setUsers] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [staffForm, setStaffForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    designation: "",
    hospitalId: "",
    temporaryPassword: "",
  });
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [loading, setLoading] = useState(true);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    adminAPI
      .getUsers({ ...filters, page, pageSize: PAGE_SIZE })
      .then((response) => {
        if (cancelled) return;
        setUsers(response?.data?.users || []);
        setPagination(response?.data?.pagination || {
          total: 0,
          totalPages: 0,
          page: 1,
          pageSize: PAGE_SIZE,
        });
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError.response?.data?.message ||
            "Unable to load user accounts. Please try again."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, page, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    adminAPI.getHospitals({ status: "ACTIVE", page: 1, pageSize: 100 })
      .then((response) => {
        if (!cancelled) setHospitals(response?.data?.hospitals || []);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError.response?.data?.message || "Unable to load active hospitals.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHospitals(false);
      });
    return () => { cancelled = true; };
  }, []);

  function applyFilters(event) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setError("");
    setNotice("");
    setFilters({
      search: searchInput.trim(),
      role: roleInput,
      status: statusInput,
    });
  }

  function clearFilters() {
    setLoading(true);
    setError("");
    setSearchInput("");
    setRoleInput("");
    setStatusInput("");
    setPage(1);
    setFilters({ search: "", role: "", status: "" });
    setNotice("");
  }

  async function toggleStatus(user) {
    const status = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setUpdatingUserId(user.userId);
    setError("");
    setNotice("");

    try {
      await adminAPI.updateUserStatus(user.userId, status);
      setNotice(`${user.firstName} ${user.lastName} is now ${status.toLowerCase()}.`);
      setLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to update this account. Please try again."
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function createHospitalStaff(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setCreatingStaff(true);
    try {
      const response = await adminAPI.createHospitalStaff({
        ...staffForm,
        hospitalId: Number(staffForm.hospitalId),
      });
      setNotice(response.message || "Hospital staff account created.");
      setStaffForm((current) => ({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        designation: "",
        hospitalId: current.hospitalId,
        temporaryPassword: "",
      }));
      setLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create the hospital staff account.");
    } finally {
      setCreatingStaff(false);
    }
  }

  const firstRow = pagination.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(page * PAGE_SIZE, pagination.total);

  return (
    <section className="admin-users-page" aria-labelledby="users-heading">
      <header className="admin-users-heading">
        <div>
          <h1 id="users-heading">User accounts</h1>
          <p>Create hospital staff accounts and review account access across HemoConnect.</p>
        </div>
        <span className="admin-users-count">{pagination.total} accounts</span>
      </header>

      {error && <div className="admin-users-message error" role="alert">{error}</div>}
      {notice && <div className="admin-users-message success" role="status">{notice}</div>}

      <form className="admin-hospital-staff-form" onSubmit={createHospitalStaff}>
        <div className="admin-staff-form-heading">
          <h2>Create hospital staff account</h2>
          <p>The account and hospital staff profile are saved together. Staff must change the temporary password at first login.</p>
        </div>
        <label>First name<input value={staffForm.firstName} onChange={(event) => setStaffForm({ ...staffForm, firstName: event.target.value })} minLength="2" maxLength="50" required /></label>
        <label>Last name<input value={staffForm.lastName} onChange={(event) => setStaffForm({ ...staffForm, lastName: event.target.value })} minLength="2" maxLength="50" required /></label>
        <label>Email<input type="email" autoComplete="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} required /></label>
        <label>Phone<input type="tel" value={staffForm.phone} onChange={(event) => setStaffForm({ ...staffForm, phone: event.target.value })} minLength="10" maxLength="20" required /></label>
        <label>Designation<input value={staffForm.designation} onChange={(event) => setStaffForm({ ...staffForm, designation: event.target.value })} minLength="2" maxLength="100" placeholder="Blood Bank Officer" required /></label>
        <label>Hospital
          <select value={staffForm.hospitalId} onChange={(event) => setStaffForm({ ...staffForm, hospitalId: event.target.value })} required disabled={loadingHospitals}>
            <option value="">{loadingHospitals ? "Loading hospitals..." : "Select active hospital"}</option>
            {hospitals.map((hospital) => <option key={hospital.hospitalId} value={hospital.hospitalId}>{hospital.name}</option>)}
          </select>
        </label>
        <label className="admin-staff-password">Temporary password<input type="password" autoComplete="new-password" value={staffForm.temporaryPassword} onChange={(event) => setStaffForm({ ...staffForm, temporaryPassword: event.target.value })} minLength="12" maxLength="128" required /><span>At least 12 characters. Share it directly with the staff member.</span></label>
        <button type="submit" className="primary-button" disabled={creatingStaff || loadingHospitals || hospitals.length === 0}>
          {creatingStaff ? "Creating account..." : "Create hospital staff account"}
        </button>
      </form>

      <form className="admin-user-filters" onSubmit={applyFilters}>
        <label className="admin-user-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, email, or phone"
            aria-label="Search user accounts"
          />
        </label>

        <label>
          <span className="sr-only">Filter by role</span>
          <select value={roleInput} onChange={(event) => setRoleInput(event.target.value)}>
            <option value="">All roles</option>
            <option value="DONOR">Donor</option>
            <option value="PATIENT">Patient</option>
            <option value="HOSPITAL_STAFF">Hospital staff</option>
            <option value="NGO">NGO</option>
            <option value="ADMIN">Admin</option>
          </select>
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
        <button type="button" className="admin-clear-filters" onClick={clearFilters}>
          Clear
        </button>
      </form>

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Role</th>
              <th scope="col">Hospital</th>
              <th scope="col">Phone</th>
              <th scope="col">Created</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Account action</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="admin-users-empty">Loading accounts...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="7" className="admin-users-empty">No accounts match these filters.</td></tr>
            ) : users.map((user) => {
              const isCurrentUser = currentUser?.userId === user.userId;
              const isActive = user.status === "ACTIVE";

              return (
                <tr key={user.userId}>
                  <td>
                    <strong>{user.firstName} {user.lastName}</strong>
                    <span>{user.email}</span>
                  </td>
                  <td>{roleLabels[user.role] || user.role}</td>
                  <td>{user.role === "HOSPITAL_STAFF"
                    ? <>{user.hospitalStaff?.hospital?.name || "Hospital not assigned"}{user.hospitalStaff?.designation && <span>{user.hospitalStaff.designation}</span>}</>
                    : "—"}
                  </td>
                  <td>{user.phone}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <span className={`admin-user-status ${isActive ? "active" : "inactive"}`}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="admin-user-action-cell">
                    <button
                      type="button"
                      className="admin-user-action"
                      onClick={() => toggleStatus(user)}
                      disabled={isCurrentUser || updatingUserId === user.userId}
                      title={isCurrentUser ? "You cannot change your own account status" : undefined}
                    >
                      {isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                      {updatingUserId === user.userId
                        ? "Saving..."
                        : isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="admin-users-pagination">
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

export default Users;