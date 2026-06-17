export function resultBody(result: { body?: unknown; serializedJson?: string }) {
	return result.serializedJson ? JSON.parse(result.serializedJson) : result.body
}
