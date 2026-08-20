import assert from "node:assert/strict";
import test from "node:test";
import { assertResolvedLaneContract } from "./launchPolicy.ts";

const builtinDelegate = {
	ok: true as const,
	contract: {
		agent: { name: "delegate", source: "builtin" },
		tools: {
			effectiveAllowlist: ["read", "grep", "find", "ls", "bash", "edit", "write", "contact_supervisor"],
			explicitAllowlist: true,
			fanoutAuthorized: false,
			effectiveMcpTools: [],
			toolExtensionPaths: [],
			configuredExtensions: [],
		},
	},
};

test("accepts the resolved builtin delegate strict contract", () => {
	assert.doesNotThrow(() => assertResolvedLaneContract("delegate", "delegate", builtinDelegate));
});

test("rejects project or user agents shadowing builtin names", () => {
	for (const source of ["project", "user", "package"] as const) {
		assert.throws(() => assertResolvedLaneContract("delegate", "delegate", {
			...builtinDelegate,
			contract: { ...builtinDelegate.contract, agent: { name: "delegate", source } },
		}), /must resolve to the bundled builtin/i);
	}
});

test("rejects delegate tool widening, configured extensions, and nested fanout", () => {
	assert.throws(() => assertResolvedLaneContract("delegate", "delegate", {
		...builtinDelegate,
		contract: {
			...builtinDelegate.contract,
			tools: { ...builtinDelegate.contract.tools, effectiveAllowlist: [...builtinDelegate.contract.tools.effectiveAllowlist, "subagent"], fanoutAuthorized: true },
		},
	}), /tool contract/i);
	assert.throws(() => assertResolvedLaneContract("delegate", "delegate", {
		...builtinDelegate,
		contract: {
			...builtinDelegate.contract,
			tools: { ...builtinDelegate.contract.tools, explicitAllowlist: false },
		},
	}), /tool contract/i);
	assert.throws(() => assertResolvedLaneContract("delegate", "delegate", {
		...builtinDelegate,
		contract: {
			...builtinDelegate.contract,
			tools: { ...builtinDelegate.contract.tools, configuredExtensions: ["evil-extension.ts"] },
		},
	}), /tool contract/i);
});

test("rejects failed preflight before spawn", () => {
	assert.throws(() => assertResolvedLaneContract("delegate", "delegate", {
		ok: false,
		code: "missing_agent",
		message: "Unknown agent",
	}), /preflight failed/i);
});
