import { resolveAllowedChainNamesFromCategories } from '~/containers/ProDashboard/server/chartBuilder/breakdownChains'
import { fetchStablecoinChartAllApi, fetchStablecoinDominanceAllApi } from '~/containers/Stablecoins/api'
import { normalizeCacheList, stableCacheKey } from '~/server/api/cacheKey'
import { queryFilterMode, queryIntClamped, queryList, queryString } from '~/server/api/params'
import { addApiRoutePhase, timeApiRoutePhase } from '~/server/api/phaseTelemetry'
import { badRequest, okSerializedJson } from '~/server/api/respond'
import { cachedJsonResult, cachedResult } from '~/server/api/resultCache'
import { defineApiRoute } from '~/server/api/types'
import {
	BREAKDOWN_COLOR_PALETTE,
	buildAlignedTopAndOthers,
	filterOutToday,
	normalizeDailyPairs,
	type ChartSeries,
	type ProtocolChainData
} from '~/utils/breakdowns'
import { toDisplayName } from '~/utils/chainNormalizer'
import { recordRouteRuntimeError } from '~/utils/telemetry'

const BREAKDOWN_RESULT_TTL_MS = 10 * 60 * 1000
const BREAKDOWN_STALE_MS = 20 * 60 * 1000
const STABLECOIN_BASE_CACHE_MS = 10 * 60 * 1000
const STABLECOIN_BASE_STALE_MS = 20 * 60 * 1000
const BREAKDOWN_CACHE_CONTROL = 'public, s-maxage=600, stale-while-revalidate=1200'

type StablecoinChainCandidate = {
	name: string
	data: [number, number][]
	lastValue: number
}

type StablecoinByChainBase = {
	candidates: StablecoinChainCandidate[]
	totalPairs: [number, number][]
}

const sumStablecoinUsd = (value: any): number => {
	if (typeof value === 'number') return value || 0
	if (!value || typeof value !== 'object') return 0
	let total = 0
	for (const nested of Object.values(value)) {
		if (typeof nested === 'number') total += nested || 0
		else if (nested && typeof nested === 'object') total += sumStablecoinUsd(nested)
	}
	return total
}

const toStablecoinPair = (point: any): [number, number] | null => {
	const rawTs = point?.date ?? point?.timestamp
	if (rawTs == null) return null

	let ts = Number(rawTs)
	if (!Number.isFinite(ts)) return null
	if (ts > 1e12) ts = Math.floor(ts / 1000)

	const usd = sumStablecoinUsd(point?.totalCirculatingUSD)
	if (!Number.isFinite(usd)) return null

	return [ts, usd]
}

async function getStablecoinByChainBaseData(): Promise<StablecoinByChainBase> {
	return cachedResult(
		'stablecoins-breakdown-chain-base',
		'all',
		{ ttlMs: STABLECOIN_BASE_CACHE_MS, ttlJitter: 0.2, staleWhileRevalidateMs: STABLECOIN_BASE_STALE_MS },
		async () => {
			const aggregatedJsonPromise = timeApiRoutePhase('stablecoin_fetch_aggregate', () =>
				fetchStablecoinChartAllApi()
			).catch((err) => {
				console.log('Failed to fetch aggregated stablecoin series for chains builder:', err)
				return null
			})
			const dominanceJson = await timeApiRoutePhase('stablecoin_fetch_dominance', () =>
				fetchStablecoinDominanceAllApi()
			)
			const chainChartMap: Record<string, any[]> = dominanceJson?.chainChartMap ?? {}
			const candidates: StablecoinChainCandidate[] = []
			const candidateStartedAt = Date.now()

			for (const chainName in chainChartMap) {
				const charts = chainChartMap[chainName]
				if (chainName === 'All') continue
				if (!Array.isArray(charts) || charts.length === 0) continue

				const pairs = charts.map(toStablecoinPair).filter(Boolean) as [number, number][]

				if (pairs.length === 0) continue

				const normalized = filterOutToday(normalizeDailyPairs(pairs))
				if (normalized.length === 0) continue

				const lastValue = normalized[normalized.length - 1]?.[1] || 0
				if (lastValue <= 0) continue

				candidates.push({
					name: chainName,
					data: normalized,
					lastValue
				})
			}
			addApiRoutePhase('stablecoin_base_chains', Date.now() - candidateStartedAt)

			let totalPairs: [number, number][] = []
			const aggregatedJson = await aggregatedJsonPromise
			if (aggregatedJson) {
				const aggregateStartedAt = Date.now()
				const aggregatedArray: any[] = Array.isArray(aggregatedJson?.aggregated) ? aggregatedJson.aggregated : []
				totalPairs = filterOutToday(
					normalizeDailyPairs(aggregatedArray.map(toStablecoinPair).filter(Boolean) as [number, number][])
				)
				addApiRoutePhase('stablecoin_base_total', Date.now() - aggregateStartedAt)
			}

			return { candidates, totalPairs }
		}
	)
}

async function projectStablecoinByChainBreakdownData(
	base: StablecoinByChainBase,
	{
		chains,
		topN,
		chainFilterMode,
		chainCategoryFilterMode,
		chainCategories
	}: {
		chains?: string[]
		topN: number
		chainFilterMode: 'include' | 'exclude'
		chainCategoryFilterMode: 'include' | 'exclude'
		chainCategories: string[]
	}
): Promise<ProtocolChainData> {
	const projectStartedAt = Date.now()
	const includeSet = chains && chains.length > 0 ? new Set(chains) : new Set<string>()

	let allowNamesFromCategories: Set<string> | null = null
	if (chainCategories && chainCategories.length > 0) {
		allowNamesFromCategories = await timeApiRoutePhase('stablecoin_chain_category_lookup', () =>
			resolveAllowedChainNamesFromCategories(chainCategories)
		)
	}

	const candidates = base.candidates.filter((candidate) => {
		if (includeSet.size > 0) {
			const matches = includeSet.has(candidate.name)
			if (chainFilterMode === 'include') {
				if (!matches) return false
			} else if (matches) {
				return false
			}
		}

		if (allowNamesFromCategories && allowNamesFromCategories.size > 0) {
			const matches = allowNamesFromCategories.has(candidate.name)
			if (chainCategoryFilterMode === 'include') {
				if (!matches) return false
			} else if (matches) {
				return false
			}
		}

		return true
	})

	if (candidates.length === 0) {
		addApiRoutePhase('stablecoin_project', Date.now() - projectStartedAt)
		return {
			series: [],
			metadata: {
				protocol: 'All Protocols',
				metric: 'Stablecoin Mcap',
				chains: [],
				totalChains: 0,
				topN: 0,
				othersCount: 0
			}
		}
	}

	const ranked = candidates.toSorted((a, b) => b.lastValue - a.lastValue)
	const picked = ranked.slice(0, Math.min(topN, ranked.length))
	const pickedSeries: ChartSeries[] = picked.map((entry, idx) => ({
		name: entry.name,
		data: entry.data,
		color: BREAKDOWN_COLOR_PALETTE[idx % BREAKDOWN_COLOR_PALETTE.length]
	}))

	const { alignedTopSeries, othersData, allTimestamps } = buildAlignedTopAndOthers(pickedSeries, base.totalPairs)
	const othersCount = Math.max(0, ranked.length - picked.length)
	const finalSeries: ChartSeries[] = [...alignedTopSeries]

	if (base.totalPairs.length > 0 && allTimestamps.length > 0) {
		const hasOthers = othersCount > 0 && othersData.some(([, v]) => v > 0)
		if (hasOthers) {
			finalSeries.push({
				name: `Others (${othersCount} chains)`,
				data: othersData,
				color: '#999999'
			})
		}
	}
	addApiRoutePhase('stablecoin_project', Date.now() - projectStartedAt)

	return {
		series: finalSeries,
		metadata: {
			protocol: 'All Protocols',
			metric: 'Stablecoin Mcap',
			chains: picked.map((entry) => entry.name),
			totalChains: ranked.length,
			topN: picked.length,
			othersCount
		}
	}
}

async function getStablecoinByChainBreakdownData({
	chains,
	topN,
	chainFilterMode,
	chainCategoryFilterMode,
	chainCategories
}: {
	chains?: string[]
	topN: number
	chainFilterMode: 'include' | 'exclude'
	chainCategoryFilterMode: 'include' | 'exclude'
	chainCategories: string[]
}): Promise<ProtocolChainData> {
	try {
		const base = await getStablecoinByChainBaseData()
		return projectStablecoinByChainBreakdownData(base, {
			chains,
			topN,
			chainFilterMode,
			chainCategoryFilterMode,
			chainCategories
		})
	} catch (error) {
		console.log('Error building stablecoin mcap by chain:', error)
		return {
			series: [],
			metadata: {
				protocol: 'All Protocols',
				metric: 'Stablecoin Mcap',
				chains: [],
				totalChains: 0,
				topN: 0,
				othersCount: 0
			}
		}
	}
}

export const stablecoinByChainBreakdown = defineApiRoute({
	route: '/api/public/pro-dashboard/chart-builder/stablecoins/breakdowns/by-chain',
	cacheControl: BREAKDOWN_CACHE_CONTROL,
	handle: async (req) => {
		const protocol = queryString(req.query, 'protocol')
		if (protocol && protocol.toLowerCase() !== 'all') {
			return badRequest('stablecoins metric is only available when protocol=All')
		}

		const rawChains = normalizeCacheList(queryList(req.query, 'chains'))
		let chains: string[] = []
		if (!rawChains.some((chain) => chain.toLowerCase() === 'all')) {
			// TODO(chain-normalizer): keep saved chart-builder aliases like xdai/optimism/era working.
			// Remove after saved ProDashboard stablecoin configs are migrated to display names.
			chains = normalizeCacheList(rawChains.map(toDisplayName))
		}
		const chainCategories = normalizeCacheList(queryList(req.query, 'chainCategories'))
		const chainMode = queryFilterMode(req.query, 'chainFilterMode', 'filterMode')
		const chainCategoryMode = queryFilterMode(req.query, 'chainCategoryFilterMode', 'filterMode')
		const topN = queryIntClamped(req.query, 'limit', 5, 1, 20)

		try {
			const cacheKey = stableCacheKey([
				'all',
				'stablecoins',
				chains,
				topN,
				chainMode,
				chainCategoryMode,
				chainCategories
			])
			const result = await cachedJsonResult(
				'stablecoins-breakdown-chain',
				cacheKey,
				{ ttlMs: BREAKDOWN_RESULT_TTL_MS, ttlJitter: 0.2, staleWhileRevalidateMs: BREAKDOWN_STALE_MS },
				() =>
					timeApiRoutePhase('stablecoin_breakdown_compute', () =>
						getStablecoinByChainBreakdownData({
							chains,
							topN,
							chainFilterMode: chainMode,
							chainCategoryFilterMode: chainCategoryMode,
							chainCategories
						})
					)
			)
			return okSerializedJson(result)
		} catch (error) {
			recordRouteRuntimeError(error, 'apiRoute')
			return {
				status: 500,
				body: {
					error: 'Failed to fetch stablecoin chain data',
					details: error instanceof Error ? error.message : 'Unknown error'
				}
			}
		}
	}
})
