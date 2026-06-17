import { describe, expect, it } from 'vitest'
import { getStatementHeaderIndexes } from '../FinancialsTable'

describe('equities financials statement headers', () => {
	it('orders periodEnding values from newest to oldest', () => {
		expect(getStatementHeaderIndexes(['1984-03-31', '1984-09-30', '1984-06-30'])).toEqual([1, 2, 0])
	})
})
