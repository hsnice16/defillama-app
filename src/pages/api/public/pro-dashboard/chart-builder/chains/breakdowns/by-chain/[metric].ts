import { chainNativeByChainBreakdown } from '~/containers/ProDashboard/server/chartBuilder/chains'
import { toNextHandler } from '~/server/api/nextAdapter'

export default toNextHandler(chainNativeByChainBreakdown)
