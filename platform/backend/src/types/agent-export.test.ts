import { describe, expect, it } from "vitest";
import { buildJsonSchema } from "zod-to-json-schema";
import {
  ExportedAgentSchema,
  ImportAgentResponseSchema,
} from "@/types/agent-export";

describe("Agent Export/Import Types", () => {
  describe("ExportedAgentSchema", () => {
    it("should validate a valid exported agent", () => {
      const validExportedAgent = {
        name: "Test Agent",
        agentType: "agent",
        scope: "org",
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const result = ExportedAgentSchema.safeParse(validExportedAgent);
      expect(result.success).toBe(true);
    });

    it("should reject invalid agent type", () => {
      const invalidExportedAgent = {
        name: "Test Agent",
        agentType: "invalid_type",
        scope: "org",
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const result = ExportedAgentSchema.safeParse(invalidExportedAgent);
      expect(result.success).toBe(false);
    });

    it("should reject invalid scope", () => {
      const invalidExportedAgent = {
        name: "Test Agent",
        agentType: "agent",
        scope: "invalid_scope",
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const result = ExportedAgentSchema.safeParse(invalidExportedAgent);
      expect(result.success).toBe(false);
    });

    it("should accept optional fields", () => {
      const validExportedAgent = {
        name: "Test Agent",
        agentType: "agent",
        scope: "org",
        description: "A test agent",
        systemPrompt: "You are helpful",
        llmModel: "gpt-4",
        toolAssignmentMode: "manual",
        toolExposureMode: "full",
        teams: ["Team 1"],
        labels: [{ key: "env", value: "prod" }],
        toolNames: ["tool1", "tool2"],
        knowledgeBaseNames: ["kb1"],
        connectorNames: ["connector1"],
        suggestedPrompts: [
          { label: "Help", prompt: "Can you help me?" },
        ],
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const result = ExportedAgentSchema.safeParse(validExportedAgent);
      expect(result.success).toBe(true);
    });

    it("should generate a valid JSON schema", () => {
      const jsonSchema = buildJsonSchema(ExportedAgentSchema);
      expect(jsonSchema).toBeDefined();
      expect(jsonSchema.type).toBe("object");
      expect(jsonSchema.properties).toHaveProperty("name");
      expect(jsonSchema.properties).toHaveProperty("agentType");
      expect(jsonSchema.properties).toHaveProperty("scope");
      expect(jsonSchema.properties).toHaveProperty("exportedAt");
    });
  });

  describe("ImportAgentResponseSchema", () => {
    it("should validate a valid import response with warnings", () => {
      const validResponse = {
        agent: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          name: "Test Agent",
          agentType: "agent",
          scope: "org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tools: [],
          teams: [],
          labels: [],
          knowledgeBaseIds: [],
          connectorIds: [],
          suggestedPrompts: [],
        },
        warnings: [
          {
            type: "tool_not_found",
            message: "Tool not found",
            details: "The tool does not exist",
          },
        ],
      };

      const result = ImportAgentResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it("should validate a valid import response without warnings", () => {
      const validResponse = {
        agent: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          name: "Test Agent",
          agentType: "agent",
          scope: "org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tools: [],
          teams: [],
          labels: [],
          knowledgeBaseIds: [],
          connectorIds: [],
          suggestedPrompts: [],
        },
        warnings: undefined,
      };

      const result = ImportAgentResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it("should require agent field", () => {
      const invalidResponse = {
        warnings: [],
      };

      const result = ImportAgentResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it("should accept empty warnings array", () => {
      const validResponse = {
        agent: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          name: "Test Agent",
          agentType: "agent",
          scope: "org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tools: [],
          teams: [],
          labels: [],
          knowledgeBaseIds: [],
          connectorIds: [],
          suggestedPrompts: [],
        },
        warnings: [],
      };

      const result = ImportAgentResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });
  });
});
