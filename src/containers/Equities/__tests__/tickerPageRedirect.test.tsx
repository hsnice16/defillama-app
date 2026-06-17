import type { GetStaticPropsContext } from 'next'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
	vi.clearAllMocks()
	vi.resetModules()
})

function setupPageModule({
	redirectSlug = 'nvda:us',
	pageData = { ticker: 'NVDA', country: 'US', slug: 'nvda:us', name: 'NVIDIA Corporation' }
}: {
	redirectSlug?: string | null
	pageData?: unknown
}) {
	const getEquitiesTickerPageData = vi.fn().mockResolvedValue(pageData)
	const getEquitiesTickerRedirectSlug = vi.fn().mockResolvedValue(redirectSlug)

	vi.doMock('~/constants', () => ({
		SKIP_BUILD_STATIC_GENERATION: true
	}))
	vi.doMock('~/containers/Equities/queries', () => ({
		getEquitiesTickerPageData,
		getEquitiesTickerPaths: vi.fn().mockResolvedValue([]),
		getEquitiesTickerRedirectSlug
	}))
	vi.doMock('~/containers/Equities/TickerPage', () => ({
		EquityTickerPage: () => null
	}))
	vi.doMock('~/layout', () => ({
		default: () => null
	}))
	vi.doMock('~/utils/maxAgeForNext', () => ({
		maxAgeForNext: () => 123
	}))
	vi.doMock('~/utils/perf', () => ({
		withPerformanceLogging: (_label: string, fn: any) => fn
	}))

	return {
		getEquitiesTickerPageData,
		getEquitiesTickerRedirectSlug,
		page: import('~/pages/equities/[ticker]')
	}
}

describe('equities ticker page routing', () => {
	it('loads canonical ticker-country slugs', async () => {
		const setup = setupPageModule({})
		const page = await setup.page

		await expect(
			page.getStaticProps({ params: { ticker: 'nvda:us' } } as GetStaticPropsContext<{ ticker: string }>)
		).resolves.toEqual({
			props: { ticker: 'NVDA', country: 'US', slug: 'nvda:us', name: 'NVIDIA Corporation' },
			revalidate: 123
		})
		expect(setup.getEquitiesTickerPageData).toHaveBeenCalledWith('NVDA', 'US')
		expect(setup.getEquitiesTickerRedirectSlug).not.toHaveBeenCalled()
	})

	it('redirects old ticker-only slugs when uniquely resolvable', async () => {
		const setup = setupPageModule({ redirectSlug: 'nvda:us' })
		const page = await setup.page

		await expect(
			page.getStaticProps({ params: { ticker: 'nvda' } } as GetStaticPropsContext<{ ticker: string }>)
		).resolves.toEqual({
			redirect: {
				destination: '/equities/nvda:us',
				permanent: false
			}
		})
		expect(setup.getEquitiesTickerRedirectSlug).toHaveBeenCalledWith('nvda')
		expect(setup.getEquitiesTickerPageData).not.toHaveBeenCalled()
	})

	it('404s old ticker-only slugs when they are ambiguous or unknown', async () => {
		const setup = setupPageModule({ redirectSlug: null })
		const page = await setup.page

		await expect(
			page.getStaticProps({ params: { ticker: 'meta' } } as GetStaticPropsContext<{ ticker: string }>)
		).resolves.toEqual({ notFound: true })
	})
})
