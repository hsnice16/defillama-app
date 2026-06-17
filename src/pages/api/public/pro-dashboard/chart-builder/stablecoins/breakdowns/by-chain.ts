import { stablecoinByChainBreakdown } from '~/containers/ProDashboard/server/chartBuilder/stablecoins'
import { toNextHandler } from '~/server/api/nextAdapter'

export default toNextHandler(stablecoinByChainBreakdown)
