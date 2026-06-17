import { useRouter } from 'next/router'
import { lazy, Suspense, useMemo } from 'react'
import { ChartExportButtons } from '~/components/ButtonStyled/ChartExportButtons'
import { MetricRow } from '~/components/MetricPrimitives'
import { TagGroup } from '~/components/TagGroup'
import { TokenLogo } from '~/components/TokenLogo'
import { useGetChartInstance } from '~/hooks/useGetChartInstance'
import defs from '~/public/equities-definitions.json'
import { abbreviateNumber } from '~/utils'
import { equityCountryFlagUrl, equityIconUrl } from '~/utils/icons'
import { pushShallowQuery, readSingleQueryValue } from '~/utils/routerQuery'
import type {
	EquitiesDimensionMetric,
	EquitiesDimensionPeriod,
	EquitiesPriceHistoryTimeframe,
	IEquitiesSummaryResponse
} from './api.types'
import { buildEquitiesDimensionsChart } from './chartData'
import { EquitiesFilingsTable } from './FilingsTable'
import { EquitiesFinancialsTable } from './FinancialsTable'
import type { IEquityTickerPageProps } from './types'
import { formatEquitiesDate, formatEquitiesDateTime } from './utils'

const MultiSeriesChart2 = lazy(() => import('~/components/ECharts/MultiSeriesChart2'))

const EQUITIES_PRICE_HISTORY_TIMEFRAMES: readonly EquitiesPriceHistoryTimeframe[] = [
	'1W',
	'1M',
	'6M',
	'1Y',
	'5Y',
	'MAX'
]
const DEFAULT_PRICE_HISTORY_TIMEFRAME: EquitiesPriceHistoryTimeframe = 'MAX'

const TABS = ['financials', 'overview', 'filings'] as const
type EquityTab = (typeof TABS)[number]

const EQUITY_FUNDAMENTAL_CHART_OPTIONS = ['Revenue', 'Holders Revenue', 'Earnings'] as const
type EquityFundamentalChartOption = (typeof EQUITY_FUNDAMENTAL_CHART_OPTIONS)[number]
const DEFAULT_EQUITY_FUNDAMENTAL_CHART: EquityFundamentalChartOption = 'Revenue'
const EQUITY_FUNDAMENTAL_CHART_QUERY_VALUES: Record<EquityFundamentalChartOption, string | undefined> = {
	Revenue: undefined,
	'Holders Revenue': 'holders-revenue',
	Earnings: 'earnings'
}
const EQUITY_FUNDAMENTAL_CHART_API_KEYS: Record<EquityFundamentalChartOption, EquitiesDimensionMetric> = {
	Revenue: 'revenue',
	'Holders Revenue': 'holdersRevenue',
	Earnings: 'earnings'
}

const EQUITY_DIMENSION_PERIOD_OPTIONS = ['Quarterly', 'Annual'] as const
type EquityDimensionPeriodOption = (typeof EQUITY_DIMENSION_PERIOD_OPTIONS)[number]
const DEFAULT_EQUITY_DIMENSION_PERIOD: EquityDimensionPeriodOption = 'Quarterly'
const EQUITY_DIMENSION_PERIOD_QUERY_VALUES: Record<EquityDimensionPeriodOption, string | undefined> = {
	Quarterly: undefined,
	Annual: 'annual'
}
const EQUITY_DIMENSION_PERIOD_API_KEYS: Record<EquityDimensionPeriodOption, EquitiesDimensionPeriod> = {
	Quarterly: 'quarterly',
	Annual: 'annual'
}

const TIMEFRAME_MS: Record<EquitiesPriceHistoryTimeframe, number | null> = {
	'1W': 7 * 86_400_000,
	'1M': 30 * 86_400_000,
	'6M': 180 * 86_400_000,
	'1Y': 365 * 86_400_000,
	'5Y': 5 * 365 * 86_400_000,
	MAX: null
}

const TAB_LABELS: Record<EquityTab, string> = {
	overview: 'Overview',
	financials: 'Financials',
	filings: 'Filings'
}

function formatMetricValue(value: unknown, symbol?: string): string {
	return abbreviateNumber(value, 2, symbol) ?? '-'
}

function ChangeMetricValue({ value, symbol }: { value: number | null; symbol?: string }) {
	const className = value == null || value === 0 ? undefined : value > 0 ? 'text-(--success)' : 'text-(--error)'
	return <span className={className}>{formatMetricValue(value, symbol)}</span>
}

function getFundamentalChartFromQuery(value?: string): EquityFundamentalChartOption {
	const match = EQUITY_FUNDAMENTAL_CHART_OPTIONS.find(
		(option) => EQUITY_FUNDAMENTAL_CHART_QUERY_VALUES[option] === value
	)
	return match ?? DEFAULT_EQUITY_FUNDAMENTAL_CHART
}

function getDimensionPeriodFromQuery(value?: string): EquityDimensionPeriodOption {
	const match = EQUITY_DIMENSION_PERIOD_OPTIONS.find((option) => EQUITY_DIMENSION_PERIOD_QUERY_VALUES[option] === value)
	return match ?? DEFAULT_EQUITY_DIMENSION_PERIOD
}

function EquityKeyMetrics({ summary }: { summary: IEquitiesSummaryResponse }) {
	return (
		<div className="flex flex-col">
			<MetricRow
				label={defs.currentPrice.label}
				tooltip={defs.currentPrice.description}
				value={formatMetricValue(summary.currentPrice, '$')}
			/>
			<MetricRow
				label={defs.revenueTTM.label}
				tooltip={defs.revenueTTM.description}
				value={formatMetricValue(summary.revenueTTM, '$')}
			/>
			<MetricRow
				label={defs.holdersRevenueTTM.label}
				tooltip={defs.holdersRevenueTTM.description}
				value={formatMetricValue(summary.holdersRevenueTTM, '$')}
			/>
			<MetricRow
				label={defs.grossProfitTTM.label}
				tooltip={defs.grossProfitTTM.description}
				value={formatMetricValue(summary.grossProfitTTM, '$')}
			/>
			<MetricRow
				label={defs.earningsTTM.label}
				tooltip={defs.earningsTTM.description}
				value={formatMetricValue(summary.earningsTTM, '$')}
			/>
			<MetricRow
				label={defs.ebitdaTTM.label}
				tooltip={defs.ebitdaTTM.description}
				value={formatMetricValue(summary.ebitdaTTM, '$')}
			/>
			{summary.dividendYield != null ? (
				<MetricRow
					label={defs.dividendYield.label}
					tooltip={defs.dividendYield.description}
					value={formatMetricValue(summary.dividendYield, '%')}
				/>
			) : null}
			{summary.holdersYield != null ? (
				<MetricRow
					label={defs.holdersYield.label}
					tooltip={defs.holdersYield.description}
					value={formatMetricValue(summary.holdersYield, '%')}
				/>
			) : null}
			<MetricRow
				label={defs.totalAssets.label}
				tooltip={defs.totalAssets.description}
				value={formatMetricValue(summary.totalAssets, '$')}
			/>
		</div>
	)
}

function EquityTitle({ ticker, country, name }: Pick<IEquityTickerPageProps, 'ticker' | 'country' | 'name'>) {
	return (
		<span className="flex items-center gap-2">
			<TokenLogo src={equityIconUrl(ticker, country)} fallbackSrc={equityIconUrl(ticker)} alt={`Logo of ${ticker}`} />
			<h1 className="flex flex-wrap items-center gap-2 text-xl">
				<span className="font-bold">{name}</span>
				<span className="font-normal text-(--text-disabled)">
					({ticker}:{country})
				</span>
			</h1>
		</span>
	)
}

export function EquityTickerPage(props: IEquityTickerPageProps) {
	const router = useRouter()
	const { chartInstance: priceChartInstance, handleChartReady: handlePriceChartReady } = useGetChartInstance()
	const { chartInstance: fundamentalsChartInstance, handleChartReady: handleFundamentalsChartReady } =
		useGetChartInstance()

	const activeTab = useMemo<EquityTab>(() => {
		const tab = readSingleQueryValue(router.query.tab)
		return tab && TABS.includes(tab as EquityTab) ? (tab as EquityTab) : 'financials'
	}, [router.query.tab])

	const activeTimeframe = useMemo<EquitiesPriceHistoryTimeframe>(() => {
		return (
			EQUITIES_PRICE_HISTORY_TIMEFRAMES.find((t) => t === readSingleQueryValue(router.query.timeframe)) ??
			DEFAULT_PRICE_HISTORY_TIMEFRAME
		)
	}, [router.query.timeframe])

	const activeFundamentalChart = useMemo<EquityFundamentalChartOption>(() => {
		return getFundamentalChartFromQuery(readSingleQueryValue(router.query.fundamentals))
	}, [router.query.fundamentals])

	const activeDimensionPeriod = useMemo<EquityDimensionPeriodOption>(() => {
		return getDimensionPeriodFromQuery(readSingleQueryValue(router.query.fundamentalsPeriod))
	}, [router.query.fundamentalsPeriod])

	const activePriceHistoryChart = useMemo(() => {
		const duration = TIMEFRAME_MS[activeTimeframe]
		if (!duration) return props.priceHistoryChart
		const latestPoint = props.priceHistoryChart.dataset.source.at(-1)
		if (!latestPoint) return props.priceHistoryChart
		const cutoff = (latestPoint.timestamp as number) - duration
		const source: typeof props.priceHistoryChart.dataset.source = []
		for (const point of props.priceHistoryChart.dataset.source) {
			if ((point.timestamp as number) >= cutoff) source.push(point)
		}
		return { ...props.priceHistoryChart, dataset: { ...props.priceHistoryChart.dataset, source } }
	}, [activeTimeframe, props.priceHistoryChart])

	const activeFundamentalsChart = useMemo(() => {
		return buildEquitiesDimensionsChart(
			props.dimensions,
			EQUITY_FUNDAMENTAL_CHART_API_KEYS[activeFundamentalChart],
			EQUITY_DIMENSION_PERIOD_API_KEYS[activeDimensionPeriod]
		)
	}, [activeDimensionPeriod, activeFundamentalChart, props.dimensions])

	const setActiveTab = (tab: EquityTab) => {
		void pushShallowQuery(router, { tab: tab === 'financials' ? undefined : tab })
	}

	const setActiveTimeframe = (timeframe: EquitiesPriceHistoryTimeframe) => {
		void pushShallowQuery(router, {
			timeframe: timeframe === DEFAULT_PRICE_HISTORY_TIMEFRAME ? undefined : timeframe
		})
	}

	const setActiveFundamentalChart = (chart: EquityFundamentalChartOption) => {
		void pushShallowQuery(router, {
			fundamentals: EQUITY_FUNDAMENTAL_CHART_QUERY_VALUES[chart]
		})
	}

	const setActiveDimensionPeriod = (period: EquityDimensionPeriodOption) => {
		void pushShallowQuery(router, {
			fundamentalsPeriod: EQUITY_DIMENSION_PERIOD_QUERY_VALUES[period]
		})
	}

	const exportTitle = `${props.ticker} Price History (${activeTimeframe})`
	const exportFilename = `${props.ticker.toLowerCase()}-price-history-${activeTimeframe.toLowerCase()}`
	const fundamentalsExportTitle = `${props.ticker} ${activeFundamentalChart} (${activeDimensionPeriod})`
	const fundamentalsExportFilename = `${props.ticker.toLowerCase()}-${activeFundamentalChart.toLowerCase().replaceAll(' ', '-')}-${activeDimensionPeriod.toLowerCase()}`

	return (
		<article className="flex flex-col gap-2">
			<div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
				{/* Desktop: left stats panel */}
				<div className="col-span-1 hidden flex-col gap-6 rounded-md border border-(--cards-border) bg-(--cards-bg) p-2 xl:flex xl:min-h-[360px]">
					<EquityTitle ticker={props.ticker} country={props.country} name={props.name} />
					<p className="flex flex-col">
						<span className="text-(--text-label)">{defs.marketCap.label}</span>
						<span className="min-h-8 font-jetbrains text-2xl font-semibold">
							{formatMetricValue(props.summary.marketCap, '$')}
						</span>
					</p>
					<EquityKeyMetrics summary={props.summary} />
				</div>

				<div className="col-span-1 grid grid-cols-2 gap-2 xl:col-[2/-1]">
					<div className="col-span-full flex flex-col gap-6 rounded-md border border-(--cards-border) bg-(--cards-bg) p-2">
						{/* Mobile: name + market cap */}
						<div className="flex flex-col gap-6 xl:hidden">
							<EquityTitle ticker={props.ticker} country={props.country} name={props.name} />
							<p className="flex flex-col">
								<span className="text-(--text-label)">{defs.marketCap.label}</span>
								<span className="min-h-8 font-jetbrains text-2xl font-semibold">
									{formatMetricValue(props.summary.marketCap, '$')}
								</span>
							</p>
						</div>

						<div className="flex flex-wrap items-center justify-end gap-2">
							<h2 className="mr-auto text-base font-semibold">Price History</h2>
							<TagGroup
								selectedValue={activeTimeframe}
								setValue={setActiveTimeframe}
								values={EQUITIES_PRICE_HISTORY_TIMEFRAMES}
							/>
							<ChartExportButtons chartInstance={priceChartInstance} filename={exportFilename} title={exportTitle} />
						</div>
						<Suspense fallback={<div className="min-h-[360px]" />}>
							<MultiSeriesChart2
								dataset={activePriceHistoryChart.dataset}
								charts={activePriceHistoryChart.charts}
								chartOptions={{ yAxis: { scale: true } }}
								valueSymbol="$"
								title=""
								hideDataZoom={activePriceHistoryChart.dataset.source.length < 2}
								onReady={handlePriceChartReady}
							/>
						</Suspense>
					</div>

					{/* Mobile: key metrics below chart */}
					<div className="col-span-full flex flex-col gap-6 rounded-md border border-(--cards-border) bg-(--cards-bg) p-2 xl:hidden">
						<EquityKeyMetrics summary={props.summary} />
					</div>
				</div>

				<div className="col-span-full flex flex-col gap-6 rounded-md border border-(--cards-border) bg-(--cards-bg) p-2">
					<div className="flex flex-wrap items-center gap-2">
						<TagGroup
							selectedValue={activeFundamentalChart}
							setValue={setActiveFundamentalChart}
							values={EQUITY_FUNDAMENTAL_CHART_OPTIONS}
						/>
						<div className="ml-auto flex flex-wrap items-center justify-end gap-2">
							<TagGroup
								selectedValue={activeDimensionPeriod}
								setValue={setActiveDimensionPeriod}
								values={EQUITY_DIMENSION_PERIOD_OPTIONS}
							/>
							<ChartExportButtons
								chartInstance={fundamentalsChartInstance}
								filename={fundamentalsExportFilename}
								title={fundamentalsExportTitle}
							/>
						</div>
					</div>
					<Suspense fallback={<div className="min-h-[320px]" />}>
						<MultiSeriesChart2
							dataset={activeFundamentalsChart.dataset}
							charts={activeFundamentalsChart.charts}
							chartOptions={{ yAxis: { scale: true } }}
							valueSymbol="$"
							title=""
							hideDataZoom={activeFundamentalsChart.dataset.source.length < 2}
							onReady={handleFundamentalsChartReady}
						/>
					</Suspense>
				</div>
			</div>

			<nav className="flex w-full overflow-x-auto text-xs font-medium" role="tablist" aria-label="Ticker sections">
				{TABS.map((tab) => (
					<button
						key={tab}
						type="button"
						role="tab"
						aria-selected={activeTab === tab}
						onClick={() => setActiveTab(tab)}
						data-active={activeTab === tab}
						className="shrink-0 border-b-2 border-(--form-control-border) px-4 py-1 whitespace-nowrap hover:bg-(--btn-hover-bg) focus-visible:bg-(--btn-hover-bg) data-[active=true]:border-(--primary)"
					>
						{TAB_LABELS[tab]}
					</button>
				))}
			</nav>

			{activeTab === 'overview' ? (
				<div className="grid grid-cols-1 gap-2 xl:grid-cols-2" role="tabpanel" aria-label="Overview">
					<section className="flex flex-col gap-3 rounded-md border border-(--cards-border) bg-(--cards-bg) p-3">
						<h2 className="text-base font-semibold">Market Data</h2>
						<div className="flex flex-col">
							<MetricRow
								label={defs.priceChangePercentage1d.label}
								tooltip={defs.priceChangePercentage1d.description}
								value={<ChangeMetricValue value={props.summary.priceChangePercentage1d} symbol="%" />}
							/>
							<MetricRow
								label={defs.priceChangePercentage7d.label}
								tooltip={defs.priceChangePercentage7d.description}
								value={<ChangeMetricValue value={props.summary.priceChangePercentage7d} symbol="%" />}
							/>
							<MetricRow
								label={defs.priceChangePercentage1m.label}
								tooltip={defs.priceChangePercentage1m.description}
								value={<ChangeMetricValue value={props.summary.priceChangePercentage1m} symbol="%" />}
							/>
							<MetricRow
								label={defs.priceChange1d.label}
								tooltip={defs.priceChange1d.description}
								value={<ChangeMetricValue value={props.summary.priceChange1d} symbol="$" />}
							/>
							<MetricRow
								label={defs.marketCapChange1d.label}
								tooltip={defs.marketCapChange1d.description}
								value={<ChangeMetricValue value={props.summary.marketCapChange1d} symbol="$" />}
							/>
							<MetricRow
								label={defs.volume.label}
								tooltip={defs.volume.description}
								value={formatMetricValue(props.summary.volume)}
							/>
							<MetricRow
								label={defs.trailingPE.label}
								tooltip={defs.trailingPE.description}
								value={formatMetricValue(props.summary.trailingPE)}
							/>
							<MetricRow
								label={defs.priceToRevenue.label}
								tooltip={defs.priceToRevenue.description}
								value={formatMetricValue(props.summary.priceToRevenue)}
							/>
							<MetricRow
								label={defs.priceToBook.label}
								tooltip={defs.priceToBook.description}
								value={formatMetricValue(props.summary.priceToBook)}
							/>
							<MetricRow
								label={defs.enterpriseValueToEbitda.label}
								tooltip={defs.enterpriseValueToEbitda.description}
								value={formatMetricValue(props.summary.enterpriseValueToEbitda)}
							/>
							<MetricRow
								label="52 Week Range"
								value={`${formatMetricValue(props.summary.fiftyTwoWeekLow, '$')} - ${formatMetricValue(props.summary.fiftyTwoWeekHigh, '$')}`}
							/>
							<MetricRow
								label={defs.earningsTTM.label}
								tooltip={defs.earningsTTM.description}
								value={formatMetricValue(props.summary.earningsTTM, '$')}
							/>
							<MetricRow
								label={defs.enterpriseValue.label}
								tooltip={defs.enterpriseValue.description}
								value={formatMetricValue(props.summary.enterpriseValue, '$')}
							/>
							<MetricRow
								label={defs.totalAssets.label}
								tooltip={defs.totalAssets.description}
								value={formatMetricValue(props.summary.totalAssets, '$')}
							/>
						</div>
					</section>

					<section className="flex flex-col gap-3 rounded-md border border-(--cards-border) bg-(--cards-bg) p-3">
						<h2 className="text-base font-semibold">Profile</h2>
						<div className="flex flex-col">
							<MetricRow label="Ticker" value={props.ticker} />
							<MetricRow
								label="Country"
								value={
									<span className="flex items-center gap-2">
										<TokenLogo src={equityCountryFlagUrl(props.country)} alt={`${props.country} flag`} />
										{props.country}
									</span>
								}
							/>
							<MetricRow label="Company" value={props.name} />
							<MetricRow label="Sector" value={props.metadata.sector || '—'} />
							<MetricRow label="Industry" value={props.metadata.industry || '—'} />
							<MetricRow
								label={defs.employeeCount.label}
								tooltip={defs.employeeCount.description}
								value={formatMetricValue(props.metadata.employeeCount)}
							/>
							<MetricRow
								label="Website"
								value={
									props.metadata.website ? (
										<a
											href={props.metadata.website}
											target="_blank"
											rel="noopener noreferrer"
											className="text-(--link-text) hover:underline"
										>
											{props.metadata.website}
										</a>
									) : (
										'—'
									)
								}
							/>
							{props.metadata.cik ? (
								<MetricRow label="CIK" tooltip="Central Index Key" value={props.metadata.cik} />
							) : null}
							<MetricRow
								label="Coverage since"
								value={<span suppressHydrationWarning>{formatEquitiesDate(props.metadata.startDate)}</span>}
							/>
							<MetricRow
								label="Last Updated"
								value={<span suppressHydrationWarning>{formatEquitiesDateTime(props.summary.updatedAt)}</span>}
							/>
						</div>
						{props.metadata.description ? (
							<p className="text-sm leading-relaxed text-(--text-secondary)">{props.metadata.description}</p>
						) : null}
					</section>
				</div>
			) : null}

			{activeTab === 'financials' ? <EquitiesFinancialsTable statements={props.statements} /> : null}
			{activeTab === 'filings' ? (
				<EquitiesFilingsTable filings={props.filings} filingForms={props.filingForms} />
			) : null}

			<footer className="rounded-md border border-(--cards-border) bg-(--cards-bg) p-3">
				<h2 className="text-sm font-semibold">Attribution</h2>
				<p className="mt-1 text-xs text-(--text-disabled)">
					Market data provided by{' '}
					<a href="https://twelvedata.com" target="_blank" rel="noopener noreferrer" className="underline">
						Twelve Data
					</a>
					. Filings and statements data from SEC EDGAR.
				</p>
			</footer>
		</article>
	)
}
