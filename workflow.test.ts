import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAuthorityGate, buildWorkflow } from "./workflow.ts";

const lane = {
	key: "lane-a",
	agent: "scout",
	task: "Inspect routing",
	role: "read",
	risk: "low",
	wave: 99,
	cwd: "/tmp/project",
	output: false,
};
const route = { model: "provider/model:low" };

function compile(script: string) {
	return new Function("runs", `return (async () => { ${script} })();`) as (runs: unknown) => Promise<unknown>;
}

test("generated workflows use safe sequential identifiers and compile", () => {
	const script = buildWorkflow([{ ...lane, wave: 1e21 }], [route], "/tmp/project");
	assert.doesNotMatch(script, /wave1e\+21/);
	assert.doesNotThrow(() => compile(script));
});

test("quality contract carries risk and writer authority", () => {
	const script = buildWorkflow([
		{ ...lane, role: "write", authority: ["src/router", "tests/router"] },
	], [route], "/tmp/project");
	assert.match(script, /Risk: low/);
	assert.match(script, /src\/router, tests\/router/);
});

test("writer authority gate rejects files outside declared prefixes", () => {
	const cwd = mkdtempSync(path.join(os.tmpdir(), "adaptive-router-authority-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd });
		execFileSync("git", ["config", "user.email", "router@example.invalid"], { cwd });
		execFileSync("git", ["config", "user.name", "Router Test"], { cwd });
		writeFileSync(path.join(cwd, "README.md"), "base\n");
		execFileSync("git", ["add", "."], { cwd });
		execFileSync("git", ["commit", "-qm", "base"], { cwd });
		mkdirSync(path.join(cwd, "src"));
		writeFileSync(path.join(cwd, "src", "allowed.ts"), "ok\n");
		assert.doesNotThrow(() => execSync(buildAuthorityGate(["src"]), { cwd, stdio: "pipe" }));
		writeFileSync(path.join(cwd, "outside.ts"), "bad\n");
		assert.throws(() => execSync(buildAuthorityGate(["src"]), { cwd, stdio: "pipe" }));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("structured JSON low confidence triggers parent-runtime escalation", async () => {
	const calls: string[] = [];
	const script = buildWorkflow([lane], [route], "/tmp/project", {
		escalation: { enabled: true, model: "provider/parent:medium" },
	});
	const result = await compile(script)({
		all: async () => [{ output: '{"confidence":"low","needsEscalation":true}' }],
		run: async (key: string, config: { model: string; task: string }) => {
			calls.push(`${key}:${config.model}`);
			assert.match(config.task, /low-confidence/);
			return { output: "escalation complete" };
		},
	});
	assert.deepEqual(calls, ["adaptive-escalation:provider/parent:medium"]);
	assert.deepEqual(result, ['{"confidence":"low","needsEscalation":true}', "escalation complete"]);
});

test("calibration repeats the first read lane on the parent runtime", async () => {
	const calls: string[] = [];
	const script = buildWorkflow([lane], [route], "/tmp/project", {
		calibration: { enabled: true, model: "provider/parent:medium" },
	});
	const result = await compile(script)({
		all: async () => [{ output: "economy answer" }],
		run: async (key: string, config: { model: string }) => {
			calls.push(`${key}:${config.model}`);
			return { output: "parent answer" };
		},
	});
	assert.deepEqual(calls, ["adaptive-calibration:provider/parent:medium"]);
	assert.deepEqual(result, ["economy answer", "parent answer"]);
});
