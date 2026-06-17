import {
	type ColumnDef,
	type ColumnFiltersState,
	createColumnHelper,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type PaginationState,
	type SortingState,
	type VisibilityState,
	useReactTable
} from '@tanstack/react-table'
import { useRouter } from 'next/router'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { CSVDownloadButton } from '~/components/ButtonStyled/CsvButton'
import { Icon } from '~/components/Icon'
import { BasicLink } from '~/components/Link'
import { SelectWithCombobox } from '~/components/Select/SelectWithCombobox'
import { PaginatedTable, usePaginatedTableDisplayRowNumber } from '~/components/Table/PaginatedTable'
import { prepareTableCsv, useTableSearch } from '~/components/Table/utils'
import { TokenLogo } from '~/components/TokenLogo'
import defs from '~/public/equities-definitions.json'
import { abbreviateNumber } from '~/utils'
import { equityCountryFlagUrl, equityIconUrl } from '~/utils/icons'
import { pushShallowQuery, readSingleQueryValue } from '~/utils/routerQuery'
import type { IEquitiesListCompanyRow, IEquitiesListPageProps } from './types'
import { formatEquitiesDateTime } from './utils'

const columnHelper = createColumnHelper<IEquitiesListCompanyRow>()
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 50

function formatNumber(value: unknown, symbol?: string): string {
	return abbreviateNumber(value, 2, symbol) ?? '-'
}

function ChangePercent({ value }: { value: number | null }) {
	const className = value == null || value === 0 ? undefined : value > 0 ? 'text-(--success)' : 'text-(--error)'
	return <span className={className}>{formatNumber(value, '%')}</span>
}

function EquityTickerCell({ row }: { row: { id: string; original: IEquitiesListCompanyRow } }) {
	const rowIndex = usePaginatedTableDisplayRowNumber(row.id)

	return (
		<span className="relative flex items-center gap-2">
			<span className="w-6 shrink-0 text-right text-(--text-secondary)" aria-hidden="true">
				{rowIndex}
			</span>
			<TokenLogo
				src={equityIconUrl(row.original.ticker, row.original.country)}
				fallbackSrc={equityIconUrl(row.original.ticker)}
				data-lgonly
				alt={`Logo of ${row.original.ticker}`}
			/>
			<BasicLink href={row.original.href} className="font-medium text-(--link-text)">
				{row.original.ticker}
			</BasicLink>
		</span>
	)
}

const columns: ColumnDef<IEquitiesListCompanyRow, any>[] = [
	columnHelper.accessor('ticker', {
		header: 'Ticker',
		enableSorting: false,
		cell: ({ row }) => <EquityTickerCell row={row} />,
		meta: {
			headerClassName: 'w-[124px] min-w-[124px]',
			align: 'start'
		}
	}),
	columnHelper.accessor('country', {
		header: 'Country',
		enableSorting: false,
		cell: ({ getValue }) => (
			<span className="flex items-center gap-2">
				<TokenLogo src={equityCountryFlagUrl(getValue())} alt={`${getValue()} flag`} />
				<span>{getValue()}</span>
			</span>
		),
		meta: {
			headerClassName: 'w-[108px] min-w-[108px]',
			align: 'start'
		}
	}),
	columnHelper.accessor('name', {
		header: 'Company',
		enableSorting: false,
		filterFn: (row, _columnId, filterValue) => {
			const query = String(filterValue).trim().toLowerCase()
			if (!query) return true
			return row.original.name.toLowerCase().includes(query) || row.original.ticker.toLowerCase().includes(query)
		},
		cell: ({ getValue, row }) => (
			<BasicLink href={row.original.href} className="text-(--link-text)">
				{getValue()}
			</BasicLink>
		),
		meta: {
			headerClassName: 'w-[168px] min-w-[168px]',
			align: 'start'
		}
	}),
	columnHelper.accessor('sector', {
		header: 'Sector',
		enableSorting: false,
		meta: {
			headerClassName: 'w-[124px] min-w-[124px]',
			align: 'start'
		}
	}),
	columnHelper.accessor('industry', {
		header: 'Industry',
		enableSorting: false,
		meta: {
			headerClassName: 'w-[144px] min-w-[144px]',
			align: 'start'
		}
	}),
	columnHelper.accessor('currentPrice', {
		header: defs.currentPrice.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[92px] min-w-[92px]',
			align: 'end',
			headerHelperText: defs.currentPrice.description
		}
	}),
	columnHelper.accessor('priceChangePercentage1d', {
		header: defs.priceChangePercentage1d.label,
		cell: ({ getValue }) => <ChangePercent value={getValue()} />,
		meta: {
			headerClassName: 'w-[156px] min-w-[156px]',
			align: 'end',
			headerHelperText: defs.priceChangePercentage1d.description
		}
	}),
	columnHelper.accessor('priceChangePercentage7d', {
		header: defs.priceChangePercentage7d.label,
		cell: ({ getValue }) => <ChangePercent value={getValue()} />,
		meta: {
			headerClassName: 'w-[158px] min-w-[158px]',
			align: 'end',
			headerHelperText: defs.priceChangePercentage7d.description
		}
	}),
	columnHelper.accessor('priceChangePercentage1m', {
		header: defs.priceChangePercentage1m.label,
		cell: ({ getValue }) => <ChangePercent value={getValue()} />,
		meta: {
			headerClassName: 'w-[160px] min-w-[160px]',
			align: 'end',
			headerHelperText: defs.priceChangePercentage1m.description
		}
	}),
	columnHelper.accessor('volume', {
		header: defs.volume.label,
		cell: ({ getValue }) => formatNumber(getValue()),
		meta: {
			headerClassName: 'w-[112px] min-w-[112px]',
			align: 'end',
			headerHelperText: defs.volume.description
		}
	}),
	columnHelper.accessor('marketCap', {
		header: defs.marketCap.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[138px] min-w-[138px]',
			align: 'end',
			headerHelperText: defs.marketCap.description
		}
	}),
	columnHelper.accessor('circulatingMarketCap', {
		header: defs.circulatingMarketCap.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[166px] min-w-[166px]',
			align: 'end',
			headerHelperText: defs.circulatingMarketCap.description
		}
	}),
	columnHelper.accessor('enterpriseValue', {
		header: defs.enterpriseValue.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[174px] min-w-[174px]',
			align: 'end',
			headerHelperText: defs.enterpriseValue.description
		}
	}),
	columnHelper.accessor('trailingPE', {
		header: defs.trailingPE.label,
		cell: ({ getValue }) => formatNumber(getValue()),
		meta: {
			headerClassName: 'w-[72px] min-w-[72px]',
			align: 'end',
			headerHelperText: defs.trailingPE.description
		}
	}),
	columnHelper.accessor('priceToRevenue', {
		header: defs.priceToRevenue.label,
		cell: ({ getValue }) => formatNumber(getValue()),
		meta: {
			headerClassName: 'w-[74px] min-w-[74px]',
			align: 'end',
			headerHelperText: defs.priceToRevenue.description
		}
	}),
	columnHelper.accessor('dividendYield', {
		header: defs.dividendYield.label,
		cell: ({ getValue }) => formatNumber(getValue(), '%'),
		meta: {
			headerClassName: 'w-[150px] min-w-[150px]',
			align: 'end',
			headerHelperText: defs.dividendYield.description
		}
	}),
	columnHelper.accessor('holdersYield', {
		header: defs.holdersYield.label,
		cell: ({ getValue }) => formatNumber(getValue(), '%'),
		meta: {
			headerClassName: 'w-[146px] min-w-[146px]',
			align: 'end',
			headerHelperText: defs.holdersYield.description
		}
	}),
	columnHelper.accessor('priceToBook', {
		header: defs.priceToBook.label,
		cell: ({ getValue }) => formatNumber(getValue()),
		meta: {
			headerClassName: 'w-[76px] min-w-[76px]',
			align: 'end',
			headerHelperText: defs.priceToBook.description
		}
	}),
	columnHelper.accessor('enterpriseValueToEbitda', {
		header: defs.enterpriseValueToEbitda.label,
		cell: ({ getValue }) => formatNumber(getValue()),
		meta: {
			headerClassName: 'w-[124px] min-w-[124px]',
			align: 'end',
			headerHelperText: defs.enterpriseValueToEbitda.description
		}
	}),
	columnHelper.accessor('operatingProfitMarginTTM', {
		header: defs.operatingProfitMarginTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '%'),
		meta: {
			headerClassName: 'w-[170px] min-w-[170px]',
			align: 'end',
			headerHelperText: defs.operatingProfitMarginTTM.description
		}
	}),
	columnHelper.accessor('revenueTTM', {
		header: defs.revenueTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[162px] min-w-[162px]',
			align: 'end',
			headerHelperText: defs.revenueTTM.description
		}
	}),
	columnHelper.accessor('grossProfitTTM', {
		header: defs.grossProfitTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[190px] min-w-[190px]',
			align: 'end',
			headerHelperText: defs.grossProfitTTM.description
		}
	}),
	columnHelper.accessor('earningsTTM', {
		header: defs.earningsTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[168px] min-w-[168px]',
			align: 'end',
			headerHelperText: defs.earningsTTM.description
		}
	}),
	columnHelper.accessor('ebitdaTTM', {
		header: defs.ebitdaTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[148px] min-w-[148px]',
			align: 'end',
			headerHelperText: defs.ebitdaTTM.description
		}
	}),
	columnHelper.accessor('holdersRevenueTTM', {
		header: defs.holdersRevenueTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[218px] min-w-[218px]',
			align: 'end',
			headerHelperText: defs.holdersRevenueTTM.description
		}
	}),
	columnHelper.accessor('holderEarningsTTM', {
		header: defs.holderEarningsTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[216px] min-w-[216px]',
			align: 'end',
			headerHelperText: defs.holderEarningsTTM.description
		}
	}),
	columnHelper.accessor('dividendsTTM', {
		header: defs.dividendsTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[158px] min-w-[158px]',
			align: 'end',
			headerHelperText: defs.dividendsTTM.description
		}
	}),
	columnHelper.accessor('stockRepurchaseTTM', {
		header: defs.stockRepurchaseTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[150px] min-w-[150px]',
			align: 'end',
			headerHelperText: defs.stockRepurchaseTTM.description
		}
	}),
	columnHelper.accessor('stockIssuanceTTM', {
		header: defs.stockIssuanceTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[188px] min-w-[188px]',
			align: 'end',
			headerHelperText: defs.stockIssuanceTTM.description
		}
	}),
	columnHelper.accessor('stockBasedCompensationTTM', {
		header: defs.stockBasedCompensationTTM.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[184px] min-w-[184px]',
			align: 'end',
			headerHelperText: defs.stockBasedCompensationTTM.description
		}
	}),
	columnHelper.accessor('cashAndCashEquivalents', {
		header: defs.cashAndCashEquivalents.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[82px] min-w-[82px]',
			align: 'end',
			headerHelperText: defs.cashAndCashEquivalents.description
		}
	}),
	columnHelper.accessor('totalAssets', {
		header: defs.totalAssets.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[132px] min-w-[132px]',
			align: 'end',
			headerHelperText: defs.totalAssets.description
		}
	}),
	columnHelper.accessor('totalLiabilities', {
		header: defs.totalLiabilities.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[162px] min-w-[162px]',
			align: 'end',
			headerHelperText: defs.totalLiabilities.description
		}
	}),
	columnHelper.accessor('totalShareholdersEquity', {
		header: defs.totalShareholdersEquity.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[190px] min-w-[190px]',
			align: 'end',
			headerHelperText: defs.totalShareholdersEquity.description
		}
	}),
	columnHelper.accessor('totalDebt', {
		header: defs.totalDebt.label,
		cell: ({ getValue }) => formatNumber(getValue(), '$'),
		meta: {
			headerClassName: 'w-[124px] min-w-[124px]',
			align: 'end',
			headerHelperText: defs.totalDebt.description
		}
	}),
	columnHelper.accessor('circulatingSupply', {
		header: defs.circulatingSupply.label,
		cell: ({ getValue }) => formatNumber(getValue()),
		meta: {
			headerClassName: 'w-[136px] min-w-[136px]',
			align: 'end',
			headerHelperText: defs.circulatingSupply.description
		}
	}),
	columnHelper.accessor('totalSupply', {
		header: defs.totalSupply.label,
		cell: ({ getValue }) => formatNumber(getValue()),
		meta: {
			headerClassName: 'w-[138px] min-w-[138px]',
			align: 'end',
			headerHelperText: defs.totalSupply.description
		}
	}),
	columnHelper.accessor('employeeCount', {
		header: defs.employeeCount.label,
		cell: ({ getValue }) => formatNumber(getValue()),
		meta: {
			headerClassName: 'w-[118px] min-w-[118px]',
			align: 'end',
			headerHelperText: defs.employeeCount.description
		}
	})
]

const EQUITIES_PRESETS = [
	'Market Cap',
	'Earnings',
	'Revenue',
	'P/E ratio',
	'Dividend %',
	'Holder Yield',
	'Operating Margin',
	'Enterprise Value',
	'Total assets',
	'Total liabilities',
	'Price to Book'
] as const

type EquitiesPreset = (typeof EQUITIES_PRESETS)[number]

const PRESET_QUERY_SLUGS: Record<EquitiesPreset, string | undefined> = {
	'Market Cap': undefined,
	Earnings: 'earnings',
	Revenue: 'revenue',
	'P/E ratio': 'pe-ratio',
	'Dividend %': 'dividend',
	'Holder Yield': 'holder-yield',
	'Operating Margin': 'operating-margin',
	'Enterprise Value': 'enterprise-value',
	'Total assets': 'total-assets',
	'Total liabilities': 'total-liabilities',
	'Price to Book': 'price-to-book'
}

const DATA_COLUMN_IDS = [
	'country',
	'sector',
	'industry',
	'currentPrice',
	'priceChangePercentage1d',
	'priceChangePercentage7d',
	'priceChangePercentage1m',
	'volume',
	'marketCap',
	'circulatingMarketCap',
	'enterpriseValue',
	'trailingPE',
	'priceToRevenue',
	'dividendYield',
	'holdersYield',
	'priceToBook',
	'enterpriseValueToEbitda',
	'operatingProfitMarginTTM',
	'revenueTTM',
	'grossProfitTTM',
	'earningsTTM',
	'ebitdaTTM',
	'holdersRevenueTTM',
	'holderEarningsTTM',
	'dividendsTTM',
	'stockRepurchaseTTM',
	'stockIssuanceTTM',
	'stockBasedCompensationTTM',
	'cashAndCashEquivalents',
	'totalAssets',
	'totalLiabilities',
	'totalShareholdersEquity',
	'totalDebt',
	'circulatingSupply',
	'totalSupply',
	'employeeCount'
] as const

const PRESET_VISIBLE_COLUMNS: Record<EquitiesPreset, readonly string[]> = {
	'Market Cap': [
		'country',
		'sector',
		'industry',
		'currentPrice',
		'priceChangePercentage1d',
		'priceChangePercentage7d',
		'priceChangePercentage1m',
		'volume',
		'marketCap'
	],
	Earnings: [
		'country',
		'sector',
		'earningsTTM',
		'ebitdaTTM',
		'holderEarningsTTM',
		'trailingPE',
		'enterpriseValueToEbitda',
		'marketCap'
	],
	Revenue: [
		'country',
		'sector',
		'revenueTTM',
		'grossProfitTTM',
		'holdersRevenueTTM',
		'priceToRevenue',
		'operatingProfitMarginTTM',
		'marketCap'
	],
	'P/E ratio': ['country', 'sector', 'trailingPE', 'currentPrice', 'earningsTTM', 'marketCap', 'priceToBook'],
	'Dividend %': ['country', 'sector', 'dividendYield', 'currentPrice', 'marketCap', 'trailingPE'],
	'Holder Yield': [
		'country',
		'sector',
		'holdersYield',
		'dividendsTTM',
		'stockRepurchaseTTM',
		'stockIssuanceTTM',
		'marketCap'
	],
	'Operating Margin': [
		'country',
		'sector',
		'operatingProfitMarginTTM',
		'revenueTTM',
		'grossProfitTTM',
		'earningsTTM',
		'marketCap'
	],
	'Enterprise Value': [
		'country',
		'sector',
		'enterpriseValue',
		'enterpriseValueToEbitda',
		'ebitdaTTM',
		'totalDebt',
		'cashAndCashEquivalents',
		'marketCap'
	],
	'Total assets': ['country', 'sector', 'totalAssets', 'totalLiabilities', 'totalDebt', 'marketCap', 'currentPrice'],
	'Total liabilities': [
		'country',
		'sector',
		'totalLiabilities',
		'totalAssets',
		'totalDebt',
		'marketCap',
		'currentPrice'
	],
	'Price to Book': ['country', 'sector', 'priceToBook', 'currentPrice', 'marketCap', 'totalAssets']
}

const PRESET_SORTING: Record<EquitiesPreset, SortingState> = {
	'Market Cap': [{ id: 'marketCap', desc: true }],
	Earnings: [{ id: 'earningsTTM', desc: true }],
	Revenue: [{ id: 'revenueTTM', desc: true }],
	'P/E ratio': [{ id: 'trailingPE', desc: true }],
	'Dividend %': [{ id: 'dividendYield', desc: true }],
	'Holder Yield': [{ id: 'holdersYield', desc: true }],
	'Operating Margin': [{ id: 'operatingProfitMarginTTM', desc: true }],
	'Enterprise Value': [{ id: 'enterpriseValue', desc: true }],
	'Total assets': [{ id: 'totalAssets', desc: true }],
	'Total liabilities': [{ id: 'totalLiabilities', desc: true }],
	'Price to Book': [{ id: 'priceToBook', desc: true }]
}

function getPresetFromQuery(value?: string): EquitiesPreset {
	if (!value) return 'Market Cap'
	const match = EQUITIES_PRESETS.find((p) => PRESET_QUERY_SLUGS[p] === value)
	return match ?? 'Market Cap'
}

function buildPresetVisibility(preset: EquitiesPreset): VisibilityState {
	const visible = new Set(PRESET_VISIBLE_COLUMNS[preset])
	const visibility: VisibilityState = {}
	for (const id of DATA_COLUMN_IDS) {
		visibility[id] = visible.has(id)
	}
	return visibility
}

function getUniqueValues(companies: IEquitiesListCompanyRow[], key: 'country' | 'sector' | 'industry'): string[] {
	const values = new Set<string>()
	for (const company of companies) {
		if (company[key]) values.add(company[key])
	}
	return Array.from(values).sort((a, b) => a.localeCompare(b))
}

export function EquitiesOverview({ companies, updatedAt }: IEquitiesListPageProps) {
	const router = useRouter()
	const presetQueryValue = readSingleQueryValue(router.query.rankBy)
	const activePreset = useMemo(() => getPresetFromQuery(presetQueryValue), [presetQueryValue])
	const countryOptions = useMemo(() => getUniqueValues(companies, 'country'), [companies])
	const sectorOptions = useMemo(() => getUniqueValues(companies, 'sector'), [companies])
	const industryOptions = useMemo(() => getUniqueValues(companies, 'industry'), [companies])
	const [selectedCountries, setSelectedCountries] = useState(countryOptions)
	const [selectedSectors, setSelectedSectors] = useState(sectorOptions)
	const [selectedIndustries, setSelectedIndustries] = useState(industryOptions)
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [sorting, setSorting] = useState<SortingState>(PRESET_SORTING[activePreset])
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => buildPresetVisibility(activePreset))
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE })
	const filteredCompanies = useMemo(() => {
		if (selectedCountries.length === 0 || selectedSectors.length === 0 || selectedIndustries.length === 0) return []

		const countries = new Set(selectedCountries)
		const sectors = new Set(selectedSectors)
		const industries = new Set(selectedIndustries)
		const filtered: IEquitiesListCompanyRow[] = []

		for (const company of companies) {
			if (!countries.has(company.country)) continue
			if (!sectors.has(company.sector)) continue
			if (!industries.has(company.industry)) continue
			filtered.push(company)
		}

		return filtered
	}, [companies, selectedCountries, selectedSectors, selectedIndustries])

	const table = useReactTable({
		data: filteredCompanies,
		columns,
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			pagination
		},
		defaultColumn: {
			sortUndefined: 'last'
		},
		enableSortingRemoval: false,
		onSortingChange: (updater) => startTransition(() => setSorting(updater)),
		onColumnFiltersChange: (updater) => startTransition(() => setColumnFilters(updater)),
		onColumnVisibilityChange: (updater) => startTransition(() => setColumnVisibility(updater)),
		onPaginationChange: (updater) => startTransition(() => setPagination(updater)),
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	})
	const [searchValue, setSearchValue] = useTableSearch({ instance: table, columnToSearch: 'name' })

	useEffect(() => {
		startTransition(() => {
			setSorting(PRESET_SORTING[activePreset])
			setColumnVisibility(buildPresetVisibility(activePreset))
			setColumnFilters([])
			setPagination((prev) => ({ ...prev, pageIndex: 0 }))
			setSearchValue('')
		})
	}, [activePreset, setSearchValue])

	const columnOptions = useMemo(() => {
		const options: Array<{ key: string; name: string; help?: string }> = []
		for (const column of columns) {
			const key = column.id ?? ('accessorKey' in column ? String(column.accessorKey) : '')
			if (!key) continue
			const name = typeof column.header === 'function' ? key : column.header != null ? String(column.header) : key
			const help = column.meta?.headerHelperText ?? undefined
			options.push({ key, name, help })
		}
		return options
	}, [])
	const selectedColumns: string[] = []
	for (const column of table.getAllLeafColumns()) {
		if (column.getIsVisible()) selectedColumns.push(column.id)
	}
	const setColumnOptions = (newOptions: string[] | ((prev: string[]) => string[])) => {
		const resolvedOptions = typeof newOptions === 'function' ? newOptions(selectedColumns) : newOptions
		const nextVisibility: VisibilityState = {}
		for (const column of table.getAllLeafColumns()) {
			nextVisibility[column.id] = resolvedOptions.includes(column.id)
		}
		table.setColumnVisibility(nextVisibility)
	}

	const setPreset = (preset: EquitiesPreset) => {
		void pushShallowQuery(router, { rankBy: PRESET_QUERY_SLUGS[preset] })
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center justify-center gap-2">
				<span className="text-sm font-medium text-(--text-secondary)">Rank by</span>
				{EQUITIES_PRESETS.map((preset) => (
					<button
						key={preset}
						data-active={preset === activePreset}
						data-umami-event="equities-preset-click"
						data-umami-event-preset={PRESET_QUERY_SLUGS[preset] ?? 'market-cap'}
						onClick={() => startTransition(() => setPreset(preset))}
						className="rounded-full border border-(--old-blue) px-3 py-1 text-xs hover:bg-(--link-hover-bg) data-[active=true]:bg-(--old-blue) data-[active=true]:text-white"
					>
						{preset}
					</button>
				))}
			</div>

			<div className="flex flex-col gap-3 rounded-md border border-(--cards-border) bg-(--cards-bg) p-3">
				<div className="flex w-full flex-wrap items-center justify-end gap-3">
					<h2 className="mr-auto text-lg font-semibold">Company Rankings</h2>
					<label className="relative w-full max-w-full sm:max-w-[280px]">
						<span className="sr-only">Search companies or tickers</span>
						<Icon
							name="search"
							height={16}
							width={16}
							className="absolute top-0 bottom-0 left-2 my-auto text-(--text-tertiary)"
						/>
						<input
							value={searchValue}
							onInput={(event) => setSearchValue(event.currentTarget.value)}
							placeholder="Search companies or tickers"
							className="w-full rounded-md border border-(--form-control-border) bg-white p-1 pl-7 text-black dark:bg-black dark:text-white"
						/>
					</label>
					<SelectWithCombobox
						allValues={columnOptions}
						selectedValues={selectedColumns}
						setSelectedValues={setColumnOptions}
						nestedMenu={false}
						label="Columns"
						labelType="smol"
						variant="filter-responsive"
					/>
					<SelectWithCombobox
						allValues={countryOptions}
						selectedValues={selectedCountries}
						setSelectedValues={setSelectedCountries}
						nestedMenu={false}
						label="Country"
						labelType="smol"
						variant="filter-responsive"
					/>
					<SelectWithCombobox
						allValues={sectorOptions}
						selectedValues={selectedSectors}
						setSelectedValues={setSelectedSectors}
						nestedMenu={false}
						label="Sector"
						labelType="smol"
						variant="filter-responsive"
					/>
					<SelectWithCombobox
						allValues={industryOptions}
						selectedValues={selectedIndustries}
						setSelectedValues={setSelectedIndustries}
						nestedMenu={false}
						label="Industry"
						labelType="smol"
						variant="filter-responsive"
					/>
					<CSVDownloadButton
						prepareCsv={() => prepareTableCsv({ instance: table, filename: 'equities-rankings' })}
						smol
					/>
				</div>
				<PaginatedTable table={table} pageSizeOptions={PAGE_SIZE_OPTIONS} />
			</div>

			<p className="px-1 text-xs text-(--text-disabled)">
				Market data provided by{' '}
				<a href="https://twelvedata.com" target="_blank" rel="noopener noreferrer" className="underline">
					Twelve Data
				</a>
				. Filings and statements data from SEC EDGAR.
				{updatedAt ? <span suppressHydrationWarning> Updated {formatEquitiesDateTime(updatedAt)}.</span> : null}
			</p>
		</div>
	)
}
