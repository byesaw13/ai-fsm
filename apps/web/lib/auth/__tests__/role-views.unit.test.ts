import { describe, it, expect } from "vitest";
import {
  canCreateVisit,
  canAssignVisit,
  canTransitionJob,
  canTransitionVisit,
  canUpdateVisitNotes,
  canViewAllJobs,
  canViewAllVisits,
  canTransitionJob as _canTransitionJob,
} from "../permissions";
import type { Role } from "@ai-fsm/domain";

// ============================================================
// canCreateVisit
// ============================================================
describe("canCreateVisit", () => {
  it("owner can create visits", () => expect(canCreateVisit("owner")).toBe(true));
  it("admin can create visits", () => expect(canCreateVisit("admin")).toBe(true));
  it("tech cannot create visits", () => expect(canCreateVisit("tech")).toBe(false));
});

// ============================================================
// canAssignVisit
// ============================================================
describe("canAssignVisit", () => {
  it("owner can assign visits", () => expect(canAssignVisit("owner")).toBe(true));
  it("admin can assign visits", () => expect(canAssignVisit("admin")).toBe(true));
  it("tech cannot assign visits", () => expect(canAssignVisit("tech")).toBe(false));
});

// ============================================================
// canTransitionJob
// ============================================================
describe("canTransitionJob", () => {
  it("owner can transition jobs", () => expect(canTransitionJob("owner")).toBe(true));
  it("admin can transition jobs", () => expect(canTransitionJob("admin")).toBe(true));
  it("tech cannot transition jobs", () => expect(canTransitionJob("tech")).toBe(false));
});

// ============================================================
// canTransitionVisit
// ============================================================
describe("canTransitionVisit", () => {
  it("owner can transition visits", () => expect(canTransitionVisit("owner")).toBe(true));
  it("admin can transition visits", () => expect(canTransitionVisit("admin")).toBe(true));
  it("tech can transition visits (scope enforced server-side)", () =>
    expect(canTransitionVisit("tech")).toBe(true));
});

// ============================================================
// canUpdateVisitNotes
// ============================================================
describe("canUpdateVisitNotes", () => {
  it("owner can update notes", () => expect(canUpdateVisitNotes("owner")).toBe(true));
  it("admin can update notes", () => expect(canUpdateVisitNotes("admin")).toBe(true));
  it("tech can update notes on assigned visits", () => expect(canUpdateVisitNotes("tech")).toBe(true));
});

// ============================================================
// canViewAllJobs
// ============================================================
describe("canViewAllJobs", () => {
  it("owner sees all jobs", () => expect(canViewAllJobs("owner")).toBe(true));
  it("admin sees all jobs", () => expect(canViewAllJobs("admin")).toBe(true));
  it("tech sees assigned jobs only (returns false → use filtered query)", () =>
    expect(canViewAllJobs("tech")).toBe(false));
});

// ============================================================
// canViewAllVisits
// ============================================================
describe("canViewAllVisits", () => {
  it("owner sees all visits", () => expect(canViewAllVisits("owner")).toBe(true));
  it("admin sees all visits", () => expect(canViewAllVisits("admin")).toBe(true));
  it("tech sees assigned visits only (returns false → use filtered query)", () =>
    expect(canViewAllVisits("tech")).toBe(false));
});

// ============================================================
// Role isolation: forbidden actions produce false for tech
// ============================================================
describe("tech role forbidden actions", () => {
  const role: Role = "tech";
  it("cannot create visit", () => expect(canCreateVisit(role)).toBe(false));
  it("cannot assign visit", () => expect(canAssignVisit(role)).toBe(false));
  it("cannot transition job", () => expect(_canTransitionJob(role)).toBe(false));
  it("cannot view all jobs", () => expect(canViewAllJobs(role)).toBe(false));
  it("cannot view all visits", () => expect(canViewAllVisits(role)).toBe(false));
});

// ============================================================
// Admin view: full access to all listed permissions
// ============================================================
describe("admin role full view access", () => {
  const role: Role = "admin";
  it("can create visit", () => expect(canCreateVisit(role)).toBe(true));
  it("can assign visit", () => expect(canAssignVisit(role)).toBe(true));
  it("can transition job", () => expect(canTransitionJob(role)).toBe(true));
  it("can transition visit", () => expect(canTransitionVisit(role)).toBe(true));
  it("can view all jobs", () => expect(canViewAllJobs(role)).toBe(true));
  it("can view all visits", () => expect(canViewAllVisits(role)).toBe(true));
});
