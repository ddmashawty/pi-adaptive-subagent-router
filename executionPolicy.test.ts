import assert from "node:assert/strict";
import test from "node:test";
import { subagentExecutionBlockReason } from "./executionPolicy.ts";

test("blocks ordinary direct subagent execution", () => {
	assert.match(subagentExecutionBlockReason({ agent: "delegate", task: "write" }) ?? "", /adaptive routing/i);
	assert.match(subagentExecutionBlockReason({ workflowScript: "return runs.run('x', { agent: 'delegate' })" }) ?? "", /adaptive routing/i);
});

test("blocks execution-capable management actions after the same trimming used by pi-subagents", () => {
	for (const action of ["schedule.create", "schedule.resume", "schedule.run", "schedule.run-due", "resume", "refine"]) {
		assert.match(subagentExecutionBlockReason({ action }) ?? "", /adaptive routing/i, action);
		assert.match(subagentExecutionBlockReason({ action: `  ${action}  ` }) ?? "", /adaptive routing/i, `padded ${action}`);
	}
});

test("blocks any action carrying a workflowScript", () => {
	assert.match(subagentExecutionBlockReason({ action: "schedule.create", workflowScript: "return runs.run('x', { agent: 'delegate' })" }) ?? "", /adaptive routing/i);
});

test("fails closed for unknown or pane-starting management actions", () => {
	assert.match(subagentExecutionBlockReason({ action: "future.execute" }) ?? "", /adaptive routing/i);
	assert.match(subagentExecutionBlockReason({ action: "project.open" }) ?? "", /adaptive routing/i);
});

test("blocks steer unless pause-and-resume recovery is explicitly disabled", () => {
	assert.match(subagentExecutionBlockReason({ action: "steer" }) ?? "", /adaptive routing/i);
	assert.match(subagentExecutionBlockReason({ action: " steer ", steeringRecovery: true }) ?? "", /adaptive routing/i);
	assert.equal(subagentExecutionBlockReason({ action: "steer", steeringRecovery: false }), undefined);
});

test("allows observation and non-executing control actions", () => {
	for (const action of ["list", "status", "debug.run", "interrupt", "stop", "schedule.list", "schedule.show", "schedule.history", "schedule.pause", "schedule.delete"]) {
		assert.equal(subagentExecutionBlockReason({ action }), undefined, action);
	}
	assert.equal(subagentExecutionBlockReason({ action: "get", agent: "delegate" }), undefined);
});
