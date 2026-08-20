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

const delegate = (overrides: Record<string, unknown> = {}) => ({
	key: "delegate-task",
	agent: "delegate",
	duty: "delegate",
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
	], false), /at most one (?:worker|writing lane)/i);
	assert.throws(() => validateLanes([worker()], true), /calibration.*read-only/i);
});

test("accepts one isolated delegate and rejects missing isolation", () => {
	assert.doesNotThrow(() => validateLanes([delegate()], false));
	assert.throws(() => validateLanes([delegate({ worktree: false })], false), /worktree:true/i);
	assert.throws(() => validateLanes([delegate({ gate: "  " })], false), /requires a gate/i);
});

test("worker and delegate share one writing-lane limit and cannot be calibrated", () => {
	assert.throws(() => validateLanes([worker(), delegate()], false), /at most one writing lane/i);
	assert.throws(() => validateLanes([
		delegate(),
		delegate({ key: "delegate-two", output: "two.md" }),
	], false), /at most one writing lane/i);
	assert.throws(() => validateLanes([delegate()], true), /calibration.*read-only/i);
});
