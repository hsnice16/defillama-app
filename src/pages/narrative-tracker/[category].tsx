import { SKIP_BUILD_STATIC_GENERATION } from '~/constants'
import { CategoryPerformanceContainer } from '~/containers/NarrativeTracker'
import { getCoinPerformance } from '~/containers/NarrativeTracker/queries'
import type { CategoryPerformanceProps } from '~/containers/NarrativeTracker/types'
import Layout from '~/layout'
import { maxAgeForNext } from '~/utils/maxAgeForNext'
import { createRoutePhaseTimer, withPerformanceLogging } from '~/utils/perf'

export const getStaticProps = withPerformanceLogging('category-performance', async ({ params }) => {
	const phaseTimer = createRoutePhaseTimer()
	const stopGetStaticProps = phaseTimer.start('get_static_props_total')
	try {
		const rawCategory = params?.category
		const categoryId = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory
		if (typeof categoryId !== 'string' || categoryId.length === 0) {
			return { notFound: true }
		}

		const metadataCache = await phaseTimer.time('metadata_import', () =>
			import('~/utils/metadata').then((m) => m.default)
		)
		if (!metadataCache.narrativeCategoryIdsSet.has(categoryId)) {
			return { notFound: true }
		}

		const data = await phaseTimer.time('category_performance_data', () => getCoinPerformance(categoryId))

		return {
			props: {
				...data,
				categoryId
			},
			revalidate: maxAgeForNext([22])
		}
	} finally {
		stopGetStaticProps()
		phaseTimer.record()
	}
})

export async function getStaticPaths() {
	// When this is true (in preview environments) don't
	// prerender any static pages
	// (faster builds, but slower initial page load)
	if (SKIP_BUILD_STATIC_GENERATION) {
		return {
			paths: [],
			fallback: 'blocking'
		}
	}

	const { getNarrativeCategoryStaticPaths } = await import('~/containers/NarrativeTracker/server/routes')
	const paths = await getNarrativeCategoryStaticPaths()

	return { paths, fallback: 'blocking' }
}

const pageName = ['Narrative Tracker', 'by', 'Category']

interface CategoryPageProps extends CategoryPerformanceProps {
	categoryId: string
}

export default function Returns(props: CategoryPageProps) {
	return (
		<Layout
			title={`${props.categoryName ?? 'Category'} Narrative Tracker - DefiLlama`}
			description={`Track ${props.categoryName ?? 'category'} narrative performance, protocol metrics, and market trends on DefiLlama.`}
			canonicalUrl={`/narrative-tracker/${props.categoryId}`}
			pageName={pageName}
		>
			<CategoryPerformanceContainer {...props} />
		</Layout>
	)
}
