import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectActiveQuestionnaireSubmission } from "./questionnaireSubmissionState.js";

describe("selectActiveQuestionnaireSubmission", () => {
  it("resumes a pending submission when no draft exists", () => {
    const pending = { submissionId: 12, status: "PENDING" };

    assert.equal(selectActiveQuestionnaireSubmission([pending]), pending);
  });

  it("prefers an editable draft over a pending submission", () => {
    const pending = { submissionId: 12, status: "PENDING" };
    const draft = { submissionId: 13, status: "DRAFT" };

    assert.equal(selectActiveQuestionnaireSubmission([pending, draft]), draft);
  });

  it("returns null when no editable or pending submission exists", () => {
    assert.equal(selectActiveQuestionnaireSubmission([{ status: "APPROVED" }]), null);
  });
});
