export type ValidationLane = {
	key: string;
	agent?: string;
	duty?: "scout" | "reviewer" | "oracle" | "worker" | "delegate" | "research";
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

	const writingLanes = lanes.filter((lane) => lane.duty === "worker" || lane.duty === "delegate");
	if (writingLanes.length > 1) throw new Error("An adaptive workflow permits at most one writing lane (worker or delegate).");
	if (writingLanes.length > 0 && calibrationSample) throw new Error("Calibration sampling is read-only and cannot duplicate a writing lane.");
	for (const lane of writingLanes) {
		const role = lane.duty === "worker" ? "Worker" : "Delegate";
		if (lane.worktree !== true) throw new Error(`${role} lane "${lane.key}" requires worktree:true.`);
		if (typeof lane.gate !== "string" || !lane.gate.trim()) throw new Error(`${role} lane "${lane.key}" requires a gate command.`);
	}
}
