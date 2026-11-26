import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Trash2 } from "lucide-react";

import { donorAPI } from "../services/api";
import { selectActiveQuestionnaireSubmission } from "./questionnaireSubmissionState";
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

function isAffirmativeAnswer(answer) {
  if (!answer) return false;
  if (typeof answer.booleanValue === "boolean") return answer.booleanValue;
  const label = answer.answerOption?.optionKey || answer.answerOption?.optionLabel;
  return typeof label === "string" && ["yes", "true", "y"].includes(label.trim().toLowerCase());
}

function answerForQuestion(answerMap, question) {
  return answerMap[question.questionnaireQuestionId];
}

function displayedNumber(question) {
  return question.parentQuestionId ? "" : question.numberLabel;
}

function derivedSummary(question, questions, answerMap) {
  const children = questions.filter((item) => item.parentQuestionId === question.questionnaireQuestionId);
  const childAnswers = children.map((child) => answerForQuestion(answerMap, child));
  if (!children.length) return "Answer all related questions to calculate.";
  if (childAnswers.some((answer) => answer?.booleanValue === true)) return "Yes";
  if (childAnswers.some((answer) => typeof answer?.booleanValue !== "boolean")) {
    return "Answer all related questions to calculate.";
  }
  return "No";
}

export function DonorQuestionnairePage({ historyOnly = false }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [questionnaire, setQuestionnaire] = useState(null);
  const [donorInformation, setDonorInformation] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [reviewStep, setReviewStep] = useState(false);
  const [declarationAcknowledged, setDeclarationAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      donorAPI.getQuestionnaireSubmissions(),
      historyOnly ? Promise.resolve(null) : donorAPI.getCurrentQuestionnaire(),
    ])
      .then(async ([historyResponse, currentResponse]) => {
        if (cancelled) return;
        setSubmissions(historyResponse.data?.submissions || []);

        if (historyOnly) return;
        setQuestionnaire(currentResponse?.data?.questionnaire || null);
        setDonorInformation(currentResponse?.data?.donorInformation || null);

        let activeSubmission = selectActiveQuestionnaireSubmission(historyResponse.data?.submissions || []);
        if (!activeSubmission) {
          try {
            const created = await donorAPI.createQuestionnaireDraft();
            activeSubmission = created.data?.submission || null;
          } catch (createError) {
            setError(errorMessage(createError, "Unable to create a questionnaire draft."));
          }
        }

        if (activeSubmission) {
          const detail = await donorAPI.getQuestionnaireSubmission(activeSubmission.submissionId);
          const loadedSubmission = detail.data?.submission || null;
          setSubmission(loadedSubmission);
          const loadedAnswers = {};
          (loadedSubmission?.answers || []).forEach((answer) => {
            loadedAnswers[answer.questionId] = {
              ...answer,
              optionId: answer.answerOptionId || answer.answerOption?.optionId,
            };
          });
          setAnswers(loadedAnswers);
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, "Unable to load questionnaire information."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [historyOnly]);

  const questions = useMemo(() => questionnaire?.questions || [], [questionnaire]);
  const sections = useMemo(() => {
    const map = new Map();
    questions.forEach((question) => {
      const section = question.subsectionLabel || "Questionnaire";
      if (!map.has(section)) map.set(section, []);
      map.get(section).push(question);
    });
    return Array.from(map.entries());
  }, [questions]);

  const parentAnswerMap = answers;
  function isApplicable(question) {
    if (!question.parentQuestionId) return true;
    const parent = questions.find((item) => item.questionnaireQuestionId === question.parentQuestionId);
    if (!parent || parent.isDerived) return true;
    return isAffirmativeAnswer(answerForQuestion(parentAnswerMap, parent));
  }

  function setAnswer(question, payload) {
    setAnswers((current) => ({
      ...current,
      [question.questionnaireQuestionId]: {
        ...current[question.questionnaireQuestionId],
        questionId: question.questionnaireQuestionId,
        ...payload,
      },
    }));
  }

  function setYesNo(question, value) {
    setAnswer(question, {
      booleanValue: value,
      ...(question.numberLabel === "1.9" && !value
        ? { travelPeriodValue: undefined, travelPeriodUnit: undefined }
        : {}),
    });
  }

  function setOption(question, optionId) {
    setAnswer(question, { optionId: Number(optionId) });
  }

  async function saveAnswers() {
    if (!submission) return false;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = questions
        .filter((question) => !question.isDerived && question.answerType !== "DERIVED_YES_NO")
        .filter(isApplicable)
        .filter((question) => {
          const answer = answerForQuestion(answers, question);
          return answer && (
            answer.booleanValue !== undefined ||
            answer.textValue !== undefined ||
            answer.dateValue !== undefined ||
            answer.numberValue !== undefined ||
            answer.optionId !== undefined ||
            answer.travelPeriodValue !== undefined ||
            answer.travelPeriodUnit !== undefined
          );
        })
        .map((question) => {
          const answer = answerForQuestion(answers, question);
          if (question.numberLabel === "1.9") {
            return {
              questionId: question.questionnaireQuestionId,
              booleanValue: answer.booleanValue,
              ...(answer.travelPeriodValue !== undefined ? { travelPeriodValue: answer.travelPeriodValue } : {}),
              ...(answer.travelPeriodUnit !== undefined ? { travelPeriodUnit: answer.travelPeriodUnit } : {}),
            };
          }
          if (question.answerType === "YES_NO" || question.answerType === "DECLARATION_ACKNOWLEDGEMENT") {
            return { questionId: question.questionnaireQuestionId, booleanValue: answer.booleanValue };
          }
          if (question.answerType === "TEXT") return { questionId: question.questionnaireQuestionId, textValue: answer.textValue };
          if (question.answerType === "DATE") return { questionId: question.questionnaireQuestionId, dateValue: answer.dateValue };
          if (question.answerType === "NUMBER") return { questionId: question.questionnaireQuestionId, numberValue: answer.numberValue };
          if (question.answerType === "OPTION") return { questionId: question.questionnaireQuestionId, optionId: answer.optionId };
          return { questionId: question.questionnaireQuestionId };
        });

      if (payload.length === 0) {
        setNotice("There are no answers to save yet.");
        return true;
      }
      const response = await donorAPI.saveQuestionnaireAnswers(submission.submissionId, payload);
      setSubmission(response.data?.submission || submission);
      setNotice("Your questionnaire answers were saved.");
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to save questionnaire answers."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnswer(question) {
    if (!submission) return;
    setError("");
    try {
      await donorAPI.deleteQuestionnaireAnswer(submission.submissionId, question.questionnaireQuestionId);
      setAnswers((current) => {
        const next = { ...current };
        delete next[question.questionnaireQuestionId];
        return next;
      });
      setNotice("Answer removed.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to remove this answer."));
    }
  }

  async function submitQuestionnaire() {
    if (!submission) return;
    if (!declarationAcknowledged) {
      setError("Confirm the declaration before submitting.");
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveAnswers();
      if (!saved) return;
      const response = await donorAPI.submitQuestionnaire(submission.submissionId);
      setSubmission(response.data?.submission || { ...submission, status: "PENDING" });
      setReviewStep(false);
      setNotice("Questionnaire submitted for KNBTS review.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to submit this questionnaire."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="questionnaire-state" role="status">Loading questionnaire...</div>;

  if (historyOnly) {
    return (
      <section className="questionnaire-panel" aria-labelledby="questionnaire-history-heading">
        <header className="questionnaire-heading">
          <div>
            <h1 id="questionnaire-history-heading">Questionnaire history</h1>
            <p>Review submission status and KNBTS decisions.</p>
          </div>
          <button type="button" className="questionnaire-primary-button" onClick={() => navigate("/donor/questionnaire")}>
            Complete questionnaire
          </button>
        </header>
        {error && <div className="questionnaire-message error" role="alert">{error}</div>}
        {submissions.length === 0 ? (
          <div className="questionnaire-empty">You have not submitted a health questionnaire yet.</div>
        ) : (
          <div className="questionnaire-history-list">
            {submissions.map((item) => (
              <article className="questionnaire-history-card" key={item.submissionId}>
                <div className="questionnaire-history-icon">
                  {item.status === "APPROVED" ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}
                </div>
                <div>
                  <strong>{item.version?.title || "Donor health questionnaire"}</strong>
                  <span>Version {item.version?.versionNumber || "—"} · Submitted {formatDate(item.submittedAt)}</span>
                </div>
                <span className={`questionnaire-status ${item.status.toLowerCase()}`}>{item.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (!questionnaire) {
    return (
      <section className="questionnaire-panel">
        <header className="questionnaire-heading"><div><h1>Health questionnaire</h1></div></header>
        {error && <div className="questionnaire-message error" role="alert">{error}</div>}
        {!error && <div className="questionnaire-empty">No published questionnaire is currently available.</div>}
      </section>
    );
  }

  if (submission?.status && submission.status !== "DRAFT") {
    return (
      <section className="questionnaire-panel" aria-labelledby="questionnaire-status-heading">
        <header className="questionnaire-heading">
          <div><h1 id="questionnaire-status-heading">Questionnaire submitted</h1><p>Your answers are now read-only.</p></div>
        </header>
        {notice && <div className="questionnaire-message success" role="status">{notice}</div>}
        {error && <div className="questionnaire-message error" role="alert">{error}</div>}
        <div className="questionnaire-readonly-status">
          <ClipboardCheck size={28} />
          <strong>Status: {submission.status}</strong>
          <span>{submission.status === "PENDING" ? "Waiting for KNBTS review." : "KNBTS has recorded a final decision."}</span>
          <button type="button" className="questionnaire-secondary-button" onClick={() => navigate("/donor/questionnaire/history")}>
            View questionnaire history
          </button>
        </div>
      </section>
    );
  }

  const currentSection = sections[sectionIndex];

  return (
    <section className="questionnaire-panel" aria-labelledby="questionnaire-heading">
      <header className="questionnaire-heading">
        <div>
          <h1 id="questionnaire-heading">{questionnaire.title}</h1>
          <p>Version {questionnaire.versionNumber} · Please complete this form.</p>
        </div>
        {submission && <span className="questionnaire-status draft">DRAFT</span>}
      </header>

      {error && <div className="questionnaire-message error" role="alert">{error}</div>}
      {notice && <div className="questionnaire-message success" role="status">{notice}</div>}

      {!reviewStep ? (
        <>
          <nav className="questionnaire-section-tabs" aria-label="Questionnaire sections">
            {sections.map(([title], index) => (
              <button type="button" key={title} className={index === sectionIndex ? "active" : ""} onClick={() => setSectionIndex(index)}>
                {title}
              </button>
            ))}
          </nav>

          <div className="questionnaire-section">
            <h2>{currentSection?.[0]}</h2>
            {currentSection?.[0] === "DONOR QUESTIONNAIRE" && donorInformation && (
              <div className="questionnaire-donor-summary">
                <div><span>Family name</span><strong>{donorInformation.familyName || "Not recorded"}</strong></div>
                <div><span>Donor number</span><strong>{donorInformation.donorNumber || "Not recorded"}</strong></div>
                <div><span>First name</span><strong>{donorInformation.firstName || "Not recorded"}</strong></div>
                <div><span>E-mail address</span><strong>{donorInformation.email || "Not recorded"}</strong></div>
                <div><span>Gender</span><strong>{donorInformation.gender || "Not recorded"}</strong></div>
                <div><span>Mobile</span><strong>{donorInformation.mobile || "Not recorded"}</strong></div>
                <div><span>Date of birth</span><strong>{formatDate(donorInformation.dateOfBirth)}</strong></div>
              </div>
            )}
            {currentSection?.[0] === "1. HEALTH ASSESSMENT" && (
              <p>Please tick the appropriate answer to each question.</p>
            )}
            {currentSection?.[1].map((question) => {
              if (!isApplicable(question)) return null;
              const answer = answerForQuestion(answers, question);
              const derived = question.answerType === "DERIVED_YES_NO";
              const contentOnly = question.isDerived && !derived;
              const canClear = answer && !derived;

              return (
                <fieldset className={`questionnaire-question${contentOnly ? " questionnaire-content-only" : ""}`} key={question.questionnaireQuestionId}>
                  <legend>
                    {displayedNumber(question) && <span>{displayedNumber(question)}</span>}
                    {question.prompt}
                    {question.required && <em>Required</em>}
                  </legend>

                  {derived ? (
                    <div className="questionnaire-derived" role="status">{derivedSummary(question, questions, answers)}</div>
                  ) : contentOnly ? null : question.answerType === "YES_NO" || question.answerType === "DECLARATION_ACKNOWLEDGEMENT" ? (
                    <div className="questionnaire-yes-no">
                      <label><input type="radio" name={`question-${question.questionnaireQuestionId}`} checked={answer?.booleanValue === true} onChange={() => setYesNo(question, true)} /> Yes</label>
                      <label><input type="radio" name={`question-${question.questionnaireQuestionId}`} checked={answer?.booleanValue === false} onChange={() => setYesNo(question, false)} /> No</label>
                    </div>
                  ) : question.answerType === "OPTION" ? (
                    <select value={answer?.optionId || ""} onChange={(event) => setOption(question, event.target.value)}>
                      <option value="">Choose an option</option>
                      {question.options.map((option) => (
                        <option key={option.optionId} value={option.optionId}>{option.optionLabel}</option>
                      ))}
                    </select>
                  ) : question.answerType === "DATE" ? (
                    <input type="date" value={answer?.dateValue ? String(answer.dateValue).slice(0, 10) : ""} onChange={(event) => setAnswer(question, { dateValue: event.target.value })} />
                  ) : question.answerType === "NUMBER" ? (
                    <input type="number" step="any" value={answer?.numberValue ?? ""} onChange={(event) => setAnswer(question, { numberValue: event.target.value === "" ? undefined : Number(event.target.value) })} />
                  ) : (
                    <textarea value={answer?.textValue || ""} maxLength={5000} onChange={(event) => setAnswer(question, { textValue: event.target.value })} />
                  )}

                  {question.numberLabel === "1.9" && (
                    <div className="questionnaire-derived">Yes means you have travelled; No means you have never travelled.</div>
                  )}
                  {question.numberLabel === "1.9" && answer?.booleanValue === true && (
                    <div className="questionnaire-travel-period">
                      <label>Travel period
                        <input type="number" min="1" step="1" value={answer.travelPeriodValue ?? ""} onChange={(event) => setAnswer(question, { travelPeriodValue: event.target.value === "" ? undefined : Number(event.target.value) })} />
                      </label>
                      <label>Unit
                        <select value={answer.travelPeriodUnit || ""} onChange={(event) => setAnswer(question, { travelPeriodUnit: event.target.value || undefined })}>
                          <option value="">Choose unit</option>
                          <option value="MONTHS">Months</option>
                          <option value="YEARS">Years</option>
                        </select>
                      </label>
                    </div>
                  )}

                  {canClear && (
                    <button type="button" className="questionnaire-clear-answer" onClick={() => deleteAnswer(question)}>
                      <Trash2 size={14} /> Remove answer
                    </button>
                  )}
                </fieldset>
              );
            })}
          </div>

          <footer className="questionnaire-actions">
            <button type="button" className="questionnaire-secondary-button" disabled={sectionIndex === 0} onClick={() => setSectionIndex((value) => value - 1)}>
              <ChevronLeft size={16} /> Previous
            </button>
            <button type="button" className="questionnaire-primary-button" disabled={saving} onClick={saveAnswers}>
              {saving ? "Saving..." : "Save answers"}
            </button>
            {sectionIndex < sections.length - 1 ? (
              <button type="button" className="questionnaire-secondary-button" onClick={() => setSectionIndex((value) => value + 1)}>
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" className="questionnaire-primary-button" onClick={() => setReviewStep(true)}>Review and submit</button>
            )}
          </footer>
        </>
      ) : (
        <div className="questionnaire-review">
          <h2>Review before submission</h2>
          {sections.map(([title, sectionQuestions]) => (
            <div className="questionnaire-review-section" key={title}>
              <h3>{title}</h3>
              {sectionQuestions.filter(isApplicable).filter((question) =>
                !question.isDerived || question.answerType === "DERIVED_YES_NO"
              ).map((question) => {
                if (question.isDerived && question.answerType !== "DERIVED_YES_NO") {
                  return (
                    <div className="questionnaire-review-row" key={question.questionnaireQuestionId}>
                      <span>{question.prompt}</span>
                    </div>
                  );
                }
                const answer = answerForQuestion(answers, question);
                let display = "Not answered";
                if (question.answerType === "DERIVED_YES_NO") {
                  display = derivedSummary(question, questions, answers);
                }
                if (typeof answer?.booleanValue === "boolean") display = answer.booleanValue ? "Yes" : "No";
                if (answer?.textValue) display = answer.textValue;
                if (answer?.dateValue) display = formatDate(answer.dateValue);
                if (answer?.numberValue !== undefined) display = String(answer.numberValue);
                if (answer?.optionId) {
                  display = question.options.find((option) => option.optionId === answer.optionId)?.optionLabel || "Selected";
                }
                if (question.numberLabel === "1.9" && answer?.booleanValue === true) {
                  display += ` · ${answer.travelPeriodValue || "—"} ${answer.travelPeriodUnit || "—"}`;
                }
                return (
                  <div className="questionnaire-review-row" key={question.questionnaireQuestionId}>
                    <span>{displayedNumber(question) ? `${displayedNumber(question)} ` : ""}{question.prompt}</span>
                    <strong>{display}</strong>
                  </div>
                );
              })}
            </div>
          ))}
          <label className="questionnaire-declaration">
            <input type="checkbox" required checked={declarationAcknowledged} onChange={(event) => setDeclarationAcknowledged(event.target.checked)} />
            I have read and acknowledge the complete declaration above.
          </label>
          <footer className="questionnaire-actions">
            <button type="button" className="questionnaire-secondary-button" onClick={() => setReviewStep(false)}>Back to questionnaire</button>
            <button type="button" className="questionnaire-primary-button" disabled={submitting} onClick={submitQuestionnaire}>
              {submitting ? "Submitting..." : "Submit questionnaire"}
            </button>
          </footer>
        </div>
      )}
    </section>
  );
}
