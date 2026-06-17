import { EQUITIES_SERVER_URL } from '~/constants'
import { fetchJson } from '~/utils/async'
import type {
	IEquitiesCompanyApiItem,
	IEquitiesDimensionsResponse,
	IEquitiesFilingApiItem,
	IEquitiesMetadataResponse,
	EquitiesPriceHistory,
	EquitiesPriceHistoryTimeframe,
	IEquitiesStatementsResponse,
	IEquitiesSummaryResponse
} from './api.types'

const EQUITIES_COMPANIES_API = `${EQUITIES_SERVER_URL}/companies`
const EQUITIES_STATEMENTS_API = `${EQUITIES_SERVER_URL}/statements`
const EQUITIES_PRICE_HISTORY_API = `${EQUITIES_SERVER_URL}/price-history`
const EQUITIES_SUMMARY_API = `${EQUITIES_SERVER_URL}/summary`
const EQUITIES_METADATA_API = `${EQUITIES_SERVER_URL}/metadata`
const EQUITIES_FILINGS_API = `${EQUITIES_SERVER_URL}/filings`
const EQUITIES_DIMENSIONS_API = `${EQUITIES_SERVER_URL}/dimensions`

function createEquitiesUrl(
	baseUrl: string,
	params?: { ticker?: string; country?: string; timeframe?: EquitiesPriceHistoryTimeframe }
): string {
	const url = new URL(baseUrl)

	if (params?.ticker) {
		url.searchParams.set('ticker', params.ticker)
	}

	if (params?.country) {
		url.searchParams.set('country', params.country)
	}

	if (params?.timeframe) {
		url.searchParams.set('timeframe', params.timeframe)
	}
	url.searchParams.set('zz', '16')

	return url.toString()
}

/**
 * Fetch the live market summary for all companies.
 */
export async function fetchEquitiesCompanies(): Promise<IEquitiesCompanyApiItem[]> {
	return fetchJson<IEquitiesCompanyApiItem[]>(createEquitiesUrl(EQUITIES_COMPANIES_API))
}

/**
 * Fetch the normalized financial statements for a company ticker.
 */
export async function fetchEquitiesStatements(ticker: string, country: string): Promise<IEquitiesStatementsResponse> {
	return fetchJson<IEquitiesStatementsResponse>(createEquitiesUrl(EQUITIES_STATEMENTS_API, { ticker, country }))
}

/**
 * Fetch historical daily close prices for a company ticker.
 */
export async function fetchEquitiesPriceHistory(
	ticker: string,
	country: string,
	timeframe: EquitiesPriceHistoryTimeframe = 'MAX'
): Promise<EquitiesPriceHistory> {
	return fetchJson<EquitiesPriceHistory>(createEquitiesUrl(EQUITIES_PRICE_HISTORY_API, { ticker, country, timeframe }))
}

/**
 * Fetch the live market summary for a company ticker.
 */
export async function fetchEquitiesSummary(ticker: string, country: string): Promise<IEquitiesSummaryResponse> {
	return fetchJson<IEquitiesSummaryResponse>(createEquitiesUrl(EQUITIES_SUMMARY_API, { ticker, country }))
}

/**
 * Fetch metadata for a company ticker.
 */
export async function fetchEquitiesMetadata(ticker: string, country: string): Promise<IEquitiesMetadataResponse> {
	return fetchJson<IEquitiesMetadataResponse>(createEquitiesUrl(EQUITIES_METADATA_API, { ticker, country }))
}

/**
 * Fetch SEC filings for a company ticker.
 */
export async function fetchEquitiesFilings(ticker: string, country: string): Promise<IEquitiesFilingApiItem[]> {
	return fetchJson<IEquitiesFilingApiItem[]>(createEquitiesUrl(EQUITIES_FILINGS_API, { ticker, country }))
}

/**
 * Fetch annual and quarterly fundamentals for a company ticker.
 */
export async function fetchEquitiesDimensions(ticker: string, country: string): Promise<IEquitiesDimensionsResponse> {
	return fetchJson<IEquitiesDimensionsResponse>(createEquitiesUrl(EQUITIES_DIMENSIONS_API, { ticker, country }))
}
