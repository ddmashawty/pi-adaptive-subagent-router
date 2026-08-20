import type { LaneDuty } from "./routing.ts";

type PreflightContract = {
	agent: { name: string; source: string };
	tools: {
		effectiveAllowlist: string[];
		explicitAllowlist: boolean;
		fanoutAuthorized: boolean;
		effectiveMcpTools: string[];
		toolExtensionPaths: string[];
		configuredExtensions: string[];
	};
};

export type PreflightResult =
	| { ok: true; contract: PreflightContract }
	| { ok: false; code: string; message: string };

const DELEGATE_TOOLS = new Set(["read", "grep", "find", "ls", "bash", "edit", "write", "contact_supervisor"]);

export function assertResolvedLaneContract(duty: LaneDuty, requestedAgent: string, result: PreflightResult): void {
	if (!result.ok) throw new Error(`Adaptive launch preflight failed for agent "${requestedAgent}": ${result.message}`);
	const { agent, tools } = result.contract;
	if (agent.source !== "builtin") {
		throw new Error(`Adaptive agent "${requestedAgent}" must resolve to the bundled builtin; resolved source was "${agent.source}".`);
	}
	if (duty !== "delegate") return;
	const widenedTools = tools.effectiveAllowlist.filter((tool) => !DELEGATE_TOOLS.has(tool));
	if (
		!tools.explicitAllowlist
		|| tools.fanoutAuthorized
		|| widenedTools.length > 0
		|| tools.effectiveMcpTools.length > 0
		|| tools.toolExtensionPaths.length > 0
		|| tools.configuredExtensions.length > 0
	) {
		throw new Error(`Delegate tool contract is not the bundled strict non-fanout allowlist for agent "${requestedAgent}".`);
	}
}
