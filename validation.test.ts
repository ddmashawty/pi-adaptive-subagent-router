import assert from "node:assert/strict";
import test from "node:test";
import { validateLanes } from "./validation.ts";

const worker = (overrides: Record<string, unknown> = {}) => ({
	key: "worker-impl",
	agent: "worker",
	duty: "worker",
	worktree: true,
	gate: "npm test",
	output: false,
	...overrides,
});

test("accepts one managed-worktree worker with a gate", () => {
	assert.doesNotThrow(() => validateLanes([worker()], false));
});

test("rejects worker without managed worktree or gate", () => {
	assert.throws(() => validateLanes([worker({ worktree: false })], false), /worktree:true/i);
	assert.throws(() => validateLanes([worker({ gate: undefined })], false), /requires a gate/i);
});

test("rejects multiple workers and worker calibration", () => {
	assert.throws(() => validateLanes([
		worker(),
		worker({ key: "worker-two", output: "two.md" }),
	], false), /at most one worker/i);
	assert.throws(() => validateLanes([worker()], true), /calibration.*read-only/i);
});
