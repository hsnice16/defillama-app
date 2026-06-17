import {
	fetchEquitiesCompanies,
	fetchEquitiesDimensions,
	fetchEquitiesFilings,
	fetchEquitiesMetadata,
	fetchEquitiesPriceHistory,
	fetchEquitiesStatements,
	fetchEquitiesSummary
} from './api'
import { buildPriceHistoryChart } from './chartData'
import type { IEquitiesListPageProps, IEquityTickerPageProps } from './types'
import { buildEquityTickerCountrySlug, normalizeEquityCountry, normalizeEquityTicker } from './utils'

export async function getEquitiesListPageData(): Promise<IEquitiesListPageProps> {
	const companies = await fetchEquitiesCompanies()
	const sortedCompanies = companies.toSorted((a, b) => {
		const aMarketCap = a.marketCap ?? -1
		const bMarketCap = b.marketCap ?? -1
		return bMarketCap - aMarketCap
	})
	const rows: IEquitiesListPageProps['companies'] = []
	let updatedAt: string | undefined

	for (const company of sortedCompanies) {
		rows.push({
			...company,
			href: `/equities/${buildEquityTickerCountrySlug(company.ticker, company.country)}`
		})
		updatedAt ??= company.updatedAt
	}

	return {
		companies: rows,
		updatedAt
	}
}

export async function getEquitiesTickerPageData(
	rawTicker: string,
	rawCountry: string
): Promise<IEquityTickerPageProps | null> {
	const ticker = normalizeEquityTicker(rawTicker)
	const country = normalizeEquityCountry(rawCountry)

	const [summary, metadata, priceHistory, statements, filings, dimensions] = await Promise.all([
		fetchEquitiesSummary(ticker, country),
		fetchEquitiesMetadata(ticker, country),
		fetchEquitiesPriceHistory(ticker, country).catch(() => []),
		fetchEquitiesStatements(ticker, country).catch(() => null),
		fetchEquitiesFilings(ticker, country).catch(() => []),
		fetchEquitiesDimensions(ticker, country).catch(() => null)
	])

	if (!summary || !metadata || !statements || !dimensions || !metadata.ticker || !metadata.name) {
		return null
	}

	const filingForms = new Set<string>()
	for (const filing of filings) {
		if (filing.form) filingForms.add(filing.form)
	}

	return {
		ticker,
		country,
		slug: buildEquityTickerCountrySlug(ticker, country),
		name: metadata.name,
		metadata,
		summary,
		priceHistoryChart: buildPriceHistoryChart(priceHistory),
		statements,
		dimensions,
		filings,
		filingForms: Array.from(filingForms).sort((a, b) => a.localeCompare(b))
	}
}

export async function getEquitiesTickerPaths(limit = 50): Promise<string[]> {
	const companies = await fetchEquitiesCompanies().catch(() => [])
	const sortedCompanies = companies.toSorted((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1))
	const paths: string[] = []
	for (let i = 0; i < sortedCompanies.length && i < limit; i++) {
		const company = sortedCompanies[i]
		if (company.ticker && company.country) paths.push(buildEquityTickerCountrySlug(company.ticker, company.country))
	}
	return paths
}

export async function getEquitiesTickerRedirectSlug(rawTicker: string): Promise<string | null> {
	const ticker = normalizeEquityTicker(rawTicker)
	const companies = await fetchEquitiesCompanies().catch(() => [])
	let match: (typeof companies)[number] | null = null
	for (const company of companies) {
		if (normalizeEquityTicker(company.ticker) !== ticker) continue
		if (match) return null
		match = company
	}
	return match ? buildEquityTickerCountrySlug(match.ticker, match.country) : null
}
