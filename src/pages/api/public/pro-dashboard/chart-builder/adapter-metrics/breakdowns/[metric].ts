import { adapterMetricBreakdown } from '~/containers/ProDashboard/server/chartBuilder/adapterMetrics/routes'
import { toNextHandler } from '~/server/api/nextAdapter'

export default toNextHandler(adapterMetricBreakdown)
