/**
 * Planning tools - create_plan and update_plan.
 *
 * Factory functions that create tools with injected PlanStore.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { PlanStore } from "../planning/types.js";

/**
 * Parameters schema for create_plan tool.
 */
const CreatePlanParameters = Type.Object({
  title: Type.String({
    description: "The title/goal of the plan",
  }),
  steps: Type.Array(
    Type.Object({
      title: Type.String({
        description: "Title of the step",
      }),
      note: Type.Optional(
        Type.String({
          description: "Optional note or detail for the step",
        })
      ),
    }),
    {
      description: "List of steps to accomplish the goal",
      minItems: 1,
    }
  ),
});

type CreatePlanParams = Static<typeof CreatePlanParameters>;

/**
 * Tool result details for create_plan.
 */
interface CreatePlanDetails {
  id: string;
  title: string;
  status: string;
  steps: Array<{
    id: string;
    title: string;
    status: string;
    note?: string;
  }>;
  createdAt: string;
}

/**
 * Create the create_plan tool with injected PlanStore.
 */
export function createCreatePlanTool(
  store: PlanStore
): AgentTool<typeof CreatePlanParameters, CreatePlanDetails> {
  return {
    name: "create_plan",
    description:
      "Create a structured task plan with steps. Use this for complex tasks that benefit from being broken down into sequential steps.",
    label: "Create Plan",
    parameters: CreatePlanParameters,

    async execute(toolCallId, params, signal, onUpdate) {
      const plan = await store.create({
        title: params.title,
        steps: params.steps,
      });

      const stepsSummary = plan.steps
        .map((s, i) => `${i + 1}. ${s.title}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Created plan: "${plan.title}"\n\nSteps:\n${stepsSummary}\n\nPlan ID: ${plan.id}`,
          },
        ],
        details: {
          id: plan.id,
          title: plan.title,
          status: plan.status,
          steps: plan.steps.map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            note: s.note,
          })),
          createdAt: plan.createdAt,
        },
      };
    },
  };
}

/**
 * Parameters schema for update_plan tool.
 */
const UpdatePlanParameters = Type.Object({
  step_id: Type.String({
    description: "ID of the step to update",
  }),
  status: Type.Union(
    [
      Type.Literal("pending"),
      Type.Literal("in_progress"),
      Type.Literal("completed"),
    ],
    {
      description: "New status for the step",
    }
  ),
  note: Type.Optional(
    Type.String({
      description: "Optional note to add to the step",
    })
  ),
});

type UpdatePlanParams = Static<typeof UpdatePlanParameters>;

/**
 * Tool result details for update_plan.
 */
interface UpdatePlanDetails {
  planId: string;
  stepId: string;
  status: string;
  note?: string;
  planCompleted: boolean;
}

/**
 * Create the update_plan tool with injected PlanStore.
 */
export function createUpdatePlanTool(
  store: PlanStore
): AgentTool<typeof UpdatePlanParameters, UpdatePlanDetails> {
  return {
    name: "update_plan",
    description:
      "Update the status of a step in the current plan. Use this to mark steps as in_progress or completed.",
    label: "Update Plan",
    parameters: UpdatePlanParameters,

    async execute(toolCallId, params, signal, onUpdate) {
      const plan = await store.updateStep({
        stepId: params.step_id,
        status: params.status,
        note: params.note,
      });

      if (!plan) {
        return {
          content: [
            {
              type: "text",
              text: "No active plan found. Create a plan first using create_plan.",
            },
          ],
          details: {
            planId: "",
            stepId: params.step_id,
            status: params.status,
            note: params.note,
            planCompleted: false,
          },
        };
      }

      const step = plan.steps.find((s) => s.id === params.step_id);
      if (!step) {
        return {
          content: [
            {
              type: "text",
              text: `Step ${params.step_id} not found in the current plan.`,
            },
          ],
          details: {
            planId: plan.id,
            stepId: params.step_id,
            status: params.status,
            note: params.note,
            planCompleted: false,
          },
        };
      }

      const stepIndex = plan.steps.findIndex((s) => s.id === params.step_id) + 1;
      const progressSummary = plan.steps
        .map((s, i) => {
          const statusIcon =
            s.status === "completed"
              ? "✓"
              : s.status === "in_progress"
                ? "→"
                : "○";
          return `${statusIcon} ${i + 1}. ${s.title}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Updated step ${stepIndex}: "${step.title}" → ${params.status}\n\nProgress:\n${progressSummary}${plan.status === "completed" ? "\n\n🎉 All steps completed!" : ""}`,
          },
        ],
        details: {
          planId: plan.id,
          stepId: params.step_id,
          status: params.status,
          note: params.note,
          planCompleted: plan.status === "completed",
        },
      };
    },
  };
}
