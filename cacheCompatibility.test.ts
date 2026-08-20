import assert from "node:assert/strict";
import test from "node:test";
import { stripSubagentPromptCacheFields } from "./cacheCompatibility.ts";

test("strips optional prompt-cache fields only for subagent children", () => {
	const payload = {
		model: "model",
		prompt_cache_key: "session",
		prompt_cache_retention: "24h",
		input: [{ role: "user", content: "hello" }],
	};
	const sanitized = stripSubagentPromptCacheFields(payload, true);
	assert.deepEqual(sanitized, {
		model: "model",
		input: [{ role: "user", content: "hello" }],
	});
	assert.deepEqual(payload, {
		model: "model",
		prompt_cache_key: "session",
		prompt_cache_retention: "24h",
		input: [{ role: "user", content: "hello" }],
	});
});

test("leaves parent payloads and payloads without cache fields unchanged", () => {
	const parentPayload = { prompt_cache_key: "parent" };
	assert.equal(stripSubagentPromptCacheFields(parentPayload, false), parentPayload);

	const ordinaryPayload = { model: "model", input: [] };
	assert.equal(stripSubagentPromptCacheFields(ordinaryPayload, true), ordinaryPayload);
	assert.equal(stripSubagentPromptCacheFields(null, true), null);
	const arrayPayload = ["not-a-payload"];
	assert.equal(stripSubagentPromptCacheFields(arrayPayload, true), arrayPayload);
});
