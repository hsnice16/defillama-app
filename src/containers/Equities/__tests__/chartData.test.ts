import { describe, expect, it } from 'vitest'
import type { IEquitiesDimensionsResponse } from '../api.types'
import { buildEquitiesDimensionsChart } from '../chartData'

const dimensions: IEquitiesDimensionsResponse = {
	revenue: {
		annual: [
			['2025-12-31', 300],
			['2024-12-31', 200]
		],
		quarterly: [
			['2025-06-30', 120],
			['2025-03-31', 100]
		]
	},
	holdersRevenue: {
		annual: [
			['2025-12-31', 40],
			['2024-12-31', 35]
		],
		quarterly: [['2025-06-30', 10]]
	},
	earnings: {
		annual: [['2025-12-31', 80]],
		quarterly: [['2025-06-30', 20]]
	}
}

describe('equities chart data', () => {
	it('builds a sorted dataset for the selected metric and period', () => {
		expect(buildEquitiesDimensionsChart(dimensions, 'holdersRevenue', 'annual').dataset).toEqual({
			source: [
				{ timestamp: Date.parse('2024-12-31T00:00:00Z'), 'Holders Revenue': 35 },
				{ timestamp: Date.parse('2025-12-31T00:00:00Z'), 'Holders Revenue': 40 }
			],
			dimensions: ['timestamp', 'Holders Revenue']
		})
	})
})
