import type { NextApiRequest, NextApiResponse } from 'next'
import { describe, expect, it, vi } from 'vitest'
import { toNextHandler } from '../nextAdapter'

function createResponse() {
	const headers = new Map<string, number | string | string[]>()
	let res!: NextApiResponse & { body?: unknown }
	res = {
		statusCode: 200,
		setHeader: vi.fn((name: string, value: number | string | string[]) => {
			headers.set(name.toLowerCase(), value)
			return res
		}),
		hasHeader: vi.fn((name: string) => headers.has(name.toLowerCase())),
		status: vi.fn((status: number) => {
			res.statusCode = status
			return res
		}),
		send: vi.fn((body: unknown) => {
			res.body = body
			return res
		}),
		json: vi.fn((body: unknown) => {
			res.body = body
			return res
		}),
		write: vi.fn(() => true),
		end: vi.fn(() => res)
	} as unknown as NextApiResponse & { body?: unknown }

	return { headers, res }
}

const request = {
	method: 'GET',
	url: '/api/test',
	query: {},
	headers: {}
} as NextApiRequest

describe('toNextHandler', () => {
	it('sets a JSON content type for serialized JSON responses', async () => {
		const { headers, res } = createResponse()
		const handler = toNextHandler({
			route: '/api/test',
			handle: async () => ({
				status: 200,
				serializedJson: '{"ok":true}',
				responseBytes: 11
			})
		})

		await handler(request, res)

		expect(headers.get('content-type')).toBe('application/json; charset=utf-8')
		expect(res.send).toHaveBeenCalledWith('{"ok":true}')
	})

	it('keeps an explicit content type on serialized JSON responses', async () => {
		const { headers, res } = createResponse()
		const handler = toNextHandler({
			route: '/api/test',
			handle: async () => ({
				status: 200,
				serializedJson: '{"ok":true}',
				responseBytes: 11,
				headers: { 'Content-Type': 'application/vnd.test+json' }
			})
		})

		await handler(request, res)

		expect(headers.get('content-type')).toBe('application/vnd.test+json')
		expect(res.send).toHaveBeenCalledWith('{"ok":true}')
	})
})
