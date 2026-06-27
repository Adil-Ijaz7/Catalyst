import { PlanStep } from '../types';

export class Planner {
  public createPlan(prompt: string): PlanStep[] {
    const normalized = prompt.toLowerCase();
    const plan: PlanStep[] = [
      { id: 'understand', title: 'Understand the request', status: 'completed' },
      { id: 'discover', title: 'Discover relevant files', status: 'in_progress' },
      { id: 'analyze', title: 'Read project context', status: 'pending' },
      { id: 'execute', title: 'Use tools and stage changes', status: 'pending' },
      { id: 'respond', title: 'Summarize results and next steps', status: 'pending' }
    ];

    if (/(fix|bug|error|diagnostic)/.test(normalized)) {
      plan.splice(3, 0, { id: 'diagnostics', title: 'Inspect diagnostics', status: 'pending' });
    }

    if (/(refactor|rewrite|modify|create|delete|change|update)/.test(normalized)) {
      plan.splice(plan.length - 1, 0, { id: 'diff', title: 'Prepare diff preview for approval', status: 'pending' });
    }

    return plan;
  }

  public markStep(plan: PlanStep[], stepId: string, status: PlanStep['status']): PlanStep[] {
    return plan.map((step) => ({
      ...step,
      status: step.id === stepId ? status : step.status
    }));
  }
}
