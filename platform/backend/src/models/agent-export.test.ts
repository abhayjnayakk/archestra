import { describe, expect, it, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import db, { schema } from "@/database";
import AgentModel from "@/models/agent";
import { exportAgent, importAgent } from "@/models/agent-export";
import type { ExportedAgent } from "@/types/agent-export";

describe("Agent Export/Import", () => {
  let organizationId: string;
  let testAgentId: string;
  let testTeamId: string;
  let testKnowledgeBaseId: string;
  let testConnectorId: string;

  beforeEach(async () => {
    // Get or create a test organization
    const [org] = await db
      .select()
      .from(schema.organizationsTable)
      .limit(1);

    if (!org) {
      throw new Error("No organization found for testing");
    }
    organizationId = org.id;

    // Clean up test data
    await db
      .delete(schema.agentSuggestedPromptsTable)
      .where(eq(schema.agentSuggestedPromptsTable.agentId, testAgentId));
    await db
      .delete(schema.agentConnectorAssignmentTable)
      .where(eq(schema.agentConnectorAssignmentTable.agentId, testAgentId));
    await db
      .delete(schema.agentKnowledgeBaseTable)
      .where(eq(schema.agentKnowledgeBaseTable.agentId, testAgentId));
    await db
      .delete(schema.agentLabelsTable)
      .where(eq(schema.agentLabelsTable.agentId, testAgentId));
    await db
      .delete(schema.agentToolsTable)
      .where(eq(schema.agentToolsTable.agentId, testAgentId));
    await db
      .delete(schema.agentTeamsTable)
      .where(eq(schema.agentTeamsTable.agentId, testAgentId));
    await db
      .delete(schema.agentsTable)
      .where(eq(schema.agentsTable.name, "Test Export Agent"));
  });

  describe("exportAgent", () => {
    it("should export an agent with all its configuration", async () => {
      // Create a test agent
      const agent = await AgentModel.create({
        organizationId,
        name: "Test Export Agent",
        agentType: "agent",
        scope: "org",
        description: "Test description",
        systemPrompt: "You are a helpful assistant",
        llmModel: "gpt-4",
        toolAssignmentMode: "manual",
        toolExposureMode: "full",
      });

      testAgentId = agent.id;

      // Create a test label key and value
      const [labelKey] = await db
        .insert(schema.labelKeysTable)
        .values({ key: "test_key" })
        .returning();

      if (!labelKey) {
        throw new Error("Failed to create label key");
      }

      const [labelValue] = await db
        .insert(schema.labelValuesTable)
        .values({ keyId: labelKey.id, value: "test_value" })
        .returning();

      if (!labelValue) {
        throw new Error("Failed to create label value");
      }

      // Assign label to agent
      await db.insert(schema.agentLabelsTable).values({
        agentId: testAgentId,
        keyId: labelKey.id,
        valueId: labelValue.id,
      });

      // Export the agent
      const exported = await exportAgent(testAgentId);

      // Verify exported structure
      expect(exported).toBeDefined();
      expect(exported.name).toBe("Test Export Agent");
      expect(exported.description).toBe("Test description");
      expect(exported.agentType).toBe("agent");
      expect(exported.scope).toBe("org");
      expect(exported.systemPrompt).toBe("You are a helpful assistant");
      expect(exported.llmModel).toBe("gpt-4");
      expect(exported.toolAssignmentMode).toBe("manual");
      expect(exported.toolExposureMode).toBe("full");
      expect(exported.labels).toEqual([{ key: "test_key", value: "test_value" }]);
      expect(exported.exportedAt).toBeDefined();
      expect(exported.version).toBe("1.0");

      // Verify no internal IDs are included
      expect(exported).not.toHaveProperty("id");
      expect(exported.teams).not.toContain(expect.any(Object));
      expect(exported.labels).not.toContain(
        expect.objectContaining({ keyId: expect.any(String) }),
      );
    });

    it("should export an agent with suggested prompts", async () => {
      // Create a test agent
      const agent = await AgentModel.create({
        organizationId,
        name: "Test Export Agent",
        agentType: "agent",
        scope: "org",
        suggestedPrompts: [
          { label: "Help", prompt: "Can you help me?" },
          { label: "Info", prompt: "Tell me about X" },
        ],
      });

      testAgentId = agent.id;

      // Export the agent
      const exported = await exportAgent(testAgentId);

      // Verify suggested prompts
      expect(exported.suggestedPrompts).toHaveLength(2);
      expect(exported.suggestedPrompts).toEqual([
        { label: "Help", prompt: "Can you help me?" },
        { label: "Info", prompt: "Tell me about X" },
      ]);
    });
  });

  describe("importAgent", () => {
    it("should import an agent and create a new agent", async () => {
      const exportedAgent: ExportedAgent = {
        name: "Imported Test Agent",
        description: "Imported description",
        agentType: "agent",
        scope: "org",
        systemPrompt: "You are a helpful assistant",
        llmModel: "gpt-4",
        toolAssignmentMode: "manual",
        toolExposureMode: "full",
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const result = await importAgent(exportedAgent, organizationId);

      expect(result.agent).toBeDefined();
      expect(result.agent.name).toBe("Imported Test Agent");
      expect(result.agent.description).toBe("Imported description");
      expect(result.agent.systemPrompt).toBe("You are a helpful assistant");
      expect(result.agent.llmModel).toBe("gpt-4");
      expect(result.agent.toolAssignmentMode).toBe("manual");
      expect(result.agent.toolExposureMode).toBe("full");
      expect(result.agent.id).toBeDefined();
      expect(result.agent.id).not.toMatch(/^test-/); // Should be a real UUID, not test data

      // Clean up
      await db
        .delete(schema.agentsTable)
        .where(eq(schema.agentsTable.id, result.agent.id));
    });

    it("should import an agent with labels", async () => {
      // Create label key and value
      const [labelKey] = await db
        .insert(schema.labelKeysTable)
        .values({ key: "environment" })
        .returning();

      if (!labelKey) {
        throw new Error("Failed to create label key");
      }

      const [labelValue] = await db
        .insert(schema.labelValuesTable)
        .values({ keyId: labelKey.id, value: "production" })
        .returning();

      if (!labelValue) {
        throw new Error("Failed to create label value");
      }

      const exportedAgent: ExportedAgent = {
        name: "Imported Agent with Labels",
        agentType: "agent",
        scope: "org",
        labels: [{ key: "environment", value: "production" }],
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const result = await importAgent(exportedAgent, organizationId);

      expect(result.agent).toBeDefined();
      expect(result.warnings).toHaveLength(0);

      // Verify labels were assigned
      const labels = await db
        .select()
        .from(schema.agentLabelsTable)
        .where(eq(schema.agentLabelsTable.agentId, result.agent.id));

      expect(labels).toHaveLength(1);

      // Clean up
      await db
        .delete(schema.agentsTable)
        .where(eq(schema.agentsTable.id, result.agent.id));
    });

    it("should return warnings for missing labels", async () => {
      const exportedAgent: ExportedAgent = {
        name: "Imported Agent with Missing Labels",
        agentType: "agent",
        scope: "org",
        labels: [{ key: "nonexistent_key", value: "nonexistent_value" }],
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const result = await importAgent(exportedAgent, organizationId);

      expect(result.agent).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings![0].type).toBe("label_not_found");

      // Clean up
      await db
        .delete(schema.agentsTable)
        .where(eq(schema.agentsTable.id, result.agent.id));
    });

    it("should import a personal-scoped agent with a userId", async () => {
      const testUserId = "test-user-id";

      const exportedAgent: ExportedAgent = {
        name: "Personal Test Agent",
        agentType: "agent",
        scope: "personal",
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const result = await importAgent(
        exportedAgent,
        organizationId,
        testUserId,
      );

      expect(result.agent).toBeDefined();
      expect(result.agent.scope).toBe("personal");
      expect(result.agent.authorId).toBe(testUserId);

      // Clean up
      await db
        .delete(schema.agentsTable)
        .where(eq(schema.agentsTable.id, result.agent.id));
    });
  });

  describe("round-trip export/import", () => {
    it("should preserve all agent configuration through export/import cycle", async () => {
      // Create a test agent with all features
      const agent = await AgentModel.create({
        organizationId,
        name: "Round Trip Test Agent",
        agentType: "agent",
        scope: "org",
        description: "Complete test",
        systemPrompt: "System prompt here",
        llmModel: "gpt-4",
        toolAssignmentMode: "automatic",
        toolExposureMode: "search_and_run_only",
        suggestedPrompts: [
          { label: "Test 1", prompt: "Prompt 1" },
          { label: "Test 2", prompt: "Prompt 2" },
        ],
      });

      testAgentId = agent.id;

      // Export the agent
      const exported = await exportAgent(testAgentId);

      // Import it back
      const result = await importAgent(exported, organizationId);
      const importedAgent = result.agent;

      // Verify all fields match
      expect(importedAgent.name).toBe(exported.name);
      expect(importedAgent.description).toBe(exported.description);
      expect(importedAgent.agentType).toBe(exported.agentType);
      expect(importedAgent.scope).toBe(exported.scope);
      expect(importedAgent.systemPrompt).toBe(exported.systemPrompt);
      expect(importedAgent.llmModel).toBe(exported.llmModel);
      expect(importedAgent.toolAssignmentMode).toBe(exported.toolAssignmentMode);
      expect(importedAgent.toolExposureMode).toBe(exported.toolExposureMode);
      expect(importedAgent.suggestedPrompts).toEqual(exported.suggestedPrompts);

      // Clean up imported agent
      await db
        .delete(schema.agentsTable)
        .where(eq(schema.agentsTable.id, importedAgent.id));
    });
  });
});
