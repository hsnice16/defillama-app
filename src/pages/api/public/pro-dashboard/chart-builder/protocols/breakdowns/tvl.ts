import { protocolTvlBreakdown } from '~/containers/ProDashboard/server/chartBuilder/protocols'
import { toNextHandler } from '~/server/api/nextAdapter'

export default toNextHandler(protocolTvlBreakdown)
