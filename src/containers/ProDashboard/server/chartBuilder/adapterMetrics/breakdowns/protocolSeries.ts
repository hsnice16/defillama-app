import { DIMENSIONS_OVERVIEW_API } from '~/constants'
import { fetchProtocols } from '~/containers/ProtocolLists/api'
import { stableCacheKey } from '~/server/api/cacheKey'
import { addApiRoutePhase, timeApiRoutePhase } from '~/server/api/phaseTelemetry'
import { cachedResult } from '~/server/api/resultCache'
import { BREAKDOWN_COLOR_PALETTE, toSlug, type ChartSeries, type ProtocolBreakdownData } from '~/utils/breakdowns'
import { fetchWithPoolingOnServer } from '~/utils/http-client'
import { recordRuntimeError } from '~/utils/telemetry'
import { DIMENSIONS_API_METRIC_CONFIG } from './config'

type DimensionsBreakdownParams = {
	metric: string
	chains: string[]
	categories: string[]
	topN: number
	groupByParent: boolean
	chainFilterMode: 'include' | 'exclude'
	categoryFilterMode: 'include' | 'exclude'
}

type ChainResult = { chain: string; data: any }

type ProtocolLookup = {
	protocolCategories: Map<string, string>
	protocolCategoriesBySlug: Map<string, string>
	protocolToParentId: Map<string, string>
	parentIdToName: Map<string, string>
}

type ProtocolBreakdownBase = {
	chainsArray: string[]
	metricName: string
	chainResultsCount: number
	totalDataChartBreakdown: Array<[number, Record<string, number>]>
}

const PROTOCOL_BASE_CACHE_MS = 10 * 60 * 1000
const PROTOCOL_BASE_STALE_MS = 20 * 60 * 1000
const PROTOCOL_LOOKUP_CACHE_MS = 60 * 60 * 1000
let protocolLookupCache: { data: ProtocolLookup; timestamp: number } | null = null

const encodeChainPathSegment = (chain: string): string => encodeURIComponent(chain)

const buildEmptyBreakdown = (
	chainsArray: string[],
	categoriesArray: string[],
	metricName: string,
	topN: number,
	error?: string
): ProtocolBreakdownData => ({
	series: [],
	metadata: {
		chain: chainsArray.join(','),
		chains: chainsArray,
		categories: categoriesArray,
		metric: metricName,
		topN,
		totalProtocols: 0,
		othersCount: 0,
		marketSector: categoriesArray.join(',') || null,
		...(error ? { error } : {})
	}
})

const getProtocolLookup = async (): Promise<ProtocolLookup> => {
	if (protocolLookupCache && Date.now() - protocolLookupCache.timestamp < PROTOCOL_LOOKUP_CACHE_MS) {
		return protocolLookupCache.data
	}

	const protocolsData = await timeApiRoutePhase('adapter_protocol_metadata_lookup', () => fetchProtocols())
	const protocolCategories: Map<string, string> = new Map()
	const protocolCategoriesBySlug: Map<string, string> = new Map()
	const protocolToParentId: Map<string, string> = new Map()
	const parentIdToName: Map<string, string> = new Map()
	const protocols = protocolsData.protocols || []
	const parentProtocols = protocolsData.parentProtocols || []

	for (const pp of parentProtocols) {
		if (pp?.id && pp?.name) {
			parentIdToName.set(pp.id, pp.name)
		}
	}

	for (const protocol of protocols as any[]) {
		if (protocol.name) {
			if (protocol.category) {
				const cat = protocol.category.toLowerCase()
				protocolCategories.set(protocol.name, cat)
				protocolCategoriesBySlug.set(toSlug(protocol.name), cat)
			}
			if (protocol.parentProtocol) {
				protocolToParentId.set(protocol.name, protocol.parentProtocol)
			}
		}
	}

	const data = {
		parentIdToName,
		protocolCategories,
		protocolCategoriesBySlug,
		protocolToParentId
	}
	protocolLookupCache = { data, timestamp: Date.now() }
	return data
}

const fetchChainResults = async (chainsArray: string[], metric: string): Promise<ChainResult[]> => {
	const config = DIMENSIONS_API_METRIC_CONFIG[metric]
	const chainDataPromises = chainsArray.map(async (singleChain) => {
		let apiUrl =
			singleChain.toLowerCase() !== 'all'
				? `${DIMENSIONS_OVERVIEW_API}/${config.endpoint}/${encodeChainPathSegment(singleChain)}?excludeTotalDataChartBreakdown=false`
				: `${DIMENSIONS_OVERVIEW_API}/${config.endpoint}?excludeTotalDataChartBreakdown=false`

		if (config.dataType) {
			apiUrl += `&dataType=${config.dataType}`
		}

		try {
			const response = await fetchWithPoolingOnServer(apiUrl)
			if (!response.ok) {
				return null
			}
			const data = await response.json()
			return { chain: singleChain, data }
		} catch (error) {
			recordRuntimeError(error, 'pageBuild')
			return null
		}
	})

	return (await Promise.all(chainDataPromises)).filter(Boolean) as ChainResult[]
}

const toBreakdownMap = (breakdown: Array<[number, Record<string, number>]>): Map<number, Map<string, number>> => {
	const map = new Map<number, Map<string, number>>()
	for (const [ts, protocols] of breakdown) {
		const m = new Map<string, number>()
		for (const name in protocols || {}) {
			m.set(name, protocols[name] as number)
		}
		map.set(ts, m)
	}
	return map
}

const buildAggregatedBreakdown = async (
	chainsArray: string[],
	metric: string,
	chainFilterMode: 'include' | 'exclude',
	chainResults: ChainResult[]
): Promise<Map<number, Map<string, number>>> => {
	const aggregatedBreakdown = new Map<number, Map<string, number>>()

	const realChainsToExclude = chainsArray.filter((c) => c.toLowerCase() !== 'all')
	const hasRealChainsToExclude = chainFilterMode === 'exclude' && realChainsToExclude.length > 0

	if (hasRealChainsToExclude) {
		const config = DIMENSIONS_API_METRIC_CONFIG[metric]
		let allUrl = `${DIMENSIONS_OVERVIEW_API}/${config.endpoint}?excludeTotalDataChartBreakdown=false`
		if (config.dataType) allUrl += `&dataType=${config.dataType}`
		const allResp = await fetchWithPoolingOnServer(allUrl)
		const allJson = await allResp.json()
		const allBreakdown: Array<[number, Record<string, number>]> = allJson?.totalDataChartBreakdown || []
		const allMap = toBreakdownMap(allBreakdown)

		const excludedResults = await Promise.all(
			realChainsToExclude.map(async (singleChain) => {
				let url = `${DIMENSIONS_OVERVIEW_API}/${config.endpoint}/${encodeChainPathSegment(singleChain)}?excludeTotalDataChartBreakdown=false`
				if (config.dataType) url += `&dataType=${config.dataType}`
				try {
					const r = await fetchWithPoolingOnServer(url)
					if (!r.ok) return null
					const j = await r.json()
					return j
				} catch {
					return null
				}
			})
		)
		const excludedMaps: Map<number, Map<string, number>>[] = []
		for (const ex of excludedResults) {
			if (!ex || !Array.isArray(ex.totalDataChartBreakdown)) continue
			excludedMaps.push(toBreakdownMap(ex.totalDataChartBreakdown))
		}

		for (const [ts, allProtoMap] of allMap.entries()) {
			const out = new Map<string, number>(allProtoMap)
			for (const exMap of excludedMaps) {
				const exProtoMap = exMap.get(ts)
				if (!exProtoMap) continue
				for (const [p, v] of exProtoMap.entries()) {
					out.set(p, (out.get(p) || 0) - (v || 0))
				}
			}
			aggregatedBreakdown.set(ts, out)
		}
	} else {
		for (const result of chainResults) {
			const { data } = result
			if (!data.totalDataChartBreakdown || !Array.isArray(data.totalDataChartBreakdown)) continue

			for (const item of data.totalDataChartBreakdown as any[]) {
				const [timestamp, protocols] = item
				if (!protocols) continue

				if (!aggregatedBreakdown.has(timestamp)) {
					aggregatedBreakdown.set(timestamp, new Map())
				}

				const timestampData = aggregatedBreakdown.get(timestamp)!

				for (const protocolName in protocols) {
					const value = protocols[protocolName]
					const currentValue = timestampData.get(protocolName) || 0
					timestampData.set(protocolName, currentValue + (value as number))
				}
			}
		}
	}

	return aggregatedBreakdown
}

const getAdapterMetricProtocolBase = async (
	metric: string,
	chainsArray: string[],
	chainFilterMode: 'include' | 'exclude'
): Promise<ProtocolBreakdownBase> => {
	const config = DIMENSIONS_API_METRIC_CONFIG[metric]
	const cacheKey = stableCacheKey([metric, chainsArray, chainFilterMode])

	return cachedResult(
		'adapter-metrics-protocol-breakdown-base',
		cacheKey,
		{ ttlMs: PROTOCOL_BASE_CACHE_MS, ttlJitter: 0.2, staleWhileRevalidateMs: PROTOCOL_BASE_STALE_MS },
		async () => {
			const chainResults = await timeApiRoutePhase('adapter_protocol_fetch_chains', () =>
				fetchChainResults(chainsArray, metric)
			)
			const aggregatedBreakdown = await timeApiRoutePhase('adapter_protocol_aggregate', () =>
				buildAggregatedBreakdown(chainsArray, metric, chainFilterMode, chainResults)
			)
			const convertStartedAt = Date.now()
			const totalDataChartBreakdown = Array.from(aggregatedBreakdown.entries())
				.sort(([a], [b]) => a - b)
				.map(
					([timestamp, protocolEntries]) =>
						[timestamp, Object.fromEntries(protocolEntries.entries())] as [number, Record<string, number>]
				)
			addApiRoutePhase('adapter_protocol_base_to_object', Date.now() - convertStartedAt)

			return {
				chainResultsCount: chainResults.length,
				chainsArray,
				metricName: config.metricName,
				totalDataChartBreakdown
			}
		}
	)
}

export const getAdapterMetricProtocolSeries = async ({
	metric,
	chains,
	categories,
	topN,
	groupByParent,
	chainFilterMode,
	categoryFilterMode
}: DimensionsBreakdownParams): Promise<ProtocolBreakdownData> => {
	const config = DIMENSIONS_API_METRIC_CONFIG[metric]
	if (!config) {
		throw new Error(`Unsupported metric: ${metric}`)
	}

	const chainsArray = chains.length > 0 ? chains : ['all']
	const categoriesArray = (categories || []).map((cat) => cat.toLowerCase())
	const categoriesSet = new Set(categoriesArray)

	const base = await getAdapterMetricProtocolBase(metric, chainsArray, chainFilterMode)

	if (base.chainResultsCount === 0 && chainFilterMode === 'include') {
		return buildEmptyBreakdown(
			chainsArray,
			categoriesArray,
			config.metricName,
			topN,
			`No data available for chains: ${chainsArray.join(', ')}`
		)
	}

	const projectionStartedAt = Date.now()
	const data = { totalDataChartBreakdown: base.totalDataChartBreakdown }

	if (!data.totalDataChartBreakdown || !Array.isArray(data.totalDataChartBreakdown)) {
		return buildEmptyBreakdown(chainsArray, categoriesArray, config.metricName, topN)
	}

	const lastDayData = data.totalDataChartBreakdown[data.totalDataChartBreakdown.length - 2]
	if (!lastDayData || !lastDayData[1]) {
		return buildEmptyBreakdown(chainsArray, categoriesArray, config.metricName, topN)
	}

	const lastDayProtocols = lastDayData[1]

	const { parentIdToName, protocolCategories, protocolCategoriesBySlug, protocolToParentId } = await getProtocolLookup()

	const getCategory = (name: string): string => {
		return protocolCategories.get(name) || protocolCategoriesBySlug.get(toSlug(name)) || ''
	}

	let protocolEntries = Object.entries(lastDayProtocols).map(([name, value]) => ({ name, value: value as number }))

	if (categoriesSet.size > 0 && (protocolCategories.size > 0 || protocolCategoriesBySlug.size > 0)) {
		if (categoryFilterMode === 'exclude') {
			protocolEntries = protocolEntries.filter((p) => !categoriesSet.has(getCategory(p.name)))
		} else {
			protocolEntries = protocolEntries.filter((p) => categoriesSet.has(getCategory(p.name)))
		}
	}

	let topProtocols: string[]
	let topProtocolsSet: Set<string>
	let protocolNameMapping: Map<string, string> = new Map()
	let protocolFamilyValues: Map<string, { name: string; value: number; isParent: boolean }> = new Map()

	if (groupByParent) {
		for (const entry of protocolEntries) {
			const parentId = protocolToParentId.get(entry.name)
			if (parentId) {
				const parentName = parentIdToName.get(parentId) || entry.name
				const existing = protocolFamilyValues.get(parentId)
				if (existing) {
					protocolFamilyValues.set(parentId, {
						name: parentName,
						value: existing.value + entry.value,
						isParent: true
					})
				} else {
					protocolFamilyValues.set(parentId, {
						name: parentName,
						value: entry.value,
						isParent: true
					})
				}
			} else {
				const key = `protocol:${entry.name}`
				protocolFamilyValues.set(key, {
					name: entry.name,
					value: entry.value,
					isParent: false
				})
			}
		}

		const sortedFamilies = Array.from(protocolFamilyValues.values()).sort((a, b) => b.value - a.value)
		topProtocols = sortedFamilies.slice(0, topN).map((f) => f.name)
		topProtocolsSet = new Set(topProtocols)

		for (const [protocolName, parentId] of protocolToParentId.entries()) {
			const parentName = parentIdToName.get(parentId)
			if (parentName && topProtocolsSet.has(parentName)) {
				protocolNameMapping.set(protocolName, parentName)
			}
		}
	} else {
		const sortedProtocolEntries = protocolEntries.toSorted((a, b) => b.value - a.value)
		topProtocols = sortedProtocolEntries.slice(0, topN).map((p) => p.name)
		topProtocolsSet = new Set(topProtocols)

		for (const entry of protocolEntries) {
			protocolFamilyValues.set(`protocol:${entry.name}`, {
				name: entry.name,
				value: entry.value,
				isParent: false
			})
		}
	}

	const protocolData: Map<string, Map<number, number>> = new Map()
	for (const protocol of topProtocols) {
		protocolData.set(protocol, new Map())
	}

	const timestampTotals: Map<number, number> = new Map()
	const timestampTopTotals: Map<number, number> = new Map()

	for (const item of data.totalDataChartBreakdown as any[]) {
		const [timestamp, protocolBreakdown] = item
		if (!protocolBreakdown) continue

		let dayTotal = 0
		let topTotal = 0

		for (const protocolName in protocolBreakdown) {
			const value = protocolBreakdown[protocolName]
			if (categoriesSet.size > 0 && (protocolCategories.size > 0 || protocolCategoriesBySlug.size > 0)) {
				const cat = getCategory(protocolName)
				if (categoryFilterMode === 'exclude') {
					if (categoriesSet.has(cat)) continue
				} else {
					if (!categoriesSet.has(cat)) continue
				}
			}

			const protocolValue = value as number
			dayTotal += protocolValue

			const displayName = groupByParent ? protocolNameMapping.get(protocolName) || protocolName : protocolName

			if (topProtocolsSet.has(displayName)) {
				topTotal += protocolValue
				const series = protocolData.get(displayName)
				if (series) {
					series.set(timestamp, (series.get(timestamp) || 0) + protocolValue)
				}
			}
		}

		timestampTotals.set(timestamp, dayTotal)
		timestampTopTotals.set(timestamp, topTotal)
	}

	const allTimestamps = Array.from(timestampTotals.keys()).sort((a, b) => a - b)

	const series: ChartSeries[] = []

	for (let i = 0; i < topProtocols.length; i++) {
		const protocol = topProtocols[i]
		const protocolDataMap = protocolData.get(protocol) || new Map<number, number>()

		const alignedData: [number, number][] = allTimestamps.map((timestamp) => {
			return [timestamp, protocolDataMap.get(timestamp) || 0]
		})

		series.push({
			name: protocol,
			data: alignedData,
			color: BREAKDOWN_COLOR_PALETTE[i % BREAKDOWN_COLOR_PALETTE.length]
		})
	}

	const othersData: [number, number][] = allTimestamps.map((timestamp) => {
		const total = timestampTotals.get(timestamp) || 0
		const topTotal = timestampTopTotals.get(timestamp) || 0
		const othersValue = Math.max(0, total - topTotal)
		return [timestamp, othersValue]
	})

	const hasOthersData = othersData.some(([_, value]) => value > 0)
	const totalFamilies = groupByParent ? protocolFamilyValues.size : protocolEntries.length
	const othersCount = Math.max(0, totalFamilies - topN)

	if (hasOthersData) {
		series.push({
			name: `Others (${othersCount} protocols)`,
			data: othersData,
			color: '#999999'
		})
	}
	addApiRoutePhase('adapter_protocol_project', Date.now() - projectionStartedAt)

	return {
		series,
		metadata: {
			chain: chainsArray.join(','),
			chains: chainsArray,
			categories: categoriesArray,
			metric: config.metricName,
			topN,
			totalProtocols: totalFamilies,
			othersCount: othersCount,
			marketSector: categoriesArray.join(',') || null
		}
	}
}
