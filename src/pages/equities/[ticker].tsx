import type { GetStaticPropsContext, InferGetStaticPropsType } from 'next'
import { SKIP_BUILD_STATIC_GENERATION } from '~/constants'
import {
	getEquitiesTickerPageData,
	getEquitiesTickerPaths,
	getEquitiesTickerRedirectSlug
} from '~/containers/Equities/queries'
import { EquityTickerPage } from '~/containers/Equities/TickerPage'
import { parseEquityTickerCountrySlug } from '~/containers/Equities/utils'
import Layout from '~/layout'
import { maxAgeForNext } from '~/utils/maxAgeForNext'
import { withPerformanceLogging } from '~/utils/perf'

export const getStaticProps = withPerformanceLogging(
	'equities/[ticker]',
	async ({ params }: GetStaticPropsContext<{ ticker: string }>) => {
		if (!params?.ticker) {
			return { notFound: true }
		}

		const tickerCountry = parseEquityTickerCountrySlug(params.ticker)

		if (!tickerCountry) {
			const redirectSlug = await getEquitiesTickerRedirectSlug(params.ticker)
			if (!redirectSlug) return { notFound: true }

			return {
				redirect: {
					destination: `/equities/${redirectSlug}`,
					permanent: false
				}
			}
		}

		const props = await getEquitiesTickerPageData(tickerCountry.ticker, tickerCountry.country)

		if (!props) {
			return { notFound: true }
		}

		return {
			props,
			revalidate: maxAgeForNext([5])
		}
	}
)

export async function getStaticPaths() {
	if (SKIP_BUILD_STATIC_GENERATION) {
		return {
			paths: [],
			fallback: 'blocking'
		}
	}

	const tickers = await getEquitiesTickerPaths()
	const paths: Array<{ params: { ticker: string } }> = []
	for (const ticker of tickers) {
		paths.push({ params: { ticker } })
	}

	return {
		paths,
		fallback: 'blocking'
	}
}

export default function EquityTickerDetailPage(props: InferGetStaticPropsType<typeof getStaticProps>) {
	return (
		<Layout
			title={`${props.name} (${props.ticker}:${props.country}) Stock Overview - DefiLlama`}
			description={`Track ${props.name} (${props.ticker}:${props.country}) price history, financial statements, key metrics, fundamentals, and SEC filings on DefiLlama.`}
			canonicalUrl={`/equities/${props.slug}`}
		>
			<EquityTickerPage {...props} />
		</Layout>
	)
}
