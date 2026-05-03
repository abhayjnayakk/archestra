import { and, eq, inArray } from "drizzle-orm";
import db, { schema } from "@/database";
import type { Agent } from "@/types";
import {
  type ExportedAgent,
  type ImportWarning,
  ImportWarningSchema,
} from "@/types/agent-export";
import AgentLabelModel from "./agent-label";
import AgentToolModel from "./agent-tool";
import KnowledgeBaseConnectorModel from "./knowledge-base-connector";
import KnowledgeBaseModel from "./knowledge-base";
import TeamModel from "./team";
import ToolModel from "./tool";

/**
 * Export an agent to a portable JSON format.
 * Strips internal database IDs and exports portable references.
 */
export async function exportAgent(
  agentId: string,
): Promise<ExportedAgent> {
  // Fetch the agent with all related data
  const [agent] = await db
    .select()
    .from(schema.agentsTable)
    .where(eq(schema.agentsTable.id, agentId))
    .limit(1);

  if (!agent) {
    throw new Error("Agent not found");
  }

  // Fetch teams
  const teamRows = await db
    .select({ name: schema.teamsTable.name })
    .from(schema.agentTeamsTable)
    .innerJoin(
      schema.teamsTable,
      eq(schema.agentTeamsTable.teamId, schema.teamsTable.id),
    )
    .where(eq(schema.agentTeamsTable.agentId, agentId));

  // Fetch labels with their key-value pairs
  const labelRows = await db
    .select({
      key: schema.labelKeysTable.key,
      value: schema.labelValuesTable.value,
    })
    .from(schema.agentLabelsTable)
    .innerJoin(
      schema.labelKeysTable,
      eq(schema.agentLabelsTable.keyId, schema.labelKeysTable.id),
    )
    .innerJoin(
      schema.labelValuesTable,
      eq(schema.agentLabelsTable.valueId, schema.labelValuesTable.id),
    )
    .where(eq(schema.agentLabelsTable.agentId, agentId));

  // Fetch tool names
  const toolRows = await db
    .select({ name: schema.toolsTable.name })
    .from(schema.agentToolsTable)
    .innerJoin(
      schema.toolsTable,
      eq(schema.agentToolsTable.toolId, schema.toolsTable.id),
    )
    .where(eq(schema.agentToolsTable.agentId, agentId));

  // Fetch knowledge base names
  const kbRows = await db
    .select({ name: schema.knowledgeBasesTable.name })
    .from(schema.agentKnowledgeBaseTable)
    .innerJoin(
      schema.knowledgeBasesTable,
      eq(schema.agentKnowledgeBaseTable.knowledgeBaseId, schema.knowledgeBasesTable.id),
    )
    .where(eq(schema.agentKnowledgeBaseTable.agentId, agentId));

  // Fetch connector names
  const connectorRows = await db
    .select({ name: schema.knowledgeBaseConnectorsTable.name })
    .from(schema.agentConnectorAssignmentTable)
    .innerJoin(
      schema.knowledgeBaseConnectorsTable,
      eq(schema.agentConnectorAssignmentTable.connectorId, schema.knowledgeBaseConnectorsTable.id),
    )
    .where(eq(schema.agentConnectorAssignmentTable.agentId, agentId));

  // Fetch suggested prompts
  const suggestedPromptRows = await db
    .select({
      label: schema.agentSuggestedPromptsTable.label,
      prompt: schema.agentSuggestedPromptsTable.prompt,
    })
    .from(schema.agentSuggestedPromptsTable)
    .where(eq(schema.agentSuggestedPromptsTable.agentId, agentId));

  // Build the exported agent object
  const exportedAgent: ExportedAgent = {
    name: agent.name,
    description: agent.description || undefined,
    agentType: agent.agentType,
    scope: agent.scope,
    icon: agent.icon,
    systemPrompt: agent.systemPrompt || undefined,
    llmModel: agent.llmModel || undefined,
    toolAssignmentMode: agent.toolAssignmentMode || undefined,
    toolExposureMode: agent.toolExposureMode || undefined,
    teams: teamRows.map((r) => r.name),
    labels: labelRows.map((r) => ({ key: r.key, value: r.value })),
    toolNames: toolRows.map((r) => r.name),
    knowledgeBaseNames: kbRows.map((r) => r.name),
    connectorNames: connectorRows.map((r) => r.name),
    suggestedPrompts: suggestedPromptRows.map((r) => ({
      label: r.label,
      prompt: r.prompt,
    })),
    exportedAt: new Date().toISOString(),
    version: "1.0",
  };

  return exportedAgent;
}

/**
 * Import an agent from a portable JSON format.
 * Resolves tool/KB/connector names against the local registry.
 * Returns the created agent and any warnings.
 */
export async function importAgent(
  exportedAgent: ExportedAgent,
  organizationId: string,
  userId?: string,
): Promise<{ agent: Agent; warnings: ImportWarning[] }> {
  const warnings: ImportWarning[] = [];

  // Validate the exported agent
  const { ExportedAgentSchema } = await import("@/types/agent-export");
  const validationResult = ExportedAgentSchema.safeParse(exportedAgent);

  if (!validationResult.success) {
    throw new Error("Invalid agent export format");
  }

  // Resolve team names to IDs
  const teamIds: string[] = [];
  if (exportedAgent.teams && exportedAgent.teams.length > 0) {
    for (const teamName of exportedAgent.teams) {
      const [team] = await db
        .select({ id: schema.teamsTable.id })
        .from(schema.teamsTable)
        .where(
          and(
            eq(schema.teamsTable.name, teamName),
            eq(schema.teamsTable.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!team) {
        warnings.push({
          type: "team_not_found",
          message: `Team "${teamName}" not found`,
          details: `The team "${teamName}" from the exported agent does not exist in this organization.`,
        });
      } else {
        teamIds.push(team.id);
      }
    }
  }

  // Resolve labels
  const labels: Array<{ key: string; value: string }> = [];
  if (exportedAgent.labels && exportedAgent.labels.length > 0) {
    for (const label of exportedAgent.labels) {
      const [keyRow] = await db
        .select({ id: schema.labelKeysTable.id })
        .from(schema.labelKeysTable)
        .where(eq(schema.labelKeysTable.key, label.key))
        .limit(1);

      if (!keyRow) {
        warnings.push({
          type: "label_not_found",
          message: `Label key "${label.key}" not found`,
          details: `The label key "${label.key}" from the exported agent does not exist.`,
        });
        continue;
      }

      const [valueRow] = await db
        .select({ id: schema.labelValuesTable.id })
        .from(schema.labelValuesTable)
        .where(
          and(
            eq(schema.labelValuesTable.keyId, keyRow.id),
            eq(schema.labelValuesTable.value, label.value),
          ),
        )
        .limit(1);

      if (!valueRow) {
        warnings.push({
          type: "label_not_found",
          message: `Label value "${label.value}" for key "${label.key}" not found`,
          details: `The label value "${label.value}" from the exported agent does not exist.`,
        });
        continue;
      }

      labels.push({
        key: keyRow.id,
        value: valueRow.id,
      });
    }
  }

  // Resolve tool names to IDs
  const toolNames: string[] = [];
  if (exportedAgent.toolNames && exportedAgent.toolNames.length > 0) {
    for (const toolName of exportedAgent.toolNames) {
      const [tool] = await db
        .select({ name: schema.toolsTable.name })
        .from(schema.toolsTable)
        .where(eq(schema.toolsTable.name, toolName))
        .limit(1);

      if (!tool) {
        warnings.push({
          type: "tool_not_found",
          message: `Tool "${toolName}" not found`,
          details: `The tool "${toolName}" from the exported agent does not exist in this organization.`,
        });
      } else {
        toolNames.push(toolName);
      }
    }
  }

  // Resolve knowledge base names to IDs
  const knowledgeBaseIds: string[] = [];
  if (exportedAgent.knowledgeBaseNames && exportedAgent.knowledgeBaseNames.length > 0) {
    for (const kbName of exportedAgent.knowledgeBaseNames) {
      const [kb] = await db
        .select({ id: schema.knowledgeBasesTable.id })
        .from(schema.knowledgeBasesTable)
        .where(
          and(
            eq(schema.knowledgeBasesTable.name, kbName),
            eq(schema.knowledgeBasesTable.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!kb) {
        warnings.push({
          type: "knowledge_base_not_found",
          message: `Knowledge base "${kbName}" not found`,
          details: `The knowledge base "${kbName}" from the exported agent does not exist in this organization.`,
        });
      } else {
        knowledgeBaseIds.push(kb.id);
      }
    }
  }

  // Resolve connector names to IDs
  const connectorIds: string[] = [];
  if (exportedAgent.connectorNames && exportedAgent.connectorNames.length > 0) {
    for (const connectorName of exportedAgent.connectorNames) {
      const [connector] = await db
        .select({ id: schema.knowledgeBaseConnectorsTable.id })
        .from(schema.knowledgeBaseConnectorsTable)
        .where(
          and(
            eq(schema.knowledgeBaseConnectorsTable.name, connectorName),
            eq(schema.knowledgeBaseConnectorsTable.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!connector) {
        warnings.push({
          type: "connector_not_found",
          message: `Connector "${connectorName}" not found`,
          details: `The connector "${connectorName}" from the exported agent does not exist in this organization.`,
        });
      } else {
        connectorIds.push(connector.id);
      }
    }
  }

  // Create the agent
  const { AgentModel } = await import("./agent");
  const agent = await AgentModel.create(
    {
      organizationId,
      name: exportedAgent.name,
      description: exportedAgent.description,
      agentType: exportedAgent.agentType,
      scope: exportedAgent.scope,
      icon: exportedAgent.icon,
      systemPrompt: exportedAgent.systemPrompt,
      llmModel: exportedAgent.llmModel,
      toolAssignmentMode: exportedAgent.toolAssignmentMode,
      toolExposureMode: exportedAgent.toolExposureMode,
      teams: teamIds,
      knowledgeBaseIds: knowledgeBaseIds.length > 0 ? knowledgeBaseIds : undefined,
      connectorIds: connectorIds.length > 0 ? connectorIds : undefined,
      suggestedPrompts: exportedAgent.suggestedPrompts,
    },
    exportedAgent.scope === "personal" ? userId : undefined,
  );

  // Assign labels (after agent is created)
  if (labels.length > 0) {
    await AgentLabelModel.syncAgentLabels(agent.id, labels);
  }

  return { agent, warnings };
}
