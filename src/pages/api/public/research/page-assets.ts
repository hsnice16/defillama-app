import type { NextApiRequest, NextApiResponse } from 'next'
import { lookupPageAssets } from '~/containers/Articles/server/pageAssets'
import { jitterCacheControlHeader } from '~/utils/maxAgeForNext'
import { recordRouteRuntimeError, withApiRouteTelemetry } from '~/utils/telemetry'

const MAX_IDS = 20

const getQueryParam = (value: string | string[] | undefined): string => {
	if (Array.isArray(value)) return value[0] ?? ''
	return value ?? ''
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', ['GET'])
		return res.status(405).json({ error: 'Method Not Allowed' })
	}
	const ids = getQueryParam(req.query.ids)
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean)
		.slice(0, MAX_IDS)
	if (ids.length === 0) return res.status(200).json({ assets: [] })

	try {
		const assets = await lookupPageAssets(ids)
		res.setHeader(
			'Cache-Control',
			jitterCacheControlHeader('public, s-maxage=300, stale-while-revalidate=600', req.url ?? ids.join(','))
		)
		return res.status(200).json({ assets })
	} catch (error) {
		recordRouteRuntimeError(error, 'apiRoute')
		return res.status(200).json({ assets: [] })
	}
}

export default withApiRouteTelemetry('/api/public/research/page-assets', handler)
