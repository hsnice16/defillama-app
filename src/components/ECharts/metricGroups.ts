export type MetricUnitGroup = 'usd' | 'percent' | 'count' | 'ratio'

const PERCENT_METRIC_TYPES = new Set(['medianApy'])
const COUNT_METRIC_TYPES = new Set(['txs', 'users', 'activeUsers', 'newUsers', 'gasUsed'])
const RATIO_METRIC_TYPES = new Set(['pfRatio', 'psRatio'])

export function getMetricUnitGroup(metricType?: string): MetricUnitGroup {
	if (metricType) {
		if (PERCENT_METRIC_TYPES.has(metricType)) return 'percent'
		if (COUNT_METRIC_TYPES.has(metricType)) return 'count'
		if (RATIO_METRIC_TYPES.has(metricType)) return 'ratio'
	}
	return 'usd'
}

export const METRIC_UNIT_GROUP_SYMBOL: Record<MetricUnitGroup, string> = {
	usd: '$',
	percent: '%',
	count: '',
	ratio: ''
}

const MAX_Y_AXES = 3

export interface SeriesAxisInput {
	metricType?: string
	yAxisIndex?: number
}

export interface SeriesAxisLayout {
	needMultipleAxes: boolean
	axisCount: number
	axisUnitGroups: MetricUnitGroup[]
	seriesAxisIndexes: number[]
}

export function resolveSeriesAxisLayout(series: SeriesAxisInput[]): SeriesAxisLayout {
	const axisUnitGroups: MetricUnitGroup[] = []
	const seriesUnitGroups = series.map((s) => {
		const group = getMetricUnitGroup(s.metricType)
		if (!axisUnitGroups.includes(group)) {
			axisUnitGroups.push(group)
		}
		return group
	})

	const hasExplicitAxisIndex = series.some((s) => s.yAxisIndex != null && s.yAxisIndex > 0)
	const maxExplicitAxisIndex = hasExplicitAxisIndex ? Math.max(...series.map((s) => s.yAxisIndex ?? 0)) : 0

	const needMultipleAxes = axisUnitGroups.length > 1 || hasExplicitAxisIndex
	const axisCount = needMultipleAxes
		? Math.min(Math.max(axisUnitGroups.length, maxExplicitAxisIndex + 1, 2), MAX_Y_AXES)
		: 1

	const seriesAxisIndexes = series.map((s, index) => {
		const axisIndex = s.yAxisIndex ?? axisUnitGroups.indexOf(seriesUnitGroups[index])
		return Math.min(axisIndex >= 0 ? axisIndex : 0, MAX_Y_AXES - 1)
	})

	return { needMultipleAxes, axisCount, axisUnitGroups, seriesAxisIndexes }
}
