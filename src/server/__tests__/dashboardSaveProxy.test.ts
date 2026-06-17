import type { NextApiRequest } from 'next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dashboardDeleteHandler } from '~/containers/ProDashboard/server/deleteRoute'
import { dashboardSaveHandler } from '~/containers/ProDashboard/server/saveRoute'
import { createMockNextApiResponse } from '~/utils/test/nextApiMocks'

function request(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
	return {
		body: {},
		headers: { authorization: 'Bearer user-token' },
		method: 'POST',
		query: {},
		...overrides
	} as NextApiRequest
}

function dashboardResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status })
}

function lastCall(fetchImpl: ReturnType<typeof vi.fn>) {
	return fetchImpl.mock.calls[fetchImpl.mock.calls.length - 1]
}

function isCloudflarePurge(call: unknown[]): boolean {
	return typeof call?.[0] === 'string' && (call[0] as string).includes('api.cloudflare.com')
}

describe('/api/private/pro-dashboard/save', () => {
	beforeEach(() => {
		vi.stubEnv('CF_ZONE', 'zone')
		vi.stubEnv('CF_PURGE_CACHE_AUTH', 'cf-token')
		vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://defillama.test')
	})

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
	})

	it('rejects non-POST methods without touching the backend', async () => {
		const fetchImpl = vi.fn()
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardSaveHandler(request({ method: 'GET' }), res)

		expect(res.status).toHaveBeenCalledWith(405)
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it('creates a public dashboard and purges its urls', async () => {
		const body = { data: { dashboardName: 'My Dash' }, visibility: 'public' }
		const saved = { id: 'new-1', slug: 'my-dash', visibility: 'public' }
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(dashboardResponse(saved))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardSaveHandler(request({ body }), res)

		expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe('/dashboards')
		expect(fetchImpl.mock.calls[0][1]).toEqual({
			method: 'POST',
			headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
		expect(fetchImpl).toHaveBeenLastCalledWith('https://api.cloudflare.com/client/v4/zones/zone/purge_cache', {
			body: JSON.stringify({
				files: [
					'https://defillama.test/pro/new-1',
					'https://defillama.test/api/dynamic/pro-dashboard/new-1/stream',
					'https://defillama.test/pro/my-dash',
					'https://defillama.test/api/dynamic/pro-dashboard/my-dash/stream'
				]
			}),
			headers: { Authorization: 'Bearer cf-token', 'Content-Type': 'application/json' },
			method: 'POST'
		})
		expect(res.status).toHaveBeenCalledWith(200)
		expect(res.json).toHaveBeenCalledWith(saved)
	})

	it('creates a private dashboard without purging', async () => {
		const saved = { id: 'new-2', slug: 'secret', visibility: 'private' }
		const fetchImpl = vi.fn().mockResolvedValueOnce(dashboardResponse(saved))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardSaveHandler(request({ body: { visibility: 'private' } }), res)

		expect(fetchImpl).toHaveBeenCalledTimes(1)
		expect(isCloudflarePurge(lastCall(fetchImpl))).toBe(false)
		expect(res.json).toHaveBeenCalledWith(saved)
	})

	it('reads the previous state then purges old and new slugs on a public rename', async () => {
		const before = { id: 'd1', slug: 'old-name', visibility: 'public' }
		const saved = { id: 'd1', slug: 'new-name', visibility: 'public' }
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(dashboardResponse(before))
			.mockResolvedValueOnce(dashboardResponse(saved))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardSaveHandler(request({ query: { id: 'd1' }, body: { visibility: 'public' } }), res)

		expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe('/dashboards/d1')
		expect(fetchImpl.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer user-token' } })
		expect(new URL(fetchImpl.mock.calls[1][0]).pathname).toBe('/dashboards/d1')
		expect(fetchImpl.mock.calls[1][1].method).toBe('POST')
		expect(JSON.parse(lastCall(fetchImpl)[1].body).files).toEqual([
			'https://defillama.test/pro/d1',
			'https://defillama.test/api/dynamic/pro-dashboard/d1/stream',
			'https://defillama.test/pro/new-name',
			'https://defillama.test/api/dynamic/pro-dashboard/new-name/stream',
			'https://defillama.test/pro/old-name',
			'https://defillama.test/api/dynamic/pro-dashboard/old-name/stream'
		])
		expect(res.json).toHaveBeenCalledWith(saved)
	})

	it('purges when a public dashboard is made private', async () => {
		const before = { id: 'd2', slug: 'going-private', visibility: 'public' }
		const saved = { id: 'd2', slug: 'going-private', visibility: 'private' }
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(dashboardResponse(before))
			.mockResolvedValueOnce(dashboardResponse(saved))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardSaveHandler(request({ query: { id: 'd2' }, body: { visibility: 'private' } }), res)

		expect(isCloudflarePurge(lastCall(fetchImpl))).toBe(true)
		expect(res.json).toHaveBeenCalledWith(saved)
	})

	it('does not purge when a private dashboard stays private', async () => {
		const before = { id: 'd3', slug: 'private-dash', visibility: 'private' }
		const saved = { id: 'd3', slug: 'private-dash', visibility: 'private' }
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(dashboardResponse(before))
			.mockResolvedValueOnce(dashboardResponse(saved))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardSaveHandler(request({ query: { id: 'd3' }, body: { visibility: 'private' } }), res)

		expect(fetchImpl).toHaveBeenCalledTimes(2)
		expect(isCloudflarePurge(lastCall(fetchImpl))).toBe(false)
	})

	it('passes backend save failures through without purging', async () => {
		const fetchImpl = vi.fn().mockResolvedValueOnce(dashboardResponse({ message: 'Forbidden' }, 403))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardSaveHandler(request({ body: { visibility: 'public' } }), res)

		expect(fetchImpl).toHaveBeenCalledTimes(1)
		expect(res.status).toHaveBeenCalledWith(403)
		expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' })
	})
})

describe('/api/private/pro-dashboard/delete', () => {
	beforeEach(() => {
		vi.stubEnv('CF_ZONE', 'zone')
		vi.stubEnv('CF_PURGE_CACHE_AUTH', 'cf-token')
		vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://defillama.test')
	})

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
	})

	it('requires a dashboard id', async () => {
		const fetchImpl = vi.fn()
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardDeleteHandler(request({ query: {} }), res)

		expect(res.status).toHaveBeenCalledWith(400)
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it('deletes a public dashboard and purges its urls', async () => {
		const before = { id: 'd9', slug: 'public-dash', visibility: 'public' }
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(dashboardResponse(before))
			.mockResolvedValueOnce(dashboardResponse({ message: 'Dashboard deleted' }))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardDeleteHandler(request({ query: { id: 'd9' } }), res)

		expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe('/dashboards/d9')
		expect(new URL(fetchImpl.mock.calls[1][0]).pathname).toBe('/dashboards/delete/d9')
		expect(JSON.parse(lastCall(fetchImpl)[1].body).files).toEqual([
			'https://defillama.test/pro/d9',
			'https://defillama.test/api/dynamic/pro-dashboard/d9/stream',
			'https://defillama.test/pro/public-dash',
			'https://defillama.test/api/dynamic/pro-dashboard/public-dash/stream'
		])
		expect(res.status).toHaveBeenCalledWith(200)
		expect(res.json).toHaveBeenCalledWith({ message: 'Dashboard deleted' })
	})

	it('deletes a private dashboard without purging', async () => {
		const before = { id: 'd10', slug: 'private-dash', visibility: 'private' }
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(dashboardResponse(before))
			.mockResolvedValueOnce(dashboardResponse({ message: 'Dashboard deleted' }))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardDeleteHandler(request({ query: { id: 'd10' } }), res)

		expect(fetchImpl).toHaveBeenCalledTimes(2)
		expect(isCloudflarePurge(lastCall(fetchImpl))).toBe(false)
		expect(res.json).toHaveBeenCalledWith({ message: 'Dashboard deleted' })
	})

	it('passes backend delete failures through without purging', async () => {
		const before = { id: 'd11', slug: 'public-dash', visibility: 'public' }
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(dashboardResponse(before))
			.mockResolvedValueOnce(dashboardResponse({ message: 'Forbidden' }, 403))
		vi.stubGlobal('fetch', fetchImpl)
		const res = createMockNextApiResponse()

		await dashboardDeleteHandler(request({ query: { id: 'd11' } }), res)

		expect(fetchImpl).toHaveBeenCalledTimes(2)
		expect(res.status).toHaveBeenCalledWith(403)
		expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' })
	})
})
