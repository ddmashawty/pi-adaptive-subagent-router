import assert from "node:assert/strict";
import test from "node:test";
import { validateLaneIsolation, type ValidationLane } from "./validation.ts";

const reader: ValidationLane = { key: "reader", role: "read", output: false };
const writer = (key: string, authority?: string[], worktree = false): ValidationLane => ({
	key,
	role: "write",
	authority,
	worktree,
	output: false,
});

test("accepts one bounded writer and disjoint isolated writers", () => {
	assert.doesNotThrow(() => validateLaneIsolation([writer("one", ["src/one"])], "/project", false));
	assert.doesNotThrow(() => validateLaneIsolation([
		writer("one", ["src/one"], true),
		writer("two", ["src/two"], true),
	], "/project", false));
});

test("rejects missing, escaping, absolute, or overlapping writer authority", () => {
	assert.throws(() => validateLaneIsolation([writer("one")], "/project", false), /requires at least one authority/);
	assert.throws(() => validateLaneIsolation([writer("one", ["../outside"])], "/project", false), /must stay relative/);
	assert.throws(() => validateLaneIsolation([writer("one", ["/absolute"])], "/project", false), /must stay relative/);
	assert.throws(() => validateLaneIsolation([
		writer("one", ["src"], true),
		writer("two", ["src/nested"], true),
	], "/project", false), /authority overlaps/);
});

test("rejects unsafe concurrency, duplicate identity/output, and writer calibration", () => {
	assert.throws(() => validateLaneIsolation([
		writer("one", ["src/one"]),
		writer("two", ["src/two"]),
	], "/project", false), /worktree:true/);
	assert.throws(() => validateLaneIsolation([reader, { ...reader }], "/project", false), /lane key must be unique/i);
	assert.throws(() => validateLaneIsolation([
		{ ...reader, key: "a", output: "same.md" },
		{ ...reader, key: "b", output: "same.md" },
	], "/project", false), /output path must be unique/i);
	assert.throws(() => validateLaneIsolation([writer("one", ["src/one"])], "/project", true), /read-only/);
});

test("rejects reserved internal lane keys", () => {
	for (const key of ["adaptive-escalation", "adaptive-calibration"]) {
		assert.throws(() => validateLaneIsolation([{ ...reader, key }], "/project", false), /reserved/);
	}
});
