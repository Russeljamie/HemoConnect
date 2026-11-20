import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Droplet, Search } from "lucide-react";

import { adminAPI } from "../../services/api";
import "./inventory.css";

const PAGE_SIZE = 15;
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Inventory() {
  const [searchInput, setSearchInput] = useState("");
  const [bloodTypeInput, setBloodTypeInput] = useState("");
  const [filters, setFilters] = useState({ search: "", bloodType: "" });
  const [page, setPage] = useState(1);
  const [inventory, setInventory] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    adminAPI
      .getInventory({ ...filters, page, pageSize: PAGE_SIZE })
      .then((response) => {
        if (cancelled) return;
        setInventory(response?.data?.inventory || []);
        setPagination(response?.data?.pagination || { total: 0, totalPages: 0 });
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError.response?.data?.message ||
            "Unable to load blood inventory. Please try again."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  function applyFilters(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPage(1);
    setFilters({ search: searchInput.trim(), bloodType: bloodTypeInput });
  }

  function clearFilters() {
    setLoading(true);
    setError("");
    setSearchInput("");
    setBloodTypeInput("");
    setPage(1);
    setFilters({ search: "", bloodType: "" });
  }

  const firstRow = pagination.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(page * PAGE_SIZE, pagination.total);

  return (
    <section className="admin-inventory-page" aria-labelledby="inventory-heading">
      <header className="admin-inventory-heading">
        <div>
          <h1 id="inventory-heading">Blood inventory</h1>
          <p>Stock levels by blood type across registered hospitals.</p>
        </div>
        <span className="admin-inventory-count">{pagination.total} stock records</span>
      </header>

      {error && <div className="admin-inventory-message" role="alert">{error}</div>}

      <form className="admin-inventory-filters" onSubmit={applyFilters}>
        <label className="admin-inventory-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search hospital, location, or blood type"
            aria-label="Search inventory"
          />
        </label>

        <label>
          <span className="sr-only">Filter by blood type</span>
          <select value={bloodTypeInput} onChange={(event) => setBloodTypeInput(event.target.value)}>
            <option value="">All blood types</option>
            {BLOOD_TYPES.map((bloodType) => (
              <option key={bloodType} value={bloodType}>{bloodType}</option>
            ))}
          </select>
        </label>

        <button type="submit" className="primary-button">
          <Search size={16} />
          Apply filters
        </button>
        <button type="button" className="admin-inventory-clear" onClick={clearFilters}>
          Clear
        </button>
      </form>

      <div className="admin-inventory-table-wrap">
        <table className="admin-inventory-table">
          <thead>
            <tr>
              <th scope="col">Hospital</th>
              <th scope="col">Blood type</th>
              <th scope="col">Available</th>
              <th scope="col">Minimum</th>
              <th scope="col">Stock status</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="admin-inventory-empty">Loading inventory...</td></tr>
            ) : inventory.length === 0 ? (
              <tr><td colSpan="6" className="admin-inventory-empty">No inventory records match these filters.</td></tr>
            ) : inventory.map((item) => {
              const isLow = item.unitsAvailable <= item.minimumUnits;

              return (
                <tr key={item.inventoryId}>
                  <td>
                    <strong>{item.hospital.name}</strong>
                    <span>{item.hospital.location}</span>
                    {!item.hospital.isActive && <small>Hospital inactive</small>}
                  </td>
                  <td>
                    <span className="admin-inventory-blood-type">
                      <Droplet size={15} aria-hidden="true" />
                      {item.bloodType}
                    </span>
                  </td>
                  <td className="admin-inventory-units">{item.unitsAvailable}</td>
                  <td>{item.minimumUnits}</td>
                  <td>
                    <span className={`admin-inventory-status ${isLow ? "low" : "available"}`}>
                      {isLow && <AlertTriangle size={13} aria-hidden="true" />}
                      {isLow ? "Below minimum" : "Available"}
                    </span>
                  </td>
                  <td>{formatDate(item.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="admin-inventory-pagination">
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

export default Inventory;