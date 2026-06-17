import { afterEach, describe, expect, it, vi } from 'vitest'
import { telemetryTest, withRouteTelemetry } from '~/utils/telemetry'
import { addApiRoutePhase } from '../phaseTelemetry'
import { cachedJsonResult, cachedResult } from '../resultCache'

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
	telemetryTest.reset()
})

function telemetryEvents(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls
		.filter(([url]) => url === process.env.OPS_TELEMETRY_URL)
		.flatMap(([, init]) => JSON.parse(String((init as RequestInit).body)).events)
}

describe('cachedResult', () => {
	it('evicts the least recently used entry when the namespace reaches capacity', async () => {
		const namespace = 'result-cache-lru-test'
		const compute = vi.fn(async (key: string) => key)
		const options = { ttlMs: 60_000, maxEntries: 2 }

		await cachedResult(namespace, 'a', options, () => compute('a'))
		await cachedResult(namespace, 'b', options, () => compute('b'))
		await cachedResult(namespace, 'a', options, () => compute('a'))
		await cachedResult(namespace, 'c', options, () => compute('c'))
		await cachedResult(namespace, 'a', options, () => compute('a'))
		await cachedResult(namespace, 'b', options, () => compute('b'))

		expect(compute.mock.calls.map(([key]) => key)).toEqual(['a', 'b', 'c', 'b'])
	})

	it('serves stale entries while one background refresh recomputes', async () => {
		vi.useFakeTimers()
		const namespace = 'result-cache-stale-test'
		const compute = vi.fn(async () => `value-${compute.mock.calls.length}`)
		const options = { ttlMs: 100, staleWhileRevalidateMs: 1_000 }

		await expect(cachedResult(namespace, 'a', options, compute)).resolves.toBe('value-1')
		vi.advanceTimersByTime(150)

		await expect(cachedResult(namespace, 'a', options, compute)).resolves.toBe('value-1')
		expect(compute).toHaveBeenCalledTimes(2)

		await vi.runAllTimersAsync()
		await Promise.resolve()

		await expect(cachedResult(namespace, 'a', options, compute)).resolves.toBe('value-2')
		expect(compute).toHaveBeenCalledTimes(2)
	})

	it('keeps stale entries available when another key writes to the namespace', async () => {
		vi.useFakeTimers()
		const namespace = 'result-cache-stale-retention-test'
		const options = { ttlMs: 100, staleWhileRevalidateMs: 1_000 }
		const computeA = vi.fn(async () => `a-${computeA.mock.calls.length}`)
		const computeB = vi.fn(async () => 'b')

		await expect(cachedResult(namespace, 'a', options, computeA)).resolves.toBe('a-1')
		vi.advanceTimersByTime(150)
		await expect(cachedResult(namespace, 'b', options, computeB)).resolves.toBe('b')

		await expect(cachedResult(namespace, 'a', options, computeA)).resolves.toBe('a-1')
		await Promise.resolve()

		expect(computeA).toHaveBeenCalledTimes(2)
	})

	it('caches serialized JSON payloads without recomputing the body', async () => {
		const namespace = 'result-cache-json-test'
		const compute = vi.fn(async () => ({ ok: true }))
		const options = { ttlMs: 60_000 }

		const first = await cachedJsonResult(namespace, 'a', options, compute)
		const second = await cachedJsonResult(namespace, 'a', options, compute)

		expect(first).toEqual({
			serializedJson: '{"ok":true}',
			responseBytes: 11
		})
		expect(second).toEqual(first)
		expect(compute).toHaveBeenCalledTimes(1)
	})

	it('records background stale refresh failures with route phase attributes', async () => {
		vi.stubEnv('OPS_TELEMETRY_URL', 'test-ingest-url')
		vi.stubEnv('OPS_TELEMETRY_TOKEN', 'secret')
		vi.stubEnv('OPS_TELEMETRY_BATCH_SIZE', '1')
		vi.stubEnv('OPS_TELEMETRY_QUEUE_MAX', '100')
		vi.stubEnv('OPS_TELEMETRY_SEND_TIMEOUT_MS', '100')
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }))
		vi.stubGlobal('fetch', fetchMock)

		const namespace = 'result-cache-stale-refresh-error-test'
		const error = new Error('refresh failed')
		const compute = vi
			.fn()
			.mockResolvedValueOnce('warm')
			.mockImplementationOnce(async () => {
				addApiRoutePhase('background_refresh_phase', 42)
				throw error
			})

		await withRouteTelemetry(
			{ route: 'cache-route', operationType: 'apiRoute', runtime: 'node', flushTimeoutMs: 1 },
			() => cachedResult(namespace, 'a', { ttlMs: 1, staleWhileRevalidateMs: 1_000 }, compute)
		)
		await new Promise((resolve) => setTimeout(resolve, 2))

		const stale = await withRouteTelemetry(
			{ route: 'cache-route', operationType: 'apiRoute', runtime: 'node', flushTimeoutMs: 1 },
			() => cachedResult(namespace, 'a', { ttlMs: 1, staleWhileRevalidateMs: 1_000 }, compute)
		)

		expect(stale).toBe('warm')
		await vi.waitFor(() => {
			const events = telemetryEvents(fetchMock)
			expect(
				events.some(
					(event) =>
						event.type === 'runtime_error' &&
						event.route === 'cache-route' &&
						event.attributes?.result_cache_refresh === 'background' &&
						event.attributes?.route_phases_ms?.background_refresh_phase === 42
				)
			).toBe(true)
			expect(
				events.some(
					(event) =>
						event.type === 'route_execution' &&
						event.route === 'cache-route' &&
						event.status === 'error' &&
						event.attributes?.result_cache_status === 'refresh'
				)
			).toBe(true)
		})
	})
})
