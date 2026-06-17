import type {
	EquitiesDimensionMetric,
	EquitiesDimensionPeriod,
	EquitiesPriceHistory,
	IEquitiesDimensionsResponse
} from './api.types'
import type { IEquitiesPriceHistoryChart } from './types'

const FUNDAMENTAL_CHART_LABELS: Record<EquitiesDimensionMetric, string> = {
	revenue: 'Revenue',
	holdersRevenue: 'Holders Revenue',
	earnings: 'Earnings'
}

export function buildPriceHistoryChart(priceHistory: EquitiesPriceHistory): IEquitiesPriceHistoryChart {
	const source: Array<{ timestamp: number; Close: number }> = []
	for (const point of priceHistory) {
		source.push({
			timestamp: new Date(point[0]).getTime(),
			Close: point[1]
		})
	}
	source.sort((a, b) => a.timestamp - b.timestamp)

	return {
		dataset: {
			source,
			dimensions: ['timestamp', 'Close']
		},
		charts: [
			{
				type: 'line',
				name: 'Close',
				encode: { x: 'timestamp', y: 'Close' }
			}
		]
	}
}

export function buildEquitiesDimensionsChart(
	dimensions: IEquitiesDimensionsResponse,
	metric: EquitiesDimensionMetric,
	period: EquitiesDimensionPeriod
): IEquitiesPriceHistoryChart {
	const label = FUNDAMENTAL_CHART_LABELS[metric]
	const source: Array<Record<string, number | null>> = []
	const points = dimensions[metric]?.[period] ?? []
	for (const point of points) {
		source.push({
			timestamp: new Date(`${point[0]}T00:00:00Z`).getTime(),
			[label]: point[1]
		})
	}
	source.sort((a, b) => (a.timestamp as number) - (b.timestamp as number))

	return {
		dataset: {
			source,
			dimensions: ['timestamp', label]
		},
		charts: [
			{
				type: 'bar',
				name: label,
				encode: { x: 'timestamp', y: label }
			}
		]
	}
}
