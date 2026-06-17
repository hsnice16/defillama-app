import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Icon } from '~/components/Icon'
import { PercentChange } from '~/components/PercentChange'
import { TokenLogo } from '~/components/TokenLogo'
import { geckoTokenIconUrl } from '~/utils/icons'
import type { PageAssetMarket } from '../pageAssetMarket'
import type { ArticlePageAsset } from '../types'

function formatAssetPrice(price: number | null): string {
	if (price == null || !Number.isFinite(price)) return '—'
	if (price <= 0) return '$0.00'
	if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
	if (price >= 0.01) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
	return `$${price.toLocaleString('en-US', { maximumFractionDigits: 6 })}`
}

function usePageAssetMarkets(ids: Array<string>) {
	return useQuery({
		queryKey: ['article-page-assets', ids],
		queryFn: async ({ signal }) => {
			const res = await fetch(`/api/public/research/page-assets?ids=${ids.map(encodeURIComponent).join(',')}`, {
				signal
			})
			if (!res.ok) throw new Error('Failed to load asset prices')
			const json = await res.json()
			return (json?.assets ?? []) as Array<PageAssetMarket>
		},
		enabled: ids.length > 0,
		staleTime: 60 * 1000,
		gcTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 0
	})
}

export function ArticlePageAssets({ pageAssets }: { pageAssets?: Array<ArticlePageAsset> | null }) {
	const assets = pageAssets ?? []
	const ids = useMemo(
		() => Array.from(new Set((pageAssets ?? []).map((asset) => asset.geckoId).filter(Boolean))),
		[pageAssets]
	)
	const { data, isLoading } = usePageAssetMarkets(ids)
	const byId = useMemo(() => new Map((data ?? []).map((m) => [m.geckoId, m])), [data])
	const [open, setOpen] = useState(true)

	if (assets.length === 0) return null

	return (
		<section aria-label="Assets on this page" className="grid gap-3">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				className="group flex items-center justify-between gap-2"
			>
				<span className="flex items-center gap-2 text-[11px] leading-none font-semibold tracking-[0.16em] text-(--text-secondary) uppercase">
					Assets on this page
					<span className="rounded-full bg-(--bg-tertiary) px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-normal text-(--text-tertiary)">
						{assets.length}
					</span>
				</span>
				<Icon
					name="chevron-down"
					className={`size-3.5 shrink-0 text-(--text-tertiary) transition-transform duration-200 group-hover:text-(--text-secondary) ${
						open ? '' : '-rotate-90'
					}`}
				/>
			</button>
			<div
				className={`grid transition-[grid-template-rows] duration-300 ease-out ${
					open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
				}`}
			>
				<div className="overflow-hidden">
					<ul className="m-0 list-none divide-y divide-(--cards-border) overflow-hidden rounded-xl border border-(--cards-border) p-0">
						{assets.map((asset) => {
							const market = byId.get(asset.geckoId)
							const logoSrc = market?.image ?? geckoTokenIconUrl(`coingecko:${asset.geckoId}`)
							const showSkeleton = !market && isLoading
							return (
								<li key={asset.geckoId} className="flex items-center gap-2.5 px-3 py-2.5">
									<TokenLogo src={logoSrc} size={22} alt={asset.symbol} title={asset.name} />
									<span
										className="min-w-0 truncate text-[13px] leading-none font-bold text-(--text-primary)"
										title={asset.name}
									>
										{asset.symbol.toUpperCase()}
									</span>
									<span className="ml-auto text-[13px] leading-none font-semibold text-(--text-primary) tabular-nums">
										{showSkeleton ? (
											<span className="inline-block h-3.5 w-14 animate-pulse rounded bg-(--bg-tertiary) align-middle" />
										) : (
											formatAssetPrice(market?.price ?? null)
										)}
									</span>
									<span className="w-[52px] shrink-0 text-right text-[12px] leading-none tabular-nums">
										{showSkeleton ? (
											<span className="inline-block h-3 w-9 animate-pulse rounded bg-(--bg-tertiary) align-middle" />
										) : market && market.change24h != null ? (
											<PercentChange percent={market.change24h} fontWeight={600} />
										) : null}
									</span>
								</li>
							)
						})}
					</ul>
				</div>
			</div>
		</section>
	)
}
