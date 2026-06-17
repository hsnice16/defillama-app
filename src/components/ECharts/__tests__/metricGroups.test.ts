import { describe, expect, it } from 'vitest'
import { getMetricUnitGroup, METRIC_UNIT_GROUP_SYMBOL, resolveSeriesAxisLayout } from '../metricGroups'

describe('getMetricUnitGroup', () => {
	it('treats dollar metrics as the usd group', () => {
		expect(getMetricUnitGroup('fees')).toBe('usd')
		expect(getMetricUnitGroup('holdersRevenue')).toBe('usd')
		expect(getMetricUnitGroup('revenue')).toBe('usd')
		expect(getMetricUnitGroup('tvl')).toBe('usd')
	})

	it('classifies percent, count and ratio metrics', () => {
		expect(getMetricUnitGroup('medianApy')).toBe('percent')
		expect(getMetricUnitGroup('txs')).toBe('count')
		expect(getMetricUnitGroup('activeUsers')).toBe('count')
		expect(getMetricUnitGroup('pfRatio')).toBe('ratio')
		expect(getMetricUnitGroup('psRatio')).toBe('ratio')
	})

	it('falls back to usd for unknown or missing metric types', () => {
		expect(getMetricUnitGroup(undefined)).toBe('usd')
		expect(getMetricUnitGroup('somethingNew')).toBe('usd')
	})
})

describe('resolveSeriesAxisLayout', () => {
	it('keeps two dollar metrics on a single shared axis', () => {
		const layout = resolveSeriesAxisLayout([{ metricType: 'fees' }, { metricType: 'holdersRevenue' }])

		expect(layout.needMultipleAxes).toBe(false)
		expect(layout.axisCount).toBe(1)
		expect(layout.seriesAxisIndexes).toEqual([0, 0])
	})

	it('splits axes when units genuinely differ', () => {
		const layout = resolveSeriesAxisLayout([{ metricType: 'fees' }, { metricType: 'activeUsers' }])

		expect(layout.needMultipleAxes).toBe(true)
		expect(layout.axisCount).toBe(2)
		expect(layout.axisUnitGroups).toEqual(['usd', 'count'])
		expect(layout.seriesAxisIndexes).toEqual([0, 1])
	})

	it('assigns same-unit series to the same axis regardless of order', () => {
		const layout = resolveSeriesAxisLayout([
			{ metricType: 'fees' },
			{ metricType: 'medianApy' },
			{ metricType: 'revenue' }
		])

		expect(layout.axisUnitGroups).toEqual(['usd', 'percent'])
		expect(layout.axisCount).toBe(2)
		expect(layout.seriesAxisIndexes).toEqual([0, 1, 0])
	})

	it('caps the axis count at three even with four distinct unit groups', () => {
		const layout = resolveSeriesAxisLayout([
			{ metricType: 'fees' },
			{ metricType: 'medianApy' },
			{ metricType: 'txs' },
			{ metricType: 'pfRatio' }
		])

		expect(layout.axisCount).toBe(3)
		expect(layout.seriesAxisIndexes).toEqual([0, 1, 2, 2])
	})

	it('honors explicit yAxisIndex even for same-unit series', () => {
		const layout = resolveSeriesAxisLayout([
			{ metricType: 'tvl', yAxisIndex: 0 },
			{ metricType: 'tvl', yAxisIndex: 1 }
		])

		expect(layout.needMultipleAxes).toBe(true)
		expect(layout.axisCount).toBe(2)
		expect(layout.seriesAxisIndexes).toEqual([0, 1])
	})

	it('uses a single axis for a single repeated metric', () => {
		const layout = resolveSeriesAxisLayout([{ metricType: 'volume' }, { metricType: 'volume' }])

		expect(layout.needMultipleAxes).toBe(false)
		expect(layout.axisCount).toBe(1)
	})

	it('maps unit groups to display symbols', () => {
		expect(METRIC_UNIT_GROUP_SYMBOL.usd).toBe('$')
		expect(METRIC_UNIT_GROUP_SYMBOL.percent).toBe('%')
		expect(METRIC_UNIT_GROUP_SYMBOL.count).toBe('')
		expect(METRIC_UNIT_GROUP_SYMBOL.ratio).toBe('')
	})
})
