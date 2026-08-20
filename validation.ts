export type ValidationLane = {
	key: string;
	agent?: string;
	duty?: "scout" | "reviewer" | "oracle" | "worker" | "research";
	worktree?: boolean;
	gate?: string;
	output?: string | false;
};

export function validateLanes(lanes: ValidationLane[], calibrationSample = false): void {
	const laneKeys = lanes.map((lane) => lane.key);
	if (laneKeys.some((key) => key === "adaptive-escalation" || key === "adaptive-calibration")) {
		throw new Error('Lane keys "adaptive-escalation" and "adaptive-calibration" are reserved.');
	}
	if (new Set(laneKeys).size !== laneKeys.length) throw new Error("Every lane key must be unique.");
	const outputPaths = lanes.map((lane) => lane.output).filter((output): output is string => typeof output === "string");
	if (new Set(outputPaths).size !== outputPaths.length) throw new Error("Every explicit lane output path must be unique.");

	const workers = lanes.filter((lane) => lane.duty === "worker");
	if (workers.length > 1) throw new Error("An adaptive workflow permits at most one worker.");
	if (workers.length > 0 && calibrationSample) throw new Error("Calibration sampling is read-only and cannot duplicate a worker lane.");
	for (const worker of workers) {
		if (worker.worktree !== true) throw new Error(`Worker lane "${worker.key}" requires worktree:true.`);
		if (typeof worker.gate !== "string" || !worker.gate.trim()) throw new Error(`Worker lane "${worker.key}" requires a gate command.`);
	}
}
