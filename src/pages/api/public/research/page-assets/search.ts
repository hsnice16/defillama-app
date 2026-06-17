import type { NextApiRequest, NextApiResponse } from 'next'
import { searchPageAssets } from '~/containers/Articles/server/pageAssets'
import { jitterCacheControlHeader } from '~/utils/maxAgeForNext'
import { recordRouteRuntimeError, withApiRouteTelemetry } from '~/utils/telemetry'

const getQueryParam = (value: string | string[] | undefined): string => {
	if (Array.isArray(value)) return value[0] ?? ''
	return value ?? ''
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', ['GET'])
		return res.status(405).json({ error: 'Method Not Allowed' })
	}
	const q = getQueryParam(req.query.q).trim()
	if (!q) return res.status(200).json({ results: [] })

	try {
		const results = await searchPageAssets(q)
		res.setHeader(
			'Cache-Control',
			jitterCacheControlHeader('public, s-maxage=300, stale-while-revalidate=600', req.url ?? q)
		)
		return res.status(200).json({ results })
	} catch (error) {
		recordRouteRuntimeError(error, 'apiRoute')
		return res.status(200).json({ results: [] })
	}
}

export default withApiRouteTelemetry('/api/public/research/page-assets/search', handler)
