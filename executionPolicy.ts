const NON_EXECUTING_ACTIONS = new Set([
	"list", "get", "models", "children.list", "guide",
	"create", "update", "delete", "eject", "disable", "enable", "reset",
	"mission.create", "mission.list", "mission.show", "mission.update", "mission.resolve-decision", "mission.attach-run", "mission.close",
	"worktree.discard",
	"refine.show", "refine.rollback",
	"inspector.open", "inspector.status", "inspector.close",
	"project.status", "project.close",
	"status", "debug.run", "grant-spawn-budget", "interrupt", "stop", "dismiss", "doctor",
	"watchdog.status", "watchdog.check", "watchdog.configure", "watchdog.recommend-model",
	"schedule.list", "schedule.show", "schedule.history", "schedule.pause", "schedule.delete",
]);

export type SubagentToolInput = {
	action?: string;
	workflowScript?: string;
	agent?: string;
	task?: string;
	steeringRecovery?: boolean;
};

export function subagentExecutionBlockReason(input: SubagentToolInput): string | undefined {
	const normalizedAction = typeof input.action === "string" ? input.action.trim() : undefined;
	const attemptsExecution = normalizedAction !== undefined
		? Boolean(input.workflowScript)
			|| (normalizedAction === "steer" ? input.steeringRecovery !== false : !NON_EXECUTING_ACTIONS.has(normalizedAction))
		: Boolean(input.workflowScript || input.agent);
	if (!attemptsExecution) return undefined;
	return "Adaptive routing is enabled. Direct or scheduled subagent execution must not bypass adaptive_subagent_launch routing, thinking, worktree, and gate constraints.";
}
