import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { requestAssessment, getOwnedAssessment, getOwnedSubmission } from "./assessments.service";
import type { AppEnv } from "../../shared/types";

export const assessmentsRoutes = new OpenAPIHono<AppEnv>();

const errorResponse = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

const assessmentStatusSchema = z.enum(["queued", "processing", "draft_ready", "needs_review", "finalized", "failed"]);
const latestAssessmentSchema = z.object({
  id: z.string().uuid(),
  status: assessmentStatusSchema,
  isFinal: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const submissionDetailSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    content: z.string(),
    status: z.string(),
    submittedAt: z.string(),
    mission: z.object({ id: z.string().uuid(), slug: z.string(), title: z.string(), summary: z.string() }),
    rubricVersion: z.object({ id: z.string().uuid(), version: z.number().int() }),
    latestAssessment: latestAssessmentSchema.nullable(),
  }),
}).openapi("SubmissionDetailResponse");

const assessmentResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    id: z.string().uuid(),
    submissionId: z.string().uuid(),
    status: assessmentStatusSchema,
    isFinal: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    reused: z.boolean(),
    processorConfigured: z.literal(false),
  }),
}).openapi("AssessmentRequestResponse");

const assessmentStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    submissionId: z.string().uuid(),
    status: assessmentStatusSchema,
    isFinal: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    processorConfigured: z.literal(false),
  }),
}).openapi("AssessmentStatusResponse");

assessmentsRoutes.openapi(createRoute({
  method: "get",
  path: "/submissions/{submissionId}",
  tags: ["Submissions"],
  summary: "Get a submission owned by the authenticated learner",
  security: [{ BearerAuth: [] }],
  request: { params: z.object({ submissionId: z.string().uuid() }) },
  responses: {
    200: { description: "Submission detail and latest assessment status", content: { "application/json": { schema: submissionDetailSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    403: { description: "Account role is not enabled for this MVP", content: { "application/json": { schema: errorResponse } } },
    404: { description: "Submission not found", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const { submissionId } = c.req.valid("param");
  const submission = await getOwnedSubmission(c.get("db"), c.get("user").id, submissionId);
  if (!submission) return c.json({ success: false as const, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } }, 404);
  return c.json({ success: true as const, data: submission }, 200);
});

assessmentsRoutes.openapi(createRoute({
  method: "post",
  path: "/submissions/{submissionId}/assessment",
  tags: ["Assessments"],
  summary: "Record an assessment request for an owned submission",
  description: "Creates a queued assessment-run record only. No AI provider, background worker, scoring or finalization is invoked by this endpoint yet. Repeated requests reuse the current non-failed run.",
  security: [{ BearerAuth: [] }],
  request: { params: z.object({ submissionId: z.string().uuid() }) },
  responses: {
    202: { description: "Assessment request recorded in queued state; processing is not configured", content: { "application/json": { schema: assessmentResponseSchema } } },
    200: { description: "An existing active assessment request was reused", content: { "application/json": { schema: assessmentResponseSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    403: { description: "Account role is not enabled for this MVP", content: { "application/json": { schema: errorResponse } } },
    404: { description: "Submission not found", content: { "application/json": { schema: errorResponse } } },
    409: { description: "Submission is not assessable in its current state or is already finalized", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const { submissionId } = c.req.valid("param");
  const result = await requestAssessment(c.get("db"), c.get("user").id, submissionId);

  if (result.kind === "not_found") {
    return c.json({ success: false as const, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } }, 404);
  }
  if (result.kind === "invalid_state") {
    return c.json({ success: false as const, error: { code: "SUBMISSION_NOT_ASSESSABLE", message: "Only a submitted or previously failed submission can start an assessment request." } }, 409);
  }
  if (result.kind === "finalized") {
    return c.json({ success: false as const, error: { code: "SUBMISSION_ALREADY_FINALIZED", message: "A finalized submission cannot receive another assessment request." } }, 409);
  }

  const run = result.run;
  const reused = result.kind === "reused";
  return c.json({
    success: true as const,
    message: reused
      ? "The existing assessment request was reused. No assessment processor is configured yet."
      : "The assessment request was recorded as queued. No AI scoring or processing worker was started.",
    data: {
      id: run.id,
      submissionId: run.submissionId,
      status: run.status as z.infer<typeof assessmentStatusSchema>,
      isFinal: run.isFinal,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      reused,
      processorConfigured: false as const,
    },
  }, reused ? 200 : 202);
});

assessmentsRoutes.openapi(createRoute({
  method: "get",
  path: "/submissions/{submissionId}/assessment",
  tags: ["Assessments"],
  summary: "Get the latest assessment run status for an owned submission",
  description: "Returns lifecycle metadata only. Scores, criterion results and feedback are withheld until their policy and presentation contract are approved.",
  security: [{ BearerAuth: [] }],
  request: { params: z.object({ submissionId: z.string().uuid() }) },
  responses: {
    200: { description: "Latest assessment lifecycle status", content: { "application/json": { schema: assessmentStatusResponseSchema } } },
    401: { description: "Authentication required", content: { "application/json": { schema: errorResponse } } },
    403: { description: "Account role is not enabled for this MVP", content: { "application/json": { schema: errorResponse } } },
    404: { description: "Submission or assessment request not found", content: { "application/json": { schema: errorResponse } } },
    503: { description: "Authentication is not configured", content: { "application/json": { schema: errorResponse } } },
  },
}), async (c) => {
  const { submissionId } = c.req.valid("param");
  const result = await getOwnedAssessment(c.get("db"), c.get("user").id, submissionId);
  if (result.kind === "not_found") {
    return c.json({ success: false as const, error: { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } }, 404);
  }
  if (result.kind === "not_requested") {
    return c.json({ success: false as const, error: { code: "ASSESSMENT_NOT_REQUESTED", message: "No assessment request exists for this submission." } }, 404);
  }
  return c.json({ success: true as const, data: {
    id: result.assessment.id,
    submissionId: result.assessment.submissionId,
    status: result.assessment.status as z.infer<typeof assessmentStatusSchema>,
    isFinal: result.assessment.isFinal,
    createdAt: result.assessment.createdAt.toISOString(),
    updatedAt: result.assessment.updatedAt.toISOString(),
    processorConfigured: false as const,
  } }, 200);
});
