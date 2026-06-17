import type { NextApiRequest, NextApiResponse } from 'next'
import { recordRouteRuntimeError, withApiRouteTelemetry } from '~/utils/telemetry'
import { fetchPfPsChartData, fetchPfPsProtocols } from './pfPsQueries'

type PfPsChartResponse = [number, number][] | { error: string }
type PfPsProtocolsResponse = { pf: string[]; ps: string[] } | { error: string }

async function handlePfPsChart(req: NextApiRequest, res: NextApiResponse<PfPsChartResponse>) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', ['GET'])
		return res.status(405).json({ error: 'Method Not Allowed' })
	}

	const { protocol, type } = req.query

	if (!protocol || typeof protocol !== 'string') {
		return res.status(400).json({ error: 'Protocol parameter is required' })
	}

	if (!type || (type !== 'pf' && type !== 'ps')) {
		return res.status(400).json({ error: 'Type parameter must be "pf" or "ps"' })
	}

	try {
		const result = await fetchPfPsChartData(protocol, type)
		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.status(200).json(result)
	} catch (error) {
		recordRouteRuntimeError(error, 'apiRoute')
		return res.status(500).json({ error: 'Failed to load pf/ps chart data' })
	}
}

async function handlePfPsProtocols(req: NextApiRequest, res: NextApiResponse<PfPsProtocolsResponse>) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', ['GET'])
		return res.status(405).json({ error: 'Method Not Allowed' })
	}

	try {
		const result = await fetchPfPsProtocols()
		res.setHeader('Cache-Control', 'public, max-age=3600')
		return res.status(200).json(result)
	} catch (error) {
		recordRouteRuntimeError(error, 'apiRoute')
		return res.status(500).json({ error: 'Failed to load pf/ps protocol availability' })
	}
}

export const pfPsChartHandler = withApiRouteTelemetry('/api/public/pro-dashboard/pf-ps-chart', handlePfPsChart)
export const pfPsProtocolsHandler = withApiRouteTelemetry(
	'/api/public/pro-dashboard/pf-ps-protocols',
	handlePfPsProtocols
)
