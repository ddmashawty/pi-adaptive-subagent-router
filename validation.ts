import path from "node:path";

export type ValidationLane = {
	key: string;
	role: "read" | "write";
	worktree?: boolean;
	output?: string | false;
	authority?: string[];
	cwd?: string;
};

export function assertReadOnlyRollout(lanes: Pick<ValidationLane, "key" | "role">[]): void {
	const writer = lanes.find((lane) => lane.role === "write");
	if (writer) throw new Error(`Writer lane "${writer.key}" is disabled during the read-only rollout; authority enforcement must be remediated before enabling writes.`);
}

export function validateLaneIsolation(lanes: ValidationLane[], defaultCwd: string, calibrationSample: boolean): void {
	const laneKeys = lanes.map((lane) => lane.key);
	if (laneKeys.some((key) => key === "adaptive-escalation" || key === "adaptive-calibration")) {
		throw new Error('Lane keys "adaptive-escalation" and "adaptive-calibration" are reserved.');
	}
	if (new Set(laneKeys).size !== laneKeys.length) throw new Error("Every lane key must be unique.");
	const outputPaths = lanes.map((lane) => lane.output).filter((output): output is string => typeof output === "string");
	if (new Set(outputPaths).size !== outputPaths.length) throw new Error("Every explicit lane output path must be unique.");

	const writerLanes = lanes.filter((lane) => lane.role === "write");
	if (calibrationSample && writerLanes.length > 0) throw new Error("Calibration sampling is read-only and cannot duplicate writer lanes.");
	if (writerLanes.some((lane) => !lane.authority || lane.authority.length === 0)) {
		throw new Error("Every writer lane requires at least one authority file/directory prefix.");
	}
	for (const lane of writerLanes) {
		for (const entry of lane.authority ?? []) {
			const normalized = path.normalize(entry);
			if (path.isAbsolute(entry) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
				throw new Error(`Writer authority for "${lane.key}" must stay relative to its lane cwd: ${entry}`);
			}
		}
	}
	if (writerLanes.length > 1 && writerLanes.some((lane) => lane.worktree !== true)) {
		throw new Error("Multiple writer lanes require worktree:true for every writer and non-overlapping authority boundaries.");
	}
	const writerAuthorities = writerLanes.map((lane) => ({
		key: lane.key,
		paths: (lane.authority ?? []).map((entry) => path.resolve(lane.cwd ?? defaultCwd, entry)),
	}));
	for (let left = 0; left < writerAuthorities.length; left += 1) {
		for (let right = left + 1; right < writerAuthorities.length; right += 1) {
			const overlaps = writerAuthorities[left]!.paths.some((leftPath) => writerAuthorities[right]!.paths.some((rightPath) =>
				leftPath === rightPath || leftPath.startsWith(`${rightPath}${path.sep}`) || rightPath.startsWith(`${leftPath}${path.sep}`),
			));
			if (overlaps) throw new Error(`Writer authority overlaps between "${writerAuthorities[left]!.key}" and "${writerAuthorities[right]!.key}".`);
		}
	}
}
