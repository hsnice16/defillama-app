import * as Ariakit from '@ariakit/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '~/components/Icon'
import { TokenLogo } from '~/components/TokenLogo'
import { geckoTokenIconUrl } from '~/utils/icons'
import type { PageAssetSearchHit } from '../pageAssetMarket'
import type { ArticlePageAsset } from '../types'

const MAX_PAGE_ASSETS = 12

function useDebouncedValue<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value)
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delay)
		return () => clearTimeout(id)
	}, [value, delay])
	return debounced
}

export function ArticlePageAssetPicker({
	value,
	onChange
}: {
	value: Array<ArticlePageAsset>
	onChange: (next: Array<ArticlePageAsset>) => void
}) {
	const [searchValue, setSearchValue] = useState('')
	const [open, setOpen] = useState(false)
	const debouncedQuery = useDebouncedValue(searchValue.trim(), 200)
	const atLimit = value.length >= MAX_PAGE_ASSETS
	const selectedIds = useMemo(() => new Set(value.map((asset) => asset.geckoId)), [value])

	const { data: results, isFetching } = useQuery({
		queryKey: ['research', 'page-asset-search', debouncedQuery],
		queryFn: async ({ signal }) => {
			const res = await fetch(`/api/public/research/page-assets/search?q=${encodeURIComponent(debouncedQuery)}`, {
				signal
			})
			if (!res.ok) throw new Error('Asset search failed')
			const json = await res.json()
			return (json?.results ?? []) as Array<PageAssetSearchHit>
		},
		enabled: open && debouncedQuery.length > 0 && !atLimit,
		retry: false,
		staleTime: 60_000
	})

	const hits = useMemo(
		() => (results ?? []).filter((hit) => !selectedIds.has(hit.geckoId)).slice(0, 12),
		[results, selectedIds]
	)

	const addAsset = (hit: PageAssetSearchHit) => {
		if (selectedIds.has(hit.geckoId) || value.length >= MAX_PAGE_ASSETS) return
		onChange([...value, { geckoId: hit.geckoId, symbol: hit.symbol, name: hit.name }])
		setSearchValue('')
	}
	const removeAsset = (index: number) => onChange(value.filter((_, i) => i !== index))
	const moveAsset = (index: number, direction: -1 | 1) => {
		const target = index + direction
		if (target < 0 || target >= value.length) return
		const next = value.slice()
		;[next[index], next[target]] = [next[target], next[index]]
		onChange(next)
	}

	return (
		<div className="grid gap-2.5">
			<p className="-mt-1 text-[11px] leading-snug text-(--text-tertiary)">
				Pick the tokens this article covers. Live price and 24h change render in the sidebar — only the token identity
				is saved.
			</p>

			<Ariakit.ComboboxProvider
				open={open && !atLimit}
				setOpen={setOpen}
				value={searchValue}
				setValue={setSearchValue}
				resetValueOnHide
			>
				<div
					className={`relative flex items-center rounded-md border bg-(--app-bg) ${
						atLimit
							? 'border-(--cards-border) opacity-60'
							: 'border-(--cards-border) focus-within:border-(--link-text)/60'
					}`}
				>
					<Icon name="search" height={14} width={14} className="absolute left-3 text-(--text-tertiary)" />
					<Ariakit.Combobox
						placeholder={atLimit ? `Limit reached (max ${MAX_PAGE_ASSETS})` : 'Search a token by symbol or name…'}
						disabled={atLimit}
						autoSelect
						className="min-h-10 w-full rounded-md bg-transparent py-2 pr-3 pl-9 text-sm text-(--text-primary) outline-none placeholder:text-(--text-tertiary) disabled:cursor-not-allowed"
					/>
				</div>
				<Ariakit.ComboboxPopover
					gutter={6}
					sameWidth
					portal
					unmountOnHide
					className="z-[90] flex max-h-64 flex-col overflow-auto overscroll-contain rounded-md border border-(--cards-border) bg-(--cards-bg) py-1 text-sm shadow-xl outline-none"
				>
					{isFetching && hits.length === 0 ? (
						<p className="p-3 text-center text-xs text-(--text-tertiary)">Searching…</p>
					) : null}
					{!isFetching && debouncedQuery.length > 0 && hits.length === 0 ? (
						<p className="p-3 text-center text-xs text-(--text-tertiary)">No tokens found</p>
					) : null}
					{hits.map((hit) => (
						<Ariakit.ComboboxItem
							key={hit.geckoId}
							value={hit.geckoId}
							setValueOnClick={false}
							onClick={() => addAsset(hit)}
							className="flex cursor-pointer items-center gap-2.5 px-3 py-2 data-active-item:bg-(--link-button)"
						>
							<TokenLogo src={hit.image ?? geckoTokenIconUrl(`coingecko:${hit.geckoId}`)} size={20} alt={hit.symbol} />
							<span className="text-sm font-semibold text-(--text-primary)">{hit.symbol}</span>
							<span className="truncate text-xs text-(--text-tertiary)">{hit.name}</span>
						</Ariakit.ComboboxItem>
					))}
				</Ariakit.ComboboxPopover>
			</Ariakit.ComboboxProvider>

			{value.length > 0 ? (
				<ul className="m-0 grid list-none gap-1.5 p-0">
					{value.map((asset, index) => (
						<li
							key={asset.geckoId}
							className="group flex items-center gap-2.5 rounded-lg border border-(--cards-border) bg-(--app-bg) px-2.5 py-2 transition-colors hover:border-(--text-tertiary)/40"
						>
							<TokenLogo src={geckoTokenIconUrl(`coingecko:${asset.geckoId}`)} size={22} alt={asset.symbol} />
							<div className="flex min-w-0 flex-col">
								<span className="text-sm leading-tight font-semibold text-(--text-primary)">{asset.symbol}</span>
								<span className="truncate text-[11px] leading-tight text-(--text-tertiary)">{asset.name}</span>
							</div>
							<div className="ml-auto flex items-center gap-0.5">
								<button
									type="button"
									onClick={() => moveAsset(index, -1)}
									disabled={index === 0}
									aria-label={`Move ${asset.symbol} up`}
									className="grid size-6 place-items-center rounded-md text-(--text-tertiary) transition-colors hover:bg-(--link-hover-bg) hover:text-(--text-primary) disabled:pointer-events-none disabled:opacity-30"
								>
									<Icon name="chevron-up" height={14} width={14} />
								</button>
								<button
									type="button"
									onClick={() => moveAsset(index, 1)}
									disabled={index === value.length - 1}
									aria-label={`Move ${asset.symbol} down`}
									className="grid size-6 place-items-center rounded-md text-(--text-tertiary) transition-colors hover:bg-(--link-hover-bg) hover:text-(--text-primary) disabled:pointer-events-none disabled:opacity-30"
								>
									<Icon name="chevron-down" height={14} width={14} />
								</button>
								<button
									type="button"
									onClick={() => removeAsset(index)}
									aria-label={`Remove ${asset.symbol}`}
									className="grid size-6 place-items-center rounded-md text-(--text-tertiary) opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-(--link-hover-bg) hover:text-red-500 focus-visible:opacity-100"
								>
									<Icon name="x" height={13} width={13} />
								</button>
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="rounded-lg border border-dashed border-(--cards-border) px-3 py-3 text-center text-[11px] leading-snug text-(--text-tertiary)">
					No assets yet. Search above to add the tokens this article covers.
				</p>
			)}
		</div>
	)
}
