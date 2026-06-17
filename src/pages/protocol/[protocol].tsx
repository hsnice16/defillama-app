import type { GetStaticPropsContext } from 'next'
import { SKIP_BUILD_STATIC_GENERATION } from '~/constants'
import { fetchEntityQuestions } from '~/containers/LlamaAI/api'
import { ProtocolOverview } from '~/containers/ProtocolOverview'
import { getProtocolOverviewPageData } from '~/containers/ProtocolOverview/queries'
import type { IProtocolOverviewPageData } from '~/containers/ProtocolOverview/types'
import { slug } from '~/utils'
import { maxAgeForNext } from '~/utils/maxAgeForNext'
import { createRoutePhaseTimer, withPerformanceLogging } from '~/utils/perf'
import { addRouteTelemetryAttributes } from '~/utils/telemetry'

export const getStaticProps = withPerformanceLogging(
	'protocol/[protocol]',
	async ({ params }: GetStaticPropsContext<{ protocol: string }>) => {
		const phaseTimer = createRoutePhaseTimer()
		const stopGetStaticProps = phaseTimer.start('get_static_props_total')
		try {
			if (!params?.protocol) {
				addRouteTelemetryAttributes({ not_found_reason: 'missing_protocol_param' })
				return { notFound: true }
			}
			const { protocol } = params
			const normalizedName = slug(protocol)
			if (normalizedName === 'null' || normalizedName === 'undefined') {
				addRouteTelemetryAttributes({ not_found_reason: 'invalid_protocol_param', protocol_slug: normalizedName })
				return { notFound: true }
			}
			const [{ default: metadataCache }, { resolveProtocolParamFromMetadata }] = await phaseTimer.time(
				'metadata_and_routes_import',
				() => Promise.all([import('~/utils/metadata'), import('~/containers/ProtocolOverview/server/routes')])
			)
			const protocolRoute = resolveProtocolParamFromMetadata(protocol, metadataCache)

			if (!protocolRoute) {
				addRouteTelemetryAttributes({ not_found_reason: 'unknown_protocol_slug', protocol_slug: normalizedName })
				return { notFound: true }
			}

			const data = await phaseTimer.time('protocol_overview_data', () =>
				getProtocolOverviewPageData({
					protocolId: protocolRoute.id,
					currentProtocolMetadata: protocolRoute.metadata,
					chainMetadata: metadataCache.chainMetadata,
					tokenlist: metadataCache.tokenlist,
					cgExchangeIdentifiers: metadataCache.cgExchangeIdentifiers,
					emissionsSupplyMetrics: metadataCache.emissionsSupplyMetrics,
					protocolLlamaswapDataset: metadataCache.protocolLlamaswapDataset
				})
			)

			if (!data) {
				throw new Error(`Missing page data for route=/protocol/[protocol] protocol=${normalizedName}`)
			}

			const { questions: entityQuestions } = await phaseTimer.time('entity_questions', () =>
				fetchEntityQuestions(normalizedName, 'protocol')
			)

			return { props: { ...data, entityQuestions }, revalidate: maxAgeForNext([22]) }
		} finally {
			stopGetStaticProps()
			phaseTimer.record()
		}
	}
)

export async function getStaticPaths() {
	// When this is true (in preview environments) don't
	// prerender any static pages
	// (faster builds, but slower initial page load)
	if (SKIP_BUILD_STATIC_GENERATION) {
		return {
			paths: [],
			fallback: 'blocking'
		}
	}

	const { getProtocolOverviewStaticPaths } = await import('~/containers/ProtocolOverview/server/routes')
	const paths = await getProtocolOverviewStaticPaths()

	return { paths, fallback: 'blocking' }
}

export default function Protocols(props: IProtocolOverviewPageData) {
	return <ProtocolOverview {...props} />
}
