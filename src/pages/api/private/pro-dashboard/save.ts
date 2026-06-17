import handler from '~/containers/ProDashboard/server/saveRoute'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default handler
