export type WorkflowLane = Record<string, unknown>;
export type WorkflowRoute = { model: string };
export type WorkflowOptions = {
	escalation?: { enabled: boolean; model: string };
	calibration?: { enabled: boolean; model: string };
};

function escapeForScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildWorkflow(
	lanes: WorkflowLane[],
	routes: WorkflowRoute[],
	defaultCwd: string,
	options?: WorkflowOptions,
): string {
	const waves = new Map<number, WorkflowLane[]>();
	lanes.forEach((lane, index) => {
		const wave = typeof lane.wave === "number" ? lane.wave : 1;
		const risk = typeof lane.risk === "string" ? lane.risk : "inherited";
		const qualityContract = [
			"Quality contract:",
			`- Risk: ${risk}. Distinguish verified findings from static suspicions.`,
			"- Read-only lane: do not modify project files; report findings with evidence, not edits.",
			"- Report confidence (low/medium/high) and needsEscalation (true/false).",
			"- A blocker requires command/gate evidence or an exact code path with a reproducible failure; otherwise label it unverified.",
		].join("\n");
		const item = {
			key: lane.key,
			agent: lane.agent,
			task: `${String(lane.task)}\n\n${qualityContract}`,
			model: routes[index]!.model,
			context: lane.context ?? (lane.duty === "oracle" ? "fork" : undefined),
			cwd: lane.cwd ?? defaultCwd,
			output: lane.output ?? false,
			...(typeof lane.gate === "string" ? { gate: lane.gate } : {}),
		};
		const current = waves.get(wave) ?? [];
		current.push(item);
		waves.set(wave, current);
	});

	const lines = ["const results = [];"];
	let waveIndex = 0;
	for (const [, items] of [...waves.entries()].sort(([left], [right]) => left - right)) {
		waveIndex += 1;
		lines.push(`const waveResult${waveIndex} = await runs.all(${escapeForScript(items)});`);
		lines.push(`results.push(...waveResult${waveIndex});`);
	}
	if (options?.calibration?.enabled && lanes.length > 0) {
		const source = lanes[0]!;
		lines.push(`const calibration = await runs.run("adaptive-calibration", ${escapeForScript({
			agent: source.agent,
			task: `${String(source.task)}\n\nCalibration contract: independently answer the same task so the parent can compare quality against the economical route.`,
			model: options.calibration.model,
			context: source.context ?? (source.duty === "oracle" ? "fork" : "fresh"),
			cwd: source.cwd ?? defaultCwd,
			output: false,
		})});`);
		lines.push("results.push(calibration);");
	}
	if (options?.escalation?.enabled) {
		lines.push("const escalationSignals = results.filter((result) => /(?:[\\\"']?needsEscalation[\\\"']?\\s*[:=]\\s*true)|(?:[\\\"']?confidence[\\\"']?\\s*[:=]\\s*[\\\"']?low)/i.test(String(result.output ?? '')));");
		lines.push("if (escalationSignals.length > 0) {");
		lines.push("  const escalationTask = 'Independently re-check these low-confidence/escalated child reports. Verify blockers with exact evidence and clearly resolve conflicts. If no substantive claim is present, return insufficient-evidence immediately without exploring the repository. Use repository tools when needed, but stay within the configured turn budget:\\n\\n' + escalationSignals.map((result) => String(result.output ?? '')).join('\\n\\n---\\n\\n');");
		lines.push(`  const escalation = await runs.run("adaptive-escalation", { ...${escapeForScript({ agent: "reviewer", model: options.escalation.model, context: "fresh", cwd: defaultCwd, output: false, turnBudget: { maxTurns: 4, graceTurns: 1 } })}, task: escalationTask });`);
		lines.push("  results.push(escalation);");
		lines.push("}");
	}
	lines.push("return results.map((result) => result.output);");
	return lines.join("\n");
}
