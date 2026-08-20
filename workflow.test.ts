import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkflow } from "./workflow.ts";

function compile(script: string) {
	return new Function("runs", `return (async () => { ${script} })();`) as (runs: unknown) => Promise<unknown>;
}

async function capturedChild(context?: "fresh" | "fork") {
	let captured: Array<Record<string, unknown>> = [];
	const script = buildWorkflow([{
		key: "oracle-check",
		agent: "oracle",
		duty: "oracle",
		task: "Challenge the current plan",
		risk: "medium",
		...(context ? { context } : {}),
		output: false,
	}], [{ model: "provider/parent:high" }], "/tmp/project");
	await compile(script)({
		all: async (items: Array<Record<string, unknown>>) => {
			captured = items;
			return [{ output: "oracle result" }];
		},
	});
	return captured[0];
}

test("oracle defaults to fork context", async () => {
	assert.equal((await capturedChild())?.context, "fork");
});

test("an explicit oracle context overrides the fork default", async () => {
	assert.equal((await capturedChild("fresh"))?.context, "fresh");
});

test("oracle remains a read-only evidence lane", async () => {
	const child = await capturedChild();
	assert.match(String(child?.task), /Read-only lane/);
	assert.match(String(child?.task), /confidence/);
});

test("read-only workflow results remain plain strings", async () => {
	const script = buildWorkflow([{
		key: "scout-check",
		agent: "scout",
		duty: "scout",
		task: "Inspect",
		risk: "low",
		output: false,
	}], [{ model: "provider/economy:low" }], "/tmp/project");
	const result = await compile(script)({
		all: async () => [{ key: "scout-check", output: "scout result", artifactPaths: ["/tmp/output.md"] }],
	});
	assert.deepEqual(result, ["scout result"]);
});

test("worker uses managed worktree, write contract, fork, gate, and returns handoff artifacts", async () => {
	let captured: Record<string, unknown> | undefined;
	const script = buildWorkflow([{
		key: "worker-impl",
		agent: "worker",
		duty: "worker",
		task: "Create the requested file",
		risk: "medium",
		worktree: true,
		gate: "test -f worker-output.txt",
		output: false,
	}], [{ model: "provider/parent:high" }], "/tmp/project");
	const result = await compile(script)({
		all: async (items: Array<Record<string, unknown>>) => {
			captured = items[0];
			return [{
				key: "worker-impl",
				output: "implemented",
				artifactPaths: ["/tmp/handoff.json"],
				runId: "worker-run",
			}];
		},
	});
	assert.equal(captured?.context, "fork");
	assert.equal(captured?.worktree, true);
	assert.equal(captured?.gate, "test -f worker-output.txt");
	assert.match(String(captured?.task), /managed-worktree/i);
	assert.doesNotMatch(String(captured?.task), /Read-only lane/);
	assert.deepEqual(result, [{
		output: "implemented",
		artifactPaths: ["/tmp/handoff.json"],
		runId: "worker-run",
	}]);
});

test("delegate uses managed worktree, delegate contract, fork, gate, and returns handoff artifacts", async () => {
	let captured: Record<string, unknown> | undefined;
	const script = buildWorkflow([{
		key: "delegate-task",
		agent: "delegate",
		duty: "delegate",
		task: "Complete the bounded delegated task",
		risk: "medium",
		worktree: true,
		gate: "test -f delegate-output.txt",
		output: false,
	}], [{ model: "provider/parent:low" }], "/tmp/project");
	const result = await compile(script)({
		all: async (items: Array<Record<string, unknown>>) => {
			captured = items[0];
			return [{
				key: "delegate-task",
				output: "delegated",
				artifactPaths: ["/tmp/delegate-handoff.json"],
				runId: "delegate-run",
			}];
		},
	});
	assert.equal(captured?.context, "fork");
	assert.equal(captured?.worktree, true);
	assert.equal(captured?.gate, "test -f delegate-output.txt");
	assert.match(String(captured?.task), /managed-worktree delegate/i);
	assert.doesNotMatch(String(captured?.task), /Read-only lane/);
	assert.deepEqual(result, [{
		output: "delegated",
		artifactPaths: ["/tmp/delegate-handoff.json"],
		runId: "delegate-run",
	}]);
});

test("an explicit delegate context overrides the fork default", async () => {
	let captured: Record<string, unknown> | undefined;
	const script = buildWorkflow([{
		key: "delegate-fresh",
		agent: "delegate",
		duty: "delegate",
		task: "Complete the bounded delegated task",
		risk: "medium",
		context: "fresh",
		worktree: true,
		gate: "true",
		output: false,
	}], [{ model: "provider/parent:low" }], "/tmp/project");
	await compile(script)({
		all: async (items: Array<Record<string, unknown>>) => {
			captured = items[0];
			return [{ key: "delegate-fresh", output: "done" }];
		},
	});
	assert.equal(captured?.context, "fresh");
});

test("oracle calibration uses the same default fork context", async () => {
	let calibration: Record<string, unknown> | undefined;
	const script = buildWorkflow([{
		key: "oracle-check",
		agent: "oracle",
		duty: "oracle",
		task: "Challenge the current plan",
		risk: "medium",
		output: false,
	}], [{ model: "provider/parent:high" }], "/tmp/project", {
		calibration: { enabled: true, model: "provider/parent:high" },
	});
	await compile(script)({
		all: async () => [{ output: "oracle result" }],
		run: async (_key: string, item: Record<string, unknown>) => {
			calibration = item;
			return { output: "calibration result" };
		},
	});
	assert.equal(calibration?.context, "fork");
});
