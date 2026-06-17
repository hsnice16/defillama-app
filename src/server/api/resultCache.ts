import {
	addRouteTelemetryAttributes,
	currentTelemetryContext,
	recordRuntimeError,
	type TelemetryAttributes,
	withRouteTelemetry
} from '~/utils/telemetry'

const DEFAULT_MAX_ENTRIES = 256

type CacheEntry<T> = {
	value: T
	expiresAt: number
	staleUntil: number
}

type Store<T> = {
	entries: Map<string, CacheEntry<T>>
	inFlight: Map<string, Promise<T>>
}

const stores = new Map<string, Store<unknown>>()

function getStore<T>(namespace: string): Store<T> {
	let store = stores.get(namespace)
	if (!store) {
		store = { entries: new Map(), inFlight: new Map() }
		stores.set(namespace, store)
	}
	return store as Store<T>
}

function evictIfNeeded<T>(store: Store<T>, maxEntries: number) {
	const now = Date.now()
	for (const [key, entry] of store.entries) {
		if (entry.staleUntil <= now) store.entries.delete(key)
	}
	while (store.entries.size > maxEntries) {
		// Map iterates in insertion order; reads refresh entries, so this evicts
		// the least recently used key.
		const oldest = store.entries.keys().next().value
		if (oldest === undefined) break
		store.entries.delete(oldest)
	}
}

export type CachedResultOptions = {
	ttlMs: number
	/** Spread expiries so identical deploys don't recompute every key at once. Fraction of ttlMs, e.g. 0.2. */
	ttlJitter?: number
	/** Serve an expired value while one request refreshes it in the background. */
	staleWhileRevalidateMs?: number
	maxEntries?: number
}

type CacheStatus = 'hit' | 'miss' | 'inflight_wait' | 'stale'

export type CachedJsonPayload = {
	serializedJson: string
	responseBytes: number
}

function hashCacheKey(key: string): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < key.length; i++) {
		hash ^= key.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(36)
}

function recordCacheTelemetry<T>(
	namespace: string,
	key: string,
	store: Store<T>,
	status: CacheStatus,
	startedAt: number,
	extra: { computeMs?: number; waitMs?: number } = {}
) {
	if (!currentTelemetryContext()) return

	addRouteTelemetryAttributes({
		result_cache_namespace: namespace,
		result_cache_status: status,
		result_cache_key_hash: hashCacheKey(key),
		result_cache_elapsed_ms: Math.max(0, Date.now() - startedAt),
		result_cache_entries: store.entries.size,
		result_cache_inflight: store.inFlight.size,
		...(extra.computeMs !== undefined ? { result_cache_compute_ms: extra.computeMs } : null),
		...(extra.waitMs !== undefined ? { result_cache_wait_ms: extra.waitMs } : null)
	})
}

function ttlWithJitter(options: CachedResultOptions): number {
	const jitterFraction = options.ttlJitter ?? 0
	const jitter = jitterFraction > 0 ? (Math.random() * 2 - 1) * jitterFraction * options.ttlMs : 0
	return Math.max(1, options.ttlMs + jitter)
}

function setCacheEntry<T>(store: Store<T>, key: string, value: T, options: CachedResultOptions) {
	const ttlMs = ttlWithJitter(options)
	store.entries.set(key, {
		value,
		expiresAt: Date.now() + ttlMs,
		staleUntil: Date.now() + ttlMs + (options.staleWhileRevalidateMs ?? 0)
	})
	evictIfNeeded(store, options.maxEntries ?? DEFAULT_MAX_ENTRIES)
}

function refreshAttributes(namespace: string, key: string): TelemetryAttributes {
	return {
		result_cache_namespace: namespace,
		result_cache_status: 'refresh',
		result_cache_refresh: 'background',
		result_cache_key_hash: hashCacheKey(key)
	}
}

function refreshInBackground<T>(
	namespace: string,
	store: Store<T>,
	key: string,
	options: CachedResultOptions,
	compute: () => Promise<T>
) {
	if (store.inFlight.has(key)) return

	const parentContext = currentTelemetryContext()
	const attributes = refreshAttributes(namespace, key)
	const runRefresh = async () => {
		const value = await compute()
		setCacheEntry(store, key, value, options)
		return value
	}
	const promise = (
		parentContext
			? withRouteTelemetry(
					{
						route: parentContext.route,
						operationType: parentContext.operationType,
						runtime: 'node',
						attributes: {
							...attributes,
							result_cache_parent_trace_id: parentContext.traceId
						},
						getResultAttributes: (_value, durationMs) => ({
							result_cache_compute_ms: durationMs,
							result_cache_entries: store.entries.size,
							result_cache_inflight: store.inFlight.size
						})
					},
					runRefresh
				)
			: Promise.resolve()
					.then(runRefresh)
					.catch((error) => {
						recordRuntimeError(error, 'apiRoute', attributes)
						throw error
					})
	).finally(() => {
		store.inFlight.delete(key)
	})

	store.inFlight.set(key, promise)
	void promise.catch(() => undefined)
}

/**
 * Memoize an expensive server-side computation by key, coalescing concurrent
 * callers onto a single in-flight promise. Failed computations are never
 * cached. Intended for anonymous, param-bounded results (protocol splits,
 * chart breakdowns) whose recomputation blocks the event loop for seconds.
 */
export async function cachedResult<T>(
	namespace: string,
	key: string,
	options: CachedResultOptions,
	compute: () => Promise<T>
): Promise<T> {
	const startedAt = Date.now()
	const store = getStore<T>(namespace)
	const now = Date.now()

	const cached = store.entries.get(key)
	if (cached && cached.expiresAt > now) {
		store.entries.delete(key)
		store.entries.set(key, cached)
		recordCacheTelemetry(namespace, key, store, 'hit', startedAt)
		return cached.value
	}
	if (cached && cached.staleUntil > now && options.staleWhileRevalidateMs && options.staleWhileRevalidateMs > 0) {
		store.entries.delete(key)
		store.entries.set(key, cached)
		refreshInBackground(namespace, store, key, options, compute)
		recordCacheTelemetry(namespace, key, store, 'stale', startedAt)
		return cached.value
	}
	if (cached) {
		store.entries.delete(key)
	}

	const inFlight = store.inFlight.get(key)
	if (inFlight) {
		const waitStartedAt = Date.now()
		try {
			return await inFlight
		} finally {
			recordCacheTelemetry(namespace, key, store, 'inflight_wait', startedAt, {
				waitMs: Math.max(0, Date.now() - waitStartedAt)
			})
		}
	}

	const computeStartedAt = Date.now()
	const promise = Promise.resolve()
		.then(compute)
		.then((value) => {
			setCacheEntry(store, key, value, options)
			return value
		})
		.finally(() => {
			store.inFlight.delete(key)
		})

	store.inFlight.set(key, promise)
	try {
		return await promise
	} finally {
		recordCacheTelemetry(namespace, key, store, 'miss', startedAt, {
			computeMs: Math.max(0, Date.now() - computeStartedAt)
		})
	}
}

export async function cachedJsonResult<T>(
	namespace: string,
	key: string,
	options: CachedResultOptions,
	compute: () => Promise<T>
): Promise<CachedJsonPayload> {
	const payload = await cachedResult(namespace, key, options, async () => {
		const value = await compute()
		const serializeStartedAt = Date.now()
		const serializedJson = JSON.stringify(value) ?? 'null'
		const serializeMs = Math.max(0, Date.now() - serializeStartedAt)
		const responseBytes = Buffer.byteLength(serializedJson)
		addRouteTelemetryAttributes({
			api_json_serialize_ms: serializeMs
		})
		return { serializedJson, responseBytes }
	})

	addRouteTelemetryAttributes({
		api_json_response_mode: 'serialized',
		response_bytes: payload.responseBytes
	})

	return payload
}
