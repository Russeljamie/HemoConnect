export function selectActiveQuestionnaireSubmission(submissions) {
  return submissions.find((item) => item.status === "DRAFT")
    || submissions.find((item) => item.status === "PENDING")
    || null;
}
