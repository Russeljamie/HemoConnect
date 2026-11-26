import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  CircleX,
  Search,
} from "lucide-react";

import { knbtsAPI } from "../services/api";
import "./questionnaire-pages.css";

function errorMessage(error, fallback) {
  return error.response?.data?.message || error.response?.data?.error?.message || fallback;
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function KnbtsDashboardPage({ profile }) {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    knbtsAPI.getQuestionnaireDashboard()
      .then((response) => {
        if (!cancelled) setDashboard(response.data?.dashboard || null);
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, "Unable to load questionnaire dashboard data."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const counts = dashboard?.counts;
  const stats = [
    { label: "Awaiting review", value: counts?.pending, accent: "pending", icon: Clock3 },
    { label: "Approved", value: counts?.approved, accent: "approved", icon: CheckCircle2 },
    { label: "Declined", value: counts?.declined, accent: "declined", icon: CircleX },
  ];

  return (
    <section className="knbts-dashboard" aria-labelledby="knbts-dashboard-heading">
      <header className="knbts-dashboard-hero">
        <div className="knbts-dashboard-intro">
          <span className="knbts-dashboard-eyebrow">KNBTS STAFF WORKSPACE</span>
          <h1 id="knbts-dashboard-heading">Questionnaire review dashboard</h1>
          <p>Track submissions and continue donor questionnaire reviews.</p>
          <div className="knbts-dashboard-centre">
            <Building2 size={17} aria-hidden="true" />
            <span>{profile?.centre?.name || "KNBTS Centre"}</span>
            <span className="knbts-dashboard-divider" aria-hidden="true">·</span>
            <span>{profile?.designation || "KNBTS Staff"}</span>
          </div>
        </div>
        <button
          type="button"
          className="knbts-dashboard-queue-button"
          onClick={() => navigate("/knbts/questionnaire")}
        >
          <span>Open Questionnaire Queue</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </header>

      {error && <div className="questionnaire-message error" role="alert">{error}</div>}

      <div className="knbts-dashboard-stats" aria-label="Questionnaire statistics">
        {stats.map(({ label, value, accent, icon: Icon }) => (
          <article className="knbts-dashboard-stat" key={label}>
            <span className={`knbts-dashboard-stat-icon ${accent}`}><Icon size={20} aria-hidden="true" /></span>
            <div>
              <span className="knbts-dashboard-stat-label">{label}</span>
              <strong aria-live="polite">{loading ? "…" : value ?? "—"}</strong>
            </div>
          </article>
        ))}
      </div>

      <section className="knbts-dashboard-activity" aria-labelledby="knbts-dashboard-activity-heading">
        <header className="knbts-dashboard-section-heading">
          <div>
            <h2 id="knbts-dashboard-activity-heading">Recent questionnaire submissions</h2>
            <p>Latest submitted questionnaires and their current review status.</p>
          </div>
          <button type="button" className="knbts-dashboard-text-button" onClick={() => navigate("/knbts/questionnaire")}>
            View queue <ArrowRight size={15} aria-hidden="true" />
          </button>
        </header>

        {loading ? (
          <div className="knbts-dashboard-empty" role="status">Loading recent submissions...</div>
        ) : !dashboard?.recentSubmissions?.length ? (
          <div className="knbts-dashboard-empty">No questionnaire submissions yet.</div>
        ) : (
          <div className="knbts-dashboard-activity-list">
            {dashboard.recentSubmissions.map((submission) => {
              const snapshot = submission.donorInformationSnapshot || {};
              const donor = submission.donor || {};
              const donorName = [
                snapshot.firstName || donor.firstName,
                snapshot.familyName || snapshot.lastName || donor.lastName,
              ].filter(Boolean).join(" ") || `Donor #${donor.donorId || "—"}`;
              return (
                <article className="knbts-dashboard-activity-row" key={submission.submissionId}>
                  <div className="knbts-dashboard-activity-icon"><ClipboardList size={18} aria-hidden="true" /></div>
                  <div className="knbts-dashboard-activity-details">
                    <strong>{donorName}</strong>
                    <span>Submission #{submission.submissionId} · {formatDateTime(submission.submittedAt)}</span>
                  </div>
                  <span className={`questionnaire-status ${String(submission.status).toLowerCase()}`}>
                    {submission.status}
                  </span>
                  <button
                    type="button"
                    className="knbts-dashboard-review-button"
                    onClick={() => navigate(`/knbts/questionnaire/${submission.submissionId}`)}
                    aria-label={`View ${submission.status.toLowerCase()} submission ${submission.submissionId}`}
                  >
                    View
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function answerDisplay(answer) {
  if (!answer) return "Unanswered";
  if (typeof answer.booleanValue === "boolean") return answer.booleanValue ? "Yes" : "No";
  if (answer.textValue) return answer.textValue;
  if (answer.dateValue) return formatDate(answer.dateValue);
  if (typeof answer.numberValue === "number") return String(answer.numberValue);
  if (answer.answerOption) return answer.answerOption.optionLabel || answer.answerOption.optionKey || "Selected";
  if (answer.travelPeriodValue && answer.travelPeriodUnit) {
    return `${answer.travelPeriodValue} ${answer.travelPeriodUnit.toLowerCase()}`;
  }
  return "Unanswered";
}

export function KnbtsQuestionnaireQueuePage() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    knbtsAPI.getQuestionnaireSubmissions({ page, pageSize: 20 })
      .then((response) => {
        if (cancelled) return;
        setSubmissions(response.data?.submissions || []);
        setPagination(response.data?.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, "Unable to load the pending questionnaire queue."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page]);

  const query = search.trim().toLowerCase();
  const visibleSubmissions = submissions.filter((submission) => {
    if (!query) return true;
    const snapshot = submission.donorInformationSnapshot || {};
    const donor = submission.donor || {};
    const haystack = [
      submission.submissionId,
      snapshot.firstName,
      snapshot.familyName,
      snapshot.donorNumber,
      donor.firstName,
      donor.lastName,
      donor.bloodType,
      donor.user?.email,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <section className="questionnaire-panel" aria-labelledby="knbts-queue-heading">
      <header className="questionnaire-heading">
        <div>
          <h1 id="knbts-queue-heading">Pending questionnaires</h1>
          <p>Review submitted donor health questionnaires.</p>
        </div>
        <span className="questionnaire-count">{pagination.total} pending</span>
      </header>
      {error && <div className="questionnaire-message error" role="alert">{error}</div>}
      <label className="questionnaire-search">
        <Search size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by donor name, number or blood type" />
      </label>
      <div className="questionnaire-table-wrap">
        <table className="questionnaire-table">
          <thead>
            <tr><th>Donor</th><th>Blood type</th><th>Submitted</th><th>Status</th><th><span className="sr-only">Action</span></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="questionnaire-empty">Loading pending submissions...</td></tr>
            ) : visibleSubmissions.length === 0 ? (
              <tr><td colSpan="5" className="questionnaire-empty">No pending questionnaires match this view.</td></tr>
            ) : visibleSubmissions.map((submission) => {
              const snapshot = submission.donorInformationSnapshot || {};
              const donor = submission.donor || {};
              return (
                <tr key={submission.submissionId}>
                  <td><strong>{snapshot.firstName || donor.firstName} {snapshot.familyName || donor.lastName}</strong><small>Donor #{snapshot.donorNumber || donor.donorId}</small></td>
                  <td>{donor.bloodType || "Not recorded"}</td>
                  <td>{formatDateTime(submission.submittedAt)}</td>
                  <td><span className="questionnaire-status pending">{submission.status}</span></td>
                  <td><button type="button" className="questionnaire-text-button" onClick={() => navigate(`/knbts/questionnaire/${submission.submissionId}`)}>Review</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="questionnaire-pagination">
        <span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
        <div>
          <button type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /></button>
          <button type="button" aria-label="Next page" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button>
        </div>
      </footer>
    </section>
  );
}

export function KnbtsQuestionnaireReviewPage() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decision, setDecision] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [assessmentDecision, setAssessmentDecision] = useState("ACCEPT");
  const [weightKg, setWeightKg] = useState("");
  const [bloodPressure, setBloodPressure] = useState("");
  const [assessmentDate, setAssessmentDate] = useState("");
  const [deferralPeriodDays, setDeferralPeriodDays] = useState("");
  const [deferralReason, setDeferralReason] = useState("");

  const loadSubmission = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await knbtsAPI.getQuestionnaireSubmission(submissionId);
      setSubmission(response.data || null);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to load this questionnaire submission."));
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    loadSubmission();
  }, [loadSubmission]);

  async function recordReview(nextDecision) {
    if (nextDecision === "DECLINED" && !declineReason.trim()) {
      setError("A decline reason is required.");
      return;
    }
    if (!window.confirm(`${nextDecision === "APPROVED" ? "Approve" : "Decline"} this questionnaire submission? This decision is final.`)) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await knbtsAPI.reviewQuestionnaire(submissionId, nextDecision, declineReason, internalNote);
      setDecision(nextDecision);
      setNotice(`Questionnaire ${nextDecision === "APPROVED" ? "approved" : "declined"}.`);
      await loadSubmission();
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to record the review decision."));
    } finally {
      setWorking(false);
    }
  }

  async function recordAssessment(event) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        decision: assessmentDecision,
        weightKg: Number(weightKg),
        bloodPressure,
        ...(assessmentDate ? { assessmentDate } : {}),
        ...(assessmentDecision === "DEFER"
          ? { deferralPeriodDays: Number(deferralPeriodDays), reason: deferralReason }
          : {}),
      };
      await knbtsAPI.assessQuestionnaire(submissionId, payload);
      setNotice("Clinical assessment recorded.");
      await loadSubmission();
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to record the clinical assessment."));
    } finally {
      setWorking(false);
    }
  }

  async function issueApproval() {
    if (!window.confirm("Issue a 14-day approval for this donor?")) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await knbtsAPI.issueQuestionnaireApproval(submissionId);
      setNotice("14-day approval issued.");
      await loadSubmission();
    } catch (requestError) {
      setError(errorMessage(requestError, "Approval could not be issued."));
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <div className="questionnaire-state" role="status">Loading questionnaire submission...</div>;
  if (!submission) {
    return (
      <section className="questionnaire-panel">
        <header className="questionnaire-heading"><div><h1>Submission unavailable</h1></div></header>
        {error && <div className="questionnaire-message error" role="alert">{error}</div>}
        <button type="button" className="questionnaire-secondary-button" onClick={() => navigate("/knbts/questionnaire")}>Back to queue</button>
      </section>
    );
  }

  const detail = submission.data || submission.submission || submission;
  const donor = detail.donor || {};
  const donorUser = donor.user || {};
  const snapshot = detail.donorInformationSnapshot || {};
  const answers = detail.answers || [];
  const review = detail.review;
  const assessments = detail.assessments || [];
  const approvals = detail.approvals || [];

  return (
    <section className="questionnaire-panel" aria-labelledby="knbts-review-heading">
      <header className="questionnaire-heading">
        <div>
          <button type="button" className="questionnaire-back-button" onClick={() => navigate("/knbts/questionnaire")}>← Pending queue</button>
          <h1 id="knbts-review-heading">Questionnaire review</h1>
          <p>Submission #{detail.submissionId} · {detail.status}</p>
        </div>
        <span className={`questionnaire-status ${detail.status.toLowerCase()}`}>{detail.status}</span>
      </header>
      {error && <div className="questionnaire-message error" role="alert">{error}</div>}
      {notice && <div className="questionnaire-message success" role="status">{notice}</div>}

      <div className="questionnaire-donor-summary knbts">
        <div><span>Donor</span><strong>{snapshot.firstName || donor.firstName} {snapshot.familyName || donor.lastName}</strong></div>
        <div><span>Donor number</span><strong>{snapshot.donorNumber || donor.donorId}</strong></div>
        <div><span>Blood type</span><strong>{donor.bloodType || "Not recorded"}</strong></div>
        <div><span>Date of birth</span><strong>{formatDate(donor.birthDate)}</strong></div>
        <div><span>Email</span><strong>{donorUser.email || "Not recorded"}</strong></div>
        <div><span>Phone</span><strong>{donorUser.phone || "Not recorded"}</strong></div>
      </div>

      <div className="knbts-review-grid">
        <div className="knbts-answer-list">
          <h2>Submitted answers</h2>
          {answers.length === 0 ? (
            <div className="questionnaire-empty">No answers were submitted.</div>
          ) : answers.map((answer) => (
            <article className="knbts-answer-row" key={answer.answerId || answer.questionId}>
              <div>
                <strong>{answer.question?.parentQuestionId ? "" : `${answer.question?.numberLabel || "—"} `}{answer.question?.prompt || "Question"}</strong>
                {answer.question?.subsectionLabel && <small>{answer.question.subsectionLabel}</small>}
              </div>
              <span>{answerDisplay(answer)}</span>
            </article>
          ))}
        </div>

        <aside className="knbts-review-actions">
          <section>
            <h2>Review decision</h2>
            {review ? (
              <div className="knbts-record-status">
                <CheckCircle2 size={20} />
                <strong>{review.decision}</strong>
                {review.declineReason && <p>{review.declineReason}</p>}
              </div>
            ) : detail.status === "PENDING" ? (
              <>
                <div className="questionnaire-choice-grid">
                  <button type="button" className={decision === "APPROVED" ? "selected" : ""} onClick={() => setDecision("APPROVED")}>Approve</button>
                  <button type="button" className={decision === "DECLINED" ? "selected decline" : "decline"} onClick={() => setDecision("DECLINED")}>Decline</button>
                </div>
                {decision === "DECLINED" && (
                  <label>Decline reason<textarea value={declineReason} maxLength={2000} onChange={(event) => setDeclineReason(event.target.value)} required /></label>
                )}
                <label>Internal note (optional)<textarea value={internalNote} maxLength={2000} onChange={(event) => setInternalNote(event.target.value)} /></label>
                <button type="button" className="questionnaire-primary-button" disabled={!decision || working} onClick={() => recordReview(decision)}>Submit final decision</button>
              </>
            ) : (
              <p>No review action is available for this status.</p>
            )}
          </section>

          <section>
            <h2>Clinical assessment</h2>
            {assessments.length > 0 ? (
              assessments.map((assessment) => (
                <div className="knbts-assessment-record" key={assessment.clinicalAssessmentId}>
                  <strong>{assessment.decision}</strong>
                  <span>{formatDate(assessment.assessmentDate)} · {assessment.weightKg} kg · {assessment.bloodPressure}</span>
                  {assessment.decision === "DEFER" && (
                    <p>{assessment.reason} — until {formatDate(assessment.deferralUntil)}</p>
                  )}
                </div>
              ))
            ) : (
              <p>No clinical assessment recorded.</p>
            )}
            {["PENDING", "APPROVED"].includes(detail.status) && (
              <form className="knbts-assessment-form" onSubmit={recordAssessment}>
                <label>Decision
                  <select value={assessmentDecision} onChange={(event) => setAssessmentDecision(event.target.value)}>
                    <option value="ACCEPT">Accept</option>
                    <option value="DEFER">Defer</option>
                  </select>
                </label>
                <label>Weight (kg)<input type="number" min="20" max="300" step="0.01" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} required /></label>
                <label>Blood pressure<input type="text" placeholder="120/80" value={bloodPressure} onChange={(event) => setBloodPressure(event.target.value)} required /></label>
                <label>Assessment date<input type="date" value={assessmentDate} onChange={(event) => setAssessmentDate(event.target.value)} /></label>
                {assessmentDecision === "DEFER" && (
                  <>
                    <label>Deferral period (days)<input type="number" min="1" max="3650" value={deferralPeriodDays} onChange={(event) => setDeferralPeriodDays(event.target.value)} required /></label>
                    <label>Deferral reason<textarea value={deferralReason} maxLength={2000} onChange={(event) => setDeferralReason(event.target.value)} required /></label>
                  </>
                )}
                <button type="submit" className="questionnaire-secondary-button" disabled={working}>Record assessment</button>
              </form>
            )}
          </section>

          <section>
            <h2>Approval</h2>
            {approvals.map((approval) => (
              <div className="knbts-approval-record" key={approval.approvalId}>
                <strong>{approval.status}</strong>
                <span>Issued {formatDateTime(approval.approvedAt)}</span>
                <span>Expires {formatDateTime(approval.expiresAt)}</span>
              </div>
            ))}
            {detail.status === "APPROVED" && (
              <button type="button" className="questionnaire-primary-button" disabled={working} onClick={issueApproval}>Issue 14-day approval</button>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
