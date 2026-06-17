import { describe, expect, it } from 'vitest'
import { buildEquityTickerCountrySlug, parseEquityTickerCountryParam, parseEquityTickerCountrySlug } from '../utils'

describe('equities slug helpers', () => {
	it('builds canonical ticker-country slugs', () => {
		expect(buildEquityTickerCountrySlug(' nvda ', ' us ')).toBe('nvda:us')
	})

	it('parses canonical ticker-country slugs', () => {
		expect(parseEquityTickerCountrySlug('nvda:us')).toEqual({ ticker: 'NVDA', country: 'US' })
		expect(parseEquityTickerCountrySlug('nvda')).toBeNull()
		expect(parseEquityTickerCountrySlug('nvda:us:x')).toBeNull()
	})

	it('keeps old ticker-only dashboard params on US equities', () => {
		expect(parseEquityTickerCountryParam('aapl')).toEqual({ ticker: 'AAPL', country: 'US' })
		expect(parseEquityTickerCountryParam('aapl:us')).toEqual({ ticker: 'AAPL', country: 'US' })
	})
})
