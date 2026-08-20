export type ValidationLane = {
	key: string;
	output?: string | false;
};

export function validateLanes(lanes: ValidationLane[]): void {
	const laneKeys = lanes.map((lane) => lane.key);
	if (laneKeys.some((key) => key === "adaptive-escalation" || key === "adaptive-calibration")) {
		throw new Error('Lane keys "adaptive-escalation" and "adaptive-calibration" are reserved.');
	}
	if (new Set(laneKeys).size !== laneKeys.length) throw new Error("Every lane key must be unique.");
	const outputPaths = lanes.map((lane) => lane.output).filter((output): output is string => typeof output === "string");
	if (new Set(outputPaths).size !== outputPaths.length) throw new Error("Every explicit lane output path must be unique.");
}
