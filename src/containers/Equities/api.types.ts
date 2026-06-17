export interface IEquitiesCompanyApiItem {
	ticker: string
	country: string
	name: string
	currentPrice: number
	volume: number
	marketCap: number
	circulatingMarketCap: number | null
	enterpriseValue: number | null
	fiftyTwoWeekHigh: number
	fiftyTwoWeekLow: number
	dividendYield: number | null
	trailingPE: number | null
	priceToRevenue: number | null
	priceChangePercentage1d: number
	priceChangePercentage7d: number
	priceChangePercentage1m: number
	priceChange1d: number
	marketCapChange1d: number | null
	priceToBook: number
	enterpriseValueToEbitda: number | null
	holdersYield: number | null
	updatedAt: string
	revenueTTM: number | null
	grossProfitTTM: number | null
	earningsTTM: number | null
	ebitdaTTM: number | null
	operatingProfitMarginTTM: number | null
	holdersRevenueTTM: number | null
	holderEarningsTTM: number | null
	dividendsTTM: number | null
	stockRepurchaseTTM: number | null
	stockIssuanceTTM: number | null
	stockBasedCompensationTTM: number | null
	cashAndCashEquivalents: number | null
	totalAssets: number
	totalLiabilities: number
	totalShareholdersEquity: number
	totalDebt: number
	circulatingSupply: number | null
	totalSupply: number
	employeeCount: number
	sector: string
	industry: string
}

export interface IEquitiesSummaryResponse extends Omit<
	IEquitiesCompanyApiItem,
	'ticker' | 'country' | 'name' | 'sector' | 'industry'
> {}

export interface IEquitiesMetadataResponse {
	ticker: string
	name: string
	country: string
	sector: string
	industry: string
	employeeCount: number
	website?: string
	description?: string
	cik?: string
	startDate?: string
}

export type EquitiesPriceHistoryTimeframe = '1W' | '1M' | '6M' | '1Y' | '5Y' | 'MAX'

export type EquitiesPriceHistory = Array<[string, number]>

export type EquitiesDimensionMetric = 'revenue' | 'holdersRevenue' | 'earnings'

export type EquitiesDimensionPeriod = 'quarterly' | 'annual'

type EquitiesDimensionSeries = Array<[string, number | null]>

interface IEquitiesDimensionData {
	annual: EquitiesDimensionSeries
	quarterly: EquitiesDimensionSeries
}

export interface IEquitiesDimensionsResponse {
	revenue: IEquitiesDimensionData
	holdersRevenue: IEquitiesDimensionData
	earnings: IEquitiesDimensionData
}

export interface IEquitiesFilingApiItem {
	filingDate: string
	reportDate: string
	form: string
	primaryDocumentUrl: string
	documentDescription: string
}

interface IEquitiesStatementPeriodData {
	periodEnding: string[]
	values: Array<Array<number | null>>
	children: Record<string, { values: Array<Array<number | null>> }>
}

interface IEquitiesStatementSection {
	labels: string[]
	children: {
		quarterly: Record<string, { labels: string[] }>
		annual: Record<string, { labels: string[] }>
	}
	quarterly: IEquitiesStatementPeriodData
	annual: IEquitiesStatementPeriodData
}

export interface IEquitiesStatementsResponse {
	incomeStatement: IEquitiesStatementSection
	balanceSheet: IEquitiesStatementSection
	cashflow: IEquitiesStatementSection
}
