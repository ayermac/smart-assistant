/**
 * Planning types - defines interfaces for task plan persistence.
 */

/**
 * Step status values.
 * D-02: Three statuses - pending, in_progress, completed
 */
export type StepStatus = "pending" | "in_progress" | "completed";

/**
 * Represents a single step in a plan.
 */
export interface PlanStep {
  id: string;
  title: string;
  status: StepStatus;
  note?: string;
}

/**
 * Plan status values.
 */
export type PlanStatus = "active" | "completed" | "abandoned";

/**
 * Represents a task plan with structured steps.
 * D-01: Minimal schema - id, title, status, steps, createdAt, updatedAt
 */
export interface Plan {
  id: string;
  title: string;
  status: PlanStatus;
  steps: PlanStep[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating a new plan.
 */
export interface CreatePlanOptions {
  title: string;
  steps: Array<{
    title: string;
    note?: string;
  }>;
}

/**
 * Options for updating a plan step.
 */
export interface UpdateStepOptions {
  stepId: string;
  status: StepStatus;
  note?: string;
}

/**
 * Interface for plan persistence operations.
 */
export interface PlanStore {
  /** Create a new plan with the given title and steps. */
  create(options: CreatePlanOptions): Promise<Plan>;

  /** Get the current active plan. */
  get(): Promise<Plan | null>;

  /** Update a step's status and optional note. */
  updateStep(options: UpdateStepOptions): Promise<Plan | null>;

  /** Delete the current plan. */
  clear(): Promise<boolean>;
}
