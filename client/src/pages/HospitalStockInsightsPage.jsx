import { useEffect, useMemo, useState } from "react";
import { Download, HeartPulse, RefreshCw } from "lucide-react";
import { hospitalAPI } from "../services/api";
import "./hospital-stock-insights.css";

const dayValue = (date) => date.toISOString().slice(0, 10);
const today = dayValue(new Date());
const initialFrom = dayValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
const messages = {
  INSUFFICIENT_HISTORY: "Insufficient usage history",
  CONFIGURE_SETTINGS: "Configure lead time and safety buffer",
  REPLENISH: "Replenishment recommended",
  ABOVE_THRESHOLD: "Stock above recommended threshold",
};
const riskLabels = { CRITICAL: "Critical", HIGH: "High", LOW: "Lower", NO_RECORDED_USAGE: "No recorded usage", INSUFFICIENT_DATA: "Insufficient data" };

function formatNumber(value, digits = 1) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(digits);
}

function saveCsv(rows, filename) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const text = [rows[0].map(escape).join(","), ...rows.slice(1).map((row) => row.map(escape).join(","))].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function HospitalStockInsightsPage() {
  const [insights, setInsights] = useState(null);
  const [report, setReport] = useState(null);
  const [settings, setSettings] = useState({ historicalWindowDays: 30, replenishmentLeadTimeDays: "", safetyBufferDays: "" });
  const [filters, setFilters] = useState({ from: initialFrom, to: today, bloodType: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [decisions, setDecisions] = useState({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([hospitalAPI.getStockInsights(), hospitalAPI.getStockReport(filters)])
      .then(([insightResponse, reportResponse]) => {
        if (cancelled) return;
        const data = insightResponse.data;
        setInsights(data);
        setReport(reportResponse.data);
        setSettings({
          historicalWindowDays: data.settings.historicalWindowDays,
          replenishmentLeadTimeDays: data.settings.replenishmentLeadTimeDays ?? "",
          safetyBufferDays: data.settings.safetyBufferDays ?? "",
        });
        setError("");
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.response?.data?.message || "Unable to load stock insights.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refresh, filters]);

  const dailyMaximum = useMemo(() => Math.max(1, ...(report?.usage || []).map((item) => item.totalUnitsIssued)), [report]);
  const dailyRows = useMemo(() => (report?.usage || []).flatMap((item) => item.dailyUsage.map((day) => ({ ...day, bloodType: item.bloodType }))).sort((a, b) => a.date.localeCompare(b.date) || a.bloodType.localeCompare(b.bloodType)), [report]);

  async function saveSettings(event) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await hospitalAPI.updateStockSettings({
        historicalWindowDays: Number(settings.historicalWindowDays),
        replenishmentLeadTimeDays: Number(settings.replenishmentLeadTimeDays),
        safetyBufferDays: Number(settings.safetyBufferDays),
      });
      setNotice(response.message || "Settings saved."); setLoading(true); setRefresh((value) => value + 1);
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to save stock settings."); }
    finally { setSaving(false); }
  }

  async function recordDecision(item) {
    const decision = decisions[item.inventoryId] || { decision: "ACCEPT_RECOMMENDED", minimumUnits: item.currentThreshold, reason: "" };
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await hospitalAPI.decideStockThreshold(item.inventoryId, {
        decision: decision.decision,
        ...(decision.decision === "OVERRIDE" ? { minimumUnits: Number(decision.minimumUnits) } : {}),
        ...(decision.reason ? { reason: decision.reason } : {}),
      });
      setNotice(response.message || "Threshold decision recorded."); setLoading(true); setRefresh((value) => value + 1);
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to record threshold decision."); }
    finally { setSaving(false); }
  }

  function exportUsage() {
    const rows = [["Blood type", "Total units issued", "Average daily usage", "Transactions", "Date", "Units issued"]];
    for (const item of report?.usage || []) {
      if (!item.dailyUsage.length) rows.push([item.bloodType, item.totalUnitsIssued, item.averageDailyUsage, item.transactions, "", ""]);
      else for (const day of item.dailyUsage) rows.push([item.bloodType, item.totalUnitsIssued, item.averageDailyUsage, item.transactions, day.date, day.unitsIssued]);
    }
    saveCsv(rows, "hemoconnect-stock-usage.csv");
  }

  return (
    <section className="donor-page-panel hospital-stock-insights" aria-labelledby="stock-insights-heading">
      <header className="donor-page-heading">
        <div><h1 id="stock-insights-heading">Stock Insights</h1><p>Recorded stock issues and operational replenishment estimates for your hospital.</p></div>
        <HeartPulse size={22} aria-hidden="true" />
      </header>
      {error && <div className="donor-page-message error" role="alert">{error}</div>}
      {notice && <div className="donor-page-message success" role="status">{notice}</div>}

      <div className="stock-insight-cards" aria-live="polite">
        {[["Currently available units", insights?.summary.usableUnits ?? "—"], ["Below recommended threshold", insights?.summary.belowRecommendedThreshold ?? "—"], ["High or critical risk", insights?.summary.highOrCriticalRisk ?? "—"], ["Increasing demand", insights?.summary.increasingDemand ?? "—"]].map(([label, value]) => <div className="stock-insight-card" key={label}><span>{label}</span><strong>{loading ? "…" : value}</strong></div>)}
      </div>

      <form className="hospital-stock-form stock-settings-form" onSubmit={saveSettings}>
        <div className="stock-settings-intro"><h2>Operational settings</h2><p>Set the history period, replenishment lead time, and safety buffer used in calculations.</p></div>
        <label>History window (days)<input type="number" min="7" max="365" value={settings.historicalWindowDays} onChange={(event) => setSettings({ ...settings, historicalWindowDays: event.target.value })} required /></label>
        <label>Lead time (days)<input type="number" min="0" max="365" value={settings.replenishmentLeadTimeDays} onChange={(event) => setSettings({ ...settings, replenishmentLeadTimeDays: event.target.value })} required /></label>
        <label>Safety buffer (days)<input type="number" min="0" max="365" value={settings.safetyBufferDays} onChange={(event) => setSettings({ ...settings, safetyBufferDays: event.target.value })} required /></label>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
      </form>

      <div className="stock-insights-heading"><div><h2>Adaptive stock recommendations</h2><p>Generated {insights?.generatedAt ? new Date(insights.generatedAt).toLocaleString() : "—"}. Recommended minimum = average daily usage × (lead time + safety buffer), rounded up.</p></div><button className="donor-text-action" type="button" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}><RefreshCw size={15} /> Refresh</button></div>
      <div className="donor-table-wrap">
        <table className="donor-table stock-recommendation-table">
          <thead><tr><th>Blood type</th><th>Recorded stock</th><th>Current min</th><th>Avg. daily issue</th><th>Recommended min</th><th>Difference</th><th>Days remaining</th><th>Projected shortage date</th><th>Demand trend</th><th>Shortage risk</th><th>Recommendation</th><th>Decision</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan="12" className="donor-table-empty">Loading stock insights…</td></tr> : !insights?.recommendations.length ? <tr><td colSpan="12" className="donor-table-empty">No inventory categories are configured for this hospital.</td></tr> : insights.recommendations.map((item) => {
            const selection = decisions[item.inventoryId] || { decision: "ACCEPT_RECOMMENDED", minimumUnits: item.currentThreshold, reason: "" };
            return <tr key={item.inventoryId}>
              <td><strong className="donor-blood-type">{item.bloodType}</strong></td><td>{item.currentAvailableStock}</td><td>{item.currentThreshold}</td><td>{formatNumber(item.averageDailyUsage)}</td><td>{item.recommendedThreshold ?? "—"}</td><td>{item.thresholdDifference === null ? "—" : `${item.thresholdDifference > 0 ? "+" : ""}${item.thresholdDifference}`}</td><td>{item.daysOfStockRemaining === null ? "—" : formatNumber(item.daysOfStockRemaining, 0)}</td><td>{item.projectedShortageDate ? new Date(item.projectedShortageDate).toLocaleDateString() : "—"}</td>
              <td>{item.demandTrend === "INSUFFICIENT_DATA" ? "Insufficient data" : `${item.demandTrend.toLowerCase()}${item.demandChangePercent === null ? "" : ` (${formatNumber(item.demandChangePercent)}%)`}`}</td><td><span className={`stock-risk ${item.shortageRisk.toLowerCase().replaceAll("_", "-")}`}>{riskLabels[item.shortageRisk]}</span></td><td>{messages[item.recommendation]}{item.insufficientDataMessage && <small className="stock-insufficient-note">{item.insufficientDataMessage}</small>}<details className="stock-calculation"><summary>Calculation</summary><small>{item.currentUnitsIssued} issued over {item.analysisPeriod.days} calendar days. Average = {item.currentUnitsIssued} ÷ {item.analysisPeriod.days} = {formatNumber(item.averageDailyUsage)} units/day. Threshold = average × ({insights.settings.replenishmentLeadTimeDays ?? "lead time required"} + {insights.settings.safetyBufferDays ?? "buffer required"}), rounded up. Requires at least two transactions on separate days. Period: {new Date(item.analysisPeriod.from).toLocaleDateString()} to {new Date(item.analysisPeriod.to).toLocaleDateString()}.</small></details></td>
              <td><div className="stock-decision-form">
                <select aria-label={`Threshold decision for ${item.bloodType}`} value={selection.decision} onChange={(event) => setDecisions({ ...decisions, [item.inventoryId]: { ...selection, decision: event.target.value } })}><option value="ACCEPT_RECOMMENDED">Accept recommendation</option><option value="RETAIN_CURRENT">Retain current</option><option value="OVERRIDE">Set different threshold</option></select>
                {selection.decision === "OVERRIDE" && <input aria-label={`New threshold for ${item.bloodType}`} type="number" min="0" max="100000" value={selection.minimumUnits} onChange={(event) => setDecisions({ ...decisions, [item.inventoryId]: { ...selection, minimumUnits: event.target.value } })} />}
                {selection.decision !== "ACCEPT_RECOMMENDED" && <input aria-label={`Reason for ${item.bloodType} threshold decision`} type="text" maxLength="500" placeholder="Reason required" value={selection.reason} onChange={(event) => setDecisions({ ...decisions, [item.inventoryId]: { ...selection, reason: event.target.value } })} />}
                <button className="donor-text-action" type="button" disabled={saving || (selection.decision === "ACCEPT_RECOMMENDED" && item.recommendedThreshold === null)} onClick={() => recordDecision(item)}>Record</button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="stock-report-section">
        <div className="stock-insights-heading"><div><h2>Stock usage and threshold report</h2><p>Usage totals include recorded request fulfillments only. Patient details are excluded.</p></div><button className="donor-text-action" type="button" onClick={exportUsage}><Download size={15} /> Export CSV</button></div>
        <form className="stock-report-filters" onSubmit={(event) => event.preventDefault()}>
          <label>From<input type="date" value={filters.from} max={filters.to} onChange={(event) => { setLoading(true); setFilters({ ...filters, from: event.target.value }); }} /></label>
          <label>To<input type="date" value={filters.to} min={filters.from} max={today} onChange={(event) => { setLoading(true); setFilters({ ...filters, to: event.target.value }); }} /></label>
          <label>Blood type<select value={filters.bloodType} onChange={(event) => { setLoading(true); setFilters({ ...filters, bloodType: event.target.value }); }}><option value="">All types</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((type) => <option key={type}>{type}</option>)}</select></label>
        </form>
        <div className="stock-report-bars" aria-label="Recorded units issued per blood type">{report?.usage.map((item) => <div className="stock-report-bar-row" key={item.bloodType}><strong>{item.bloodType}</strong><div><span style={{ width: `${Math.max(3, (item.totalUnitsIssued / dailyMaximum) * 100)}%` }} /></div><span>{item.totalUnitsIssued} units</span></div>)}</div>
        <div className="donor-table-wrap"><table className="donor-table stock-report-table"><thead><tr><th>Blood type</th><th>Total issued</th><th>Average daily usage</th><th>Threshold now</th><th>Recommended threshold</th><th>Difference</th><th>Current stock</th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="donor-table-empty">Loading report…</td></tr> : (report?.usage || []).length === 0 ? <tr><td colSpan="7" className="donor-table-empty">No recorded stock issues for this period.</td></tr> : report.usage.map((item) => { const stock = insights?.recommendations.find((row) => row.bloodType === item.bloodType); return <tr key={item.bloodType}><td>{item.bloodType}</td><td>{item.totalUnitsIssued}</td><td>{formatNumber(item.averageDailyUsage)}</td><td>{stock?.currentThreshold ?? "—"}</td><td>{stock?.recommendedThreshold ?? "—"}</td><td>{stock?.thresholdDifference ?? "—"}</td><td>{stock?.currentAvailableStock ?? "—"}</td></tr>; })}</tbody></table></div>
        <div className="donor-table-wrap"><table className="donor-table stock-daily-table"><thead><tr><th>Date</th><th>Blood type</th><th>Recorded units issued</th></tr></thead><tbody>{loading ? <tr><td colSpan="3" className="donor-table-empty">Loading daily usage…</td></tr> : dailyRows.length === 0 ? <tr><td colSpan="3" className="donor-table-empty">No daily issue records for this period.</td></tr> : dailyRows.map((row) => <tr key={`${row.date}-${row.bloodType}`}><td>{row.date}</td><td>{row.bloodType}</td><td>{row.unitsIssued}</td></tr>)}</tbody></table></div>
        <p className="stock-no-incidents">The system does not retain a separate history of low-stock incidents; current stock and threshold decisions are shown above.</p>
        {report?.thresholdDecisions?.length > 0 && <div className="stock-decision-history"><h3>Threshold decision history</h3>{report.thresholdDecisions.map((decision, index) => <p key={`${decision.entityId}-${decision.createdAt}-${index}`}><strong>{decision.details.bloodType}</strong>: {decision.details.decision.replaceAll("_", " ")} ({decision.details.previousThreshold} → {decision.details.newThreshold}) by {decision.actorUser ? `${decision.actorUser.firstName} ${decision.actorUser.lastName}` : "former staff member"} on {new Date(decision.createdAt).toLocaleString()}{decision.details.reason ? ` — ${decision.details.reason}` : ""}</p>)}</div>}
      </div>
      <ul className="stock-insight-limitations">{(insights?.limitations || []).map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
    </section>
  );
}
