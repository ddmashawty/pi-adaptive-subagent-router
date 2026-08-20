import { closeSync, openSync, readSync, statSync } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type UsageRoute = {
	key: string;
	model: string;
	strategy: string;
	risk: string;
	duty: string;
	qualityPolicy: string;
	eligibleLowerCost: number;
};

type JsonRecord = Record<string, unknown>;

let appendQueue = Promise.resolve();

function isRecord(value: unknown): value is JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

const MAX_RECOVERY_BYTES = 256 * 1024;

function usageLogPath(): string {
	const configDir = process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), ".pi", "agent");
	return path.join(configDir, "adaptive-subagent-router", "usage.jsonl");
}

export function launchedRun(value: unknown): { runId: string; asyncDir?: string } | undefined {
	if (!isRecord(value) || !isRecord(value.details)) return undefined;
	const runId = stringField(value.details.asyncId) ?? stringField(value.details.runId);
	return runId ? { runId, asyncDir: stringField(value.details.asyncDir) } : undefined;
}

export function appendUsageLog(record: JsonRecord): Promise<void> {
	const line = `${JSON.stringify({ schemaVersion: 1, recordedAt: new Date().toISOString(), ...record })}\n`;
	appendQueue = appendQueue
		.then(async () => {
			const file = usageLogPath();
			await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
			const handle = await open(file, "a", 0o600);
			try {
				await handle.write(line, undefined, "utf8");
				await handle.sync();
			} finally {
				await handle.close();
			}
		})
		.catch((error: unknown) => {
			console.error("adaptive-subagent-router: failed to append usage log", error);
		});
	return appendQueue;
}

export function pendingUsageRuns(): Map<string, string | undefined> {
	const pending = new Map<string, string | undefined>();
	try {
		const file = usageLogPath();
		const size = statSync(file).size;
		const start = Math.max(0, size - MAX_RECOVERY_BYTES);
		const buffer = Buffer.alloc(size - start);
		const descriptor = openSync(file, "r");
		try {
			readSync(descriptor, buffer, 0, buffer.length, start);
		} finally {
			closeSync(descriptor);
		}
		const text = buffer.toString("utf8");
		const completeLines = start === 0 ? text : text.slice(text.indexOf("\n") + 1);
		for (const line of completeLines.split("\n")) {
			try {
				const entry = JSON.parse(line) as JsonRecord;
				const runId = stringField(entry.runId);
				if (!runId) continue;
				if (entry.event === "launch") pending.set(runId, stringField(entry.asyncDir));
				if (entry.event === "completion") pending.delete(runId);
			} catch {
				// Ignore a partial trailing line or unrelated JSONL record.
			}
		}
	} catch {
		// No previous log is normal on first use; logging must never block routing.
	}
	return pending;
}

function effectFromStatus(status: unknown): JsonRecord {
	if (!isRecord(status)) return { observed: false };
	const tokens = isRecord(status.totalTokens) ? status.totalTokens : {};
	const cost = isRecord(status.totalCost) ? status.totalCost : {};
	return {
		observed: true,
		state: stringField(status.state),
		durationMs: numberField(status.endedAt) !== undefined && numberField(status.startedAt) !== undefined
			? numberField(status.endedAt)! - numberField(status.startedAt)!
			: undefined,
		tokens: {
			input: numberField(tokens.input),
			output: numberField(tokens.output),
			total: numberField(tokens.total),
		},
		costUsd: numberField(cost.costUsd),
	};
}

export async function appendCompletionLog(runId: string, asyncDir: string | undefined, event: unknown): Promise<void> {
	let effect: JsonRecord = { observed: false };
	if (asyncDir) {
		try {
			effect = effectFromStatus(JSON.parse(await readFile(path.join(asyncDir, "status.json"), "utf8")));
		} catch {
			effect = { observed: false };
		}
	}
	const payload = isRecord(event) ? event : {};
	await appendUsageLog({
		event: "completion",
		runId,
		outcome: {
			state: stringField(payload.state),
			success: typeof payload.success === "boolean" ? payload.success : undefined,
			durationMs: numberField(payload.durationMs),
			timedOut: payload.timedOut === true,
			stopped: payload.stopped === true,
		},
		effect,
	});
}
