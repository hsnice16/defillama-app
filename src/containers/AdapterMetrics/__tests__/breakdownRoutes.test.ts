import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resultBody } from '~/server/api/__tests__/resultBody'

const mocks = vi.hoisted(() => ({
	fetchWithPoolingOnServer: vi.fn(),
	fetchProtocols: vi.fn()
}))

vi.mock('~/utils/http-client', () => ({
	fetchWithPoolingOnServer: mocks.fetchWithPoolingOnServer
}))

vi.mock('~/containers/ProtocolLists/api', () => ({
	fetchProtocols: mocks.fetchProtocols
}))

function jsonResponse(value: unknown) {
	return new Response(JSON.stringify(value), { status: 200 })
}

beforeEach(() => {
	vi.clearAllMocks()
	mocks.fetchProtocols.mockResolvedValue({ protocols: [] })
})

describe('AdapterMetrics breakdown routes', () => {
	it('filters protocol-specific chain summaries by display-name chain keys', async () => {
		mocks.fetchWithPoolingOnServer.mockResolvedValue(
			jsonResponse({
				totalDataChartBreakdown: [
					[1, { BSC: { v1: 10 }, Ethereum: { v1: 50 } }],
					[2, { BSC: { v1: 30 }, Ethereum: { v1: 60 } }]
				]
			})
		)
		const { adapterMetricByChainBreakdown } =
			await import('~/containers/ProDashboard/server/chartBuilder/adapterMetrics/routes')

		const result = await adapterMetricByChainBreakdown.handle({
			method: 'GET',
			url: '',
			headers: {},
			query: {
				metric: 'fees',
				protocol: 'aave',
				chains: 'BSC',
				limit: '5'
			}
		})

		expect(result.status).toBe(200)
		expect(resultBody(result)).toMatchObject({
			metadata: expect.objectContaining({
				chains: ['BSC']
			})
		})
		expect(mocks.fetchWithPoolingOnServer).toHaveBeenCalledWith(expect.stringContaining('/fees/aave'))
	})

	it('normalizes saved legacy aliases for protocol-specific chain summary filters', async () => {
		mocks.fetchWithPoolingOnServer.mockResolvedValue(
			jsonResponse({
				totalDataChartBreakdown: [
					[1, { BSC: { v1: 10 }, Ethereum: { v1: 50 } }],
					[2, { BSC: { v1: 30 }, Ethereum: { v1: 60 } }]
				]
			})
		)
		const { adapterMetricByChainBreakdown } =
			await import('~/containers/ProDashboard/server/chartBuilder/adapterMetrics/routes')

		const result = await adapterMetricByChainBreakdown.handle({
			method: 'GET',
			url: '',
			headers: {},
			query: {
				metric: 'fees',
				protocol: 'aave',
				chains: 'bsc',
				limit: '5'
			}
		})

		expect(result.status).toBe(200)
		expect(resultBody(result)).toMatchObject({
			metadata: expect.objectContaining({
				chains: ['BSC']
			})
		})
	})

	it('does not mutate the cached protocol category lookup with overview protocol aliases', async () => {
		let overviewCalls = 0
		mocks.fetchWithPoolingOnServer.mockImplementation(async (url: string) => {
			if (/\/(fees|revenue)\/[^/?]+\?/.test(url)) {
				return jsonResponse({
					totalDataChart: [
						[1, 10],
						[2, 20]
					]
				})
			}
			overviewCalls += 1
			return jsonResponse({
				protocols: [
					{
						displayName: 'Transient Protocol',
						category: overviewCalls === 1 ? 'Lending' : undefined,
						breakdown24h: { bsc: { v1: 10 } }
					}
				],
				allChains: ['BSC'],
				totalDataChart: [
					[1, 10],
					[2, 20]
				],
				totalDataChartBreakdown: [
					[1, { 'Transient Protocol': { v1: 10 } }],
					[2, { 'Transient Protocol': { v1: 20 } }]
				]
			})
		})
		const { adapterMetricByChainBreakdown } =
			await import('~/containers/ProDashboard/server/chartBuilder/adapterMetrics/routes')

		const firstResult = await adapterMetricByChainBreakdown.handle({
			method: 'GET',
			url: 'limit-one',
			headers: {},
			query: {
				metric: 'fees',
				protocol: 'All',
				protocolCategories: 'lending',
				limit: '1'
			}
		})
		const secondResult = await adapterMetricByChainBreakdown.handle({
			method: 'GET',
			url: 'limit-two',
			headers: {},
			query: {
				metric: 'revenue',
				protocol: 'All',
				protocolCategories: 'lending',
				limit: '2'
			}
		})

		expect(resultBody(firstResult)).toMatchObject({ metadata: expect.objectContaining({ totalChains: 1 }) })
		expect(resultBody(secondResult)).toMatchObject({ metadata: expect.objectContaining({ totalChains: 0 }) })
		expect(overviewCalls).toBe(2)
	})
})
