/**
 * File-based plan store implementation.
 *
 * Persists the current plan as a JSON file.
 * D-04: Single plan mode - create overwrites previous.
 * D-05: JSON file storage at {dataDir}/plans/current-plan.json
 */

import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataPaths } from "../config.js";
import type {
  Plan,
  PlanStep,
  PlanStore,
  CreatePlanOptions,
  UpdateStepOptions,
} from "./types.js";

/**
 * File-based implementation of PlanStore.
 */
export class FilePlanStore implements PlanStore {
  private readonly plansDir: string;
  private readonly planFilePath: string;

  constructor(plansDir?: string) {
    this.plansDir = plansDir ?? resolveDataPaths().plans;
    this.planFilePath = join(this.plansDir, "current-plan.json");
  }

  /**
   * Ensure the plans directory exists.
   */
  private async ensureDir(): Promise<void> {
    await mkdir(this.plansDir, { recursive: true });
  }

  /**
   * Atomically write JSON to a file.
   * Writes to a temp file first, then renames to prevent corruption.
   */
  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    await this.ensureDir();

    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
    await rename(tempPath, filePath);
  }

  /**
   * Generate a step ID.
   */
  private generateStepId(): string {
    return `step-${randomUUID()}`;
  }

  async create(options: CreatePlanOptions): Promise<Plan> {
    const now = new Date().toISOString();
    const id = `plan-${randomUUID()}`;

    // Create steps with IDs and default status
    const steps: PlanStep[] = options.steps.map((step) => ({
      id: this.generateStepId(),
      title: step.title,
      status: "pending" as const,
      note: step.note,
    }));

    const plan: Plan = {
      id,
      title: options.title,
      status: "active",
      steps,
      createdAt: now,
      updatedAt: now,
    };

    // D-04: Single plan mode - overwrite previous
    await this.atomicWriteJson(this.planFilePath, plan);

    return plan;
  }

  async get(): Promise<Plan | null> {
    try {
      const content = await readFile(this.planFilePath, "utf8");
      return JSON.parse(content) as Plan;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async updateStep(options: UpdateStepOptions): Promise<Plan | null> {
    const plan = await this.get();
    if (!plan) {
      return null;
    }

    // Find the step to update
    const stepIndex = plan.steps.findIndex((s) => s.id === options.stepId);
    if (stepIndex === -1) {
      return null;
    }

    // Update the step
    plan.steps[stepIndex] = {
      ...plan.steps[stepIndex],
      status: options.status,
      note: options.note ?? plan.steps[stepIndex].note,
    };

    // Update plan timestamp
    plan.updatedAt = new Date().toISOString();

    // Check if all steps are completed
    const allCompleted = plan.steps.every((s) => s.status === "completed");
    if (allCompleted) {
      plan.status = "completed";
    }

    // Persist updated plan
    await this.atomicWriteJson(this.planFilePath, plan);

    return plan;
  }

  async clear(): Promise<boolean> {
    try {
      await unlink(this.planFilePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }
}
