import type { NextApiRequest, NextApiResponse } from 'next'
import {
	authorizationHeader,
	dashboardIdFromQuery,
	featuresServerUrl,
	fetchExistingDashboard,
	parseJsonObject,
	type ProxiedDashboard,
	purgeDashboardCache,
	sendBackendResponse
} from '~/server/dashboardPurgeProxy'
import { withApiRouteTelemetry } from '~/utils/telemetry'

function outboundBody(req: NextApiRequest): string {
	if (typeof req.body === 'string') return req.body
	return JSON.stringify(req.body ?? {})
}

export async function dashboardSaveHandler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('Cache-Control', 'private, no-store, max-age=0')

	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST'])
		return res.status(405).json({ error: 'Method Not Allowed' })
	}

	const id = dashboardIdFromQuery(req)
	const authHeader = authorizationHeader(req)
	const before = id ? await fetchExistingDashboard(id, authHeader) : null

	const saveResponse = await fetch(
		id ? featuresServerUrl(`/dashboards/${encodeURIComponent(id)}`) : featuresServerUrl('/dashboards'),
		{
			method: 'POST',
			headers: { ...authHeader, 'Content-Type': 'application/json' },
			body: outboundBody(req)
		}
	)

	if (!saveResponse.ok) {
		return sendBackendResponse(saveResponse, res)
	}

	const saved = parseJsonObject(await saveResponse.text())
	if (!saved) {
		return res.status(502).json({ error: 'Dashboard save response was not valid JSON' })
	}

	const after = saved as ProxiedDashboard
	await purgeDashboardCache({ id: id ?? after.id ?? '', before, after })

	return res.status(saveResponse.status).json(saved)
}

export default withApiRouteTelemetry('/api/private/pro-dashboard/save', dashboardSaveHandler)
