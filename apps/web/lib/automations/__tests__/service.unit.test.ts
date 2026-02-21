import { describe, it, expect } from "vitest";
import {
  validateAutomationId,
  canTriggerAutomation,
  buildSuccessResponse,
  buildErrorResponse,
} from "../service";

describe("automations service", () => {
  describe("validateAutomationId", () => {
    it("returns the id when valid UUID", () => {
      const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      expect(validateAutomationId(id)).toBe(id);
    });

    it("returns null when id is undefined", () => {
      expect(validateAutomationId(undefined)).toBe(null);
    });

    it("returns null when id is empty string", () => {
      expect(validateAutomationId("")).toBe(null);
    });

    it("returns null when id is not a valid UUID", () => {
      expect(validateAutomationId("not-a-uuid")).toBe(null);
    });

    it("returns null when id has wrong format", () => {
      expect(validateAutomationId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(null);
    });
  });

  describe("canTriggerAutomation", () => {
    it("returns true for owner role", () => {
      expect(canTriggerAutomation("owner")).toBe(true);
    });

    it("returns true for admin role", () => {
      expect(canTriggerAutomation("admin")).toBe(true);
    });

    it("returns false for tech role", () => {
      expect(canTriggerAutomation("tech")).toBe(false);
    });

    it("returns false for unknown role", () => {
      expect(canTriggerAutomation("guest")).toBe(false);
    });
  });

  describe("buildSuccessResponse", () => {
    it("builds correct response with automation id and type", () => {
      const result = buildSuccessResponse("abc-123", "visit_reminder");
      expect(result).toEqual({
        success: true,
        id: "abc-123",
        triggered: true,
        message: "Automation visit_reminder queued to run",
      });
    });

    it("includes triggered flag as true", () => {
      const result = buildSuccessResponse("id", "invoice_followup");
      expect(result.triggered).toBe(true);
    });
  });

  describe("buildErrorResponse", () => {
    it("builds NOT_FOUND error", () => {
      const result = buildErrorResponse("NOT_FOUND", "Automation not found");
      expect(result).toEqual({
        success: false,
        code: "NOT_FOUND",
        message: "Automation not found",
      });
    });

    it("builds VALIDATION_ERROR error", () => {
      const result = buildErrorResponse("VALIDATION_ERROR", "Automation is disabled");
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.success).toBe(false);
    });

    it("builds INTERNAL_ERROR error", () => {
      const result = buildErrorResponse("INTERNAL_ERROR", "Database error");
      expect(result.code).toBe("INTERNAL_ERROR");
    });
  });
});
