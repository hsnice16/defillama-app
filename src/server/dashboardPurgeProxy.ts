import type { NextApiRequest, NextApiResponse } from 'next'
import { FEATURES_SERVER } from '~/constants'
import { type CloudflarePurgeResult, purgeCloudflareDashboardUrls } from './cloudflarePurge'

export type ProxiedDashboard = { id?: string; slug?: string | null; visibility?: string | null }

export function featuresServerUrl(path: string): string {
	return `${FEATURES_SERVER.replace(/\/$/, '')}${path}`
}

export function authorizationHeader(req: NextApiRequest): Record<string, string> {
	const header = req.headers.authorization
	if (Array.isArray(header)) {
		const first = header.find(Boolean)
		return first ? { Authorization: first } : {}
	}
	return header ? { Authorization: header } : {}
}

export function dashboardIdFromQuery(req: NextApiRequest): string | null {
	const { id } = req.query
	if (Array.isArray(id)) return id[0] || null
	return typeof id === 'string' && id ? id : null
}

export function parseJsonObject(body: string): Record<string, unknown> | null {
	if (!body) return null
	try {
		const parsed = JSON.parse(body)
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
	} catch {
		return null
	}
}

export async function fetchExistingDashboard(
	id: string,
	authHeader: Record<string, string>
): Promise<ProxiedDashboard | null> {
	try {
		const response = await fetch(featuresServerUrl(`/dashboards/${encodeURIComponent(id)}`), { headers: authHeader })
		if (!response.ok) return null
		return parseJsonObject(await response.text()) as ProxiedDashboard | null
	} catch {
		return null
	}
}

export async function sendBackendResponse(response: Response, res: NextApiResponse): Promise<void> {
	const body = await response.text()
	if (body) {
		const payload = parseJsonObject(body)
		if (payload) {
			res.status(response.status).json(payload)
			return
		}
	}
	res.status(response.status).json({ error: body || response.statusText || 'Dashboard request failed' })
}

export async function purgeDashboardCache(params: {
	id: string
	before: ProxiedDashboard | null
	after: ProxiedDashboard | null
}): Promise<CloudflarePurgeResult> {
	const wasPublic = params.before?.visibility === 'public'
	const isPublic = params.after?.visibility === 'public'
	if (!wasPublic && !isPublic) {
		return { reason: 'dashboard is not public', status: 'skipped' }
	}

	const afterSlug = params.after?.slug ?? null
	const beforeSlug = params.before?.slug ?? null
	const slug = afterSlug ?? beforeSlug
	const previousSlug = beforeSlug && beforeSlug !== slug ? beforeSlug : null

	try {
		return await purgeCloudflareDashboardUrls({ id: params.id, slug, previousSlug })
	} catch (error) {
		return { reason: error instanceof Error ? error.message : String(error), status: 'failed' }
	}
}
