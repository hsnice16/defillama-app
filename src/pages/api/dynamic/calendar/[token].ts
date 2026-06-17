// port: framework-native adapter (text/calendar body, not JSON)
import type { NextApiRequest, NextApiResponse } from 'next'
import { calendarIcs } from '~/containers/Unlocks/server/api'
import { withApiRouteTelemetry } from '~/utils/telemetry'

async function handler(req: NextApiRequest, res: NextApiResponse) {
	const result = await calendarIcs.handle({
		method: req.method ?? 'GET',
		url: req.url ?? '',
		query: req.query,
		headers: req.headers
	})

	for (const [name, value] of Object.entries(result.headers ?? {})) {
		res.setHeader(name, value)
	}

	if ('serializedJson' in result) {
		if (!res.hasHeader('Content-Type')) {
			res.setHeader('Content-Type', 'application/json; charset=utf-8')
		}
		return res.status(result.status).send(result.serializedJson)
	}
	if (typeof result.body === 'string') {
		return res.status(result.status).send(result.body)
	}
	return res.status(result.status).json(result.body)
}

export default withApiRouteTelemetry('/api/dynamic/calendar/[token]', handler)
