export const CHAIN_NATIVE_BREAKDOWN_METRICS = new Set(['chain-fees', 'chain-revenue'])

export const PROTOCOL_UNSUPPORTED_BY_CHAIN_METRICS = new Set(['stablecoins', ...CHAIN_NATIVE_BREAKDOWN_METRICS])

export const NON_ADAPTER_BY_CHAIN_BREAKDOWN_METRICS = new Set(['tvl', ...PROTOCOL_UNSUPPORTED_BY_CHAIN_METRICS])

// The dashboard stream has historically skipped protocol-series prefetch for
// TVL and true chain-only metrics. Keep that behavior distinct from route
// ownership and protocol-support rules.
export const STREAM_PROTOCOL_SERIES_SKIP_METRICS = new Set(['tvl', ...PROTOCOL_UNSUPPORTED_BY_CHAIN_METRICS])

const PRO_DASHBOARD_CHART_BUILDER_API = '/api/public/pro-dashboard/chart-builder'

export const getProtocolChainBreakdownRoute = (metric: string): string => {
	if (metric === 'tvl') return `${PRO_DASHBOARD_CHART_BUILDER_API}/protocols/breakdowns/by-chain/tvl`
	if (metric === 'stablecoins') return `${PRO_DASHBOARD_CHART_BUILDER_API}/stablecoins/breakdowns/by-chain`
	if (CHAIN_NATIVE_BREAKDOWN_METRICS.has(metric)) {
		return `${PRO_DASHBOARD_CHART_BUILDER_API}/chains/breakdowns/by-chain/${metric}`
	}
	return `${PRO_DASHBOARD_CHART_BUILDER_API}/adapter-metrics/breakdowns/by-chain/${metric}`
}
