import { NON_ADAPTER_BY_CHAIN_BREAKDOWN_METRICS } from '~/containers/ProDashboard/utils/breakdownMetrics'
import { normalizeCacheList, stableCacheKey } from '~/server/api/cacheKey'
import { queryBoolean, queryFilterMode, queryIntClamped, queryList, queryString } from '~/server/api/params'
import { timeApiRoutePhase } from '~/server/api/phaseTelemetry'
import { badRequest, okSerializedJson } from '~/server/api/respond'
import { cachedJsonResult } from '~/server/api/resultCache'
import { defineApiRoute } from '~/server/api/types'
import { toDisplayName } from '~/utils/chainNormalizer'
import { recordRouteRuntimeError } from '~/utils/telemetry'
import { getAdapterMetricChainSeries } from './breakdowns/chainSeries'
import { DIMENSIONS_API_METRIC_CONFIG } from './breakdowns/config'
import { getAdapterMetricProtocolSeries } from './breakdowns/protocolSeries'

const BREAKDOWN_RESULT_TTL_MS = 10 * 60 * 1000
const BREAKDOWN_STALE_MS = 20 * 60 * 1000
const BREAKDOWN_CACHE_CONTROL = 'public, s-maxage=600, stale-while-revalidate=1200'

function normalizeLegacyChainFilters(rawChains: string[]): string[] {
	const chains = normalizeCacheList(rawChains)
	if (chains.some((chain) => chain.toLowerCase() === 'all')) return []

	// TODO(chain-normalizer): keep saved ProDashboard adapter-metric aliases
	// like bsc/xdai/optimism/era working. Remove after configs migrate to display names.
	return normalizeCacheList(chains.map(toDisplayName))
}

export const adapterMetricBreakdown = defineApiRoute({
	route: '/api/public/pro-dashboard/chart-builder/adapter-metrics/breakdowns/[metric]',
	cacheControl: BREAKDOWN_CACHE_CONTROL,
	handle: async (req) => {
		const metric = queryString(req.query, 'metric') ?? ''
		const topN = queryIntClamped(req.query, 'limit', 10, 1, 20)
		const categories = normalizeCacheList(queryList(req.query, 'categories'), { lowercase: true })
		const groupByParent = queryBoolean(req.query, 'groupByParent')
		const chainMode = queryFilterMode(req.query, 'chainFilterMode', 'filterMode')
		const categoryMode = queryFilterMode(req.query, 'categoryFilterMode', 'filterMode')

		if (!DIMENSIONS_API_METRIC_CONFIG[metric]) {
			return badRequest(`Unsupported metric: ${metric}`)
		}

		const chains = normalizeLegacyChainFilters(queryList(req.query, 'chains'))
		const chainsOrAll = chains.length > 0 ? chains : ['all']

		try {
			const cacheKey = stableCacheKey([metric, chainsOrAll, categories, topN, groupByParent, chainMode, categoryMode])
			const result = await cachedJsonResult(
				'adapter-metrics-breakdown-dimensions',
				cacheKey,
				{ ttlMs: BREAKDOWN_RESULT_TTL_MS, ttlJitter: 0.2, staleWhileRevalidateMs: BREAKDOWN_STALE_MS },
				() =>
					timeApiRoutePhase('adapter_protocol_breakdown_compute', () =>
						getAdapterMetricProtocolSeries({
							metric,
							chains: chainsOrAll,
							categories,
							topN,
							groupByParent,
							chainFilterMode: chainMode,
							categoryFilterMode: categoryMode
						})
					)
			)
			return okSerializedJson(result)
		} catch (error) {
			recordRouteRuntimeError(error, 'apiRoute')
			return {
				status: 500,
				body: {
					error: `Failed to fetch protocol ${metric} data`,
					details: error instanceof Error ? error.message : 'Unknown error'
				}
			}
		}
	}
})

export const adapterMetricByChainBreakdown = defineApiRoute({
	route: '/api/public/pro-dashboard/chart-builder/adapter-metrics/breakdowns/by-chain/[metric]',
	cacheControl: BREAKDOWN_CACHE_CONTROL,
	handle: async (req) => {
		const metric = queryString(req.query, 'metric') ?? ''
		const protocol = queryString(req.query, 'protocol')

		if (NON_ADAPTER_BY_CHAIN_BREAKDOWN_METRICS.has(metric) || !DIMENSIONS_API_METRIC_CONFIG[metric]) {
			return badRequest(`Unsupported metric: ${metric}`)
		}

		const chains = normalizeLegacyChainFilters(queryList(req.query, 'chains'))
		const chainCategories = normalizeCacheList(queryList(req.query, 'chainCategories'))
		const protocolCategories = normalizeCacheList(queryList(req.query, 'protocolCategories'), { lowercase: true })
		const chainMode = queryFilterMode(req.query, 'chainFilterMode', 'filterMode')
		const chainCategoryMode = queryFilterMode(req.query, 'chainCategoryFilterMode', 'filterMode')
		const protocolCategoryMode = queryFilterMode(req.query, 'protocolCategoryFilterMode', 'filterMode')
		const topN = queryIntClamped(req.query, 'limit', 5, 1, 20)

		try {
			const cacheKey = stableCacheKey([
				protocol ?? 'all',
				metric,
				chains,
				topN,
				chainMode,
				chainCategoryMode,
				protocolCategoryMode,
				chainCategories,
				protocolCategories
			])
			const result = await cachedJsonResult(
				'adapter-metrics-breakdown-chain',
				cacheKey,
				{ ttlMs: BREAKDOWN_RESULT_TTL_MS, ttlJitter: 0.2, staleWhileRevalidateMs: BREAKDOWN_STALE_MS },
				() =>
					timeApiRoutePhase('adapter_chain_breakdown_compute', () =>
						getAdapterMetricChainSeries({
							protocol,
							metric,
							chains,
							topN,
							chainFilterMode: chainMode,
							chainCategoryFilterMode: chainCategoryMode,
							protocolCategoryFilterMode: protocolCategoryMode,
							chainCategories,
							protocolCategories
						})
					)
			)
			return okSerializedJson(result)
		} catch (error) {
			recordRouteRuntimeError(error, 'apiRoute')
			return {
				status: 500,
				body: {
					error: 'Failed to fetch protocol chain data',
					details: error instanceof Error ? error.message : 'Unknown error'
				}
			}
		}
	}
})
