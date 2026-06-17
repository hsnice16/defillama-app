import { addRouteTelemetryPhase } from '~/utils/telemetry'

export function addApiRoutePhase(label: string, durationMs: number) {
	addRouteTelemetryPhase(label, durationMs)
}

export async function timeApiRoutePhase<T>(label: string, run: () => T | Promise<T>): Promise<Awaited<T>> {
	const startedAt = Date.now()
	try {
		return await run()
	} finally {
		addApiRoutePhase(label, Date.now() - startedAt)
	}
}
