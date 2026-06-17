import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getProtocolChainBreakdownData: vi.fn(),
	getTvlBreakdownData: vi.fn()
}))

vi.mock('~/containers/ProDashboard/server/chartBuilder/protocols/breakdowns/byChain', () => ({
	getProtocolChainBreakdownData: mocks.getProtocolChainBreakdownData
}))

vi.mock('~/containers/ProDashboard/server/chartBuilder/protocols/breakdowns/tvl', () => ({
	getTvlBreakdownData: mocks.getTvlBreakdownData
}))

beforeEach(() => {
	vi.clearAllMocks()
	mocks.getProtocolChainBreakdownData.mockResolvedValue({ series: [], metadata: { metric: 'TVL' } })
	mocks.getTvlBreakdownData.mockResolvedValue({ series: [], metadata: { metric: 'TVL' } })
})

describe('ProtocolOverview TVL chart-builder breakdown routes', () => {
	it('normalizes saved legacy chain aliases for protocol TVL breakdowns', async () => {
		const { protocolTvlBreakdown } = await import('~/containers/ProDashboard/server/chartBuilder/protocols')

		await protocolTvlBreakdown.handle({
			method: 'GET',
			url: '',
			headers: {},
			query: { chains: 'xdai,optimism,era', limit: '5' }
		})

		expect(mocks.getTvlBreakdownData).toHaveBeenCalledWith(
			['Gnosis', 'OP Mainnet', 'ZKsync Era'],
			[],
			5,
			false,
			'include',
			'include'
		)
	})

	it('normalizes saved legacy chain aliases for protocol TVL by-chain breakdowns', async () => {
		const { protocolTvlByChainBreakdown } = await import('~/containers/ProDashboard/server/chartBuilder/protocols')

		await protocolTvlByChainBreakdown.handle({
			method: 'GET',
			url: '',
			headers: {},
			query: { protocol: 'aave', chains: 'xdai,optimism,era', limit: '3' }
		})

		expect(mocks.getProtocolChainBreakdownData).toHaveBeenCalledWith({
			protocol: 'aave',
			metric: 'tvl',
			chains: ['Gnosis', 'OP Mainnet', 'ZKsync Era'],
			topN: 3,
			chainFilterMode: 'include',
			chainCategoryFilterMode: 'include',
			chainCategories: []
		})
	})
})
