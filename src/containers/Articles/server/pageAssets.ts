import { matchSorter } from 'match-sorter'
import { fetchCoinGeckoTokensListFromDataset } from '~/api/coingecko'
import type { IResponseCGMarketsAPI } from '~/api/coingecko.types'
import type { PageAssetMarket, PageAssetSearchHit } from '../pageAssetMarket'

const TTL_MS = 5 * 60 * 1000

type Cache<T> = { value: T | null; expires: number; inflight: Promise<T> | null }

function makeCache<T>(loader: () => Promise<T>) {
	const cache: Cache<T> = { value: null, expires: 0, inflight: null }
	return async (): Promise<T> => {
		const now = Date.now()
		if (cache.value && cache.expires > now) return cache.value
		if (cache.inflight) return cache.inflight
		cache.inflight = loader()
			.then((v) => {
				cache.value = v
				cache.expires = now + TTL_MS
				cache.inflight = null
				return v
			})
			.catch((e) => {
				cache.inflight = null
				throw e
			})
		return cache.inflight
	}
}

const getTokenList = makeCache(() => fetchCoinGeckoTokensListFromDataset())

function normalizeImage(image?: string): string | null {
	const trimmed = image?.trim()
	if (!trimmed || trimmed === 'missing.png' || trimmed.endsWith('/missing.png')) return null
	return trimmed
}

function toMarket(row: IResponseCGMarketsAPI): PageAssetMarket {
	return {
		geckoId: row.id,
		symbol: (row.symbol ?? '').toUpperCase(),
		name: row.name,
		image: normalizeImage(row.image),
		price: typeof row.current_price === 'number' ? row.current_price : null,
		change24h: typeof row.price_change_percentage_24h === 'number' ? row.price_change_percentage_24h : null
	}
}

export async function lookupPageAssets(ids: Array<string>): Promise<Array<PageAssetMarket>> {
	const wanted = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
	if (wanted.length === 0) return []
	const list = await getTokenList()
	const byId = new Map<string, IResponseCGMarketsAPI>()
	for (const row of list) {
		if (row?.id && !byId.has(row.id)) byId.set(row.id, row)
	}
	return wanted.map((id) => {
		const row = byId.get(id)
		return row ? toMarket(row) : { geckoId: id, symbol: '', name: '', image: null, price: null, change24h: null }
	})
}

export async function searchPageAssets(query: string, limit = 25): Promise<Array<PageAssetSearchHit>> {
	const q = query.trim()
	if (!q) return []
	const list = await getTokenList()
	return matchSorter(list, q, {
		keys: ['symbol', 'name', 'id'],
		threshold: matchSorter.rankings.CONTAINS
	})
		.slice(0, limit)
		.map((row) => ({
			geckoId: row.id,
			symbol: (row.symbol ?? '').toUpperCase(),
			name: row.name,
			image: normalizeImage(row.image)
		}))
}
