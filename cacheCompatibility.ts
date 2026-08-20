export function stripSubagentPromptCacheFields(payload: unknown, isSubagentChild: boolean): unknown {
	if (!isSubagentChild || payload === null || typeof payload !== "object" || Array.isArray(payload)) return payload;
	const record = payload as Record<string, unknown>;
	if (!("prompt_cache_key" in record) && !("prompt_cache_retention" in record)) return payload;
	const sanitized = { ...record };
	delete sanitized.prompt_cache_key;
	delete sanitized.prompt_cache_retention;
	return sanitized;
}
