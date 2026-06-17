import { describe, expect, it } from 'vitest'
import { buildArticleJsonLd, getArticleOpenGraphAuthorUrls } from '~/containers/Articles/ArticleSeo'
import type { ArticleAuthorProfile, ArticleDocument } from '~/containers/Articles/types'

const author: ArticleAuthorProfile = {
	id: 'profile-1',
	pbUserId: 'pb-user-1',
	slug: 'jane-doe',
	displayName: 'Jane Doe',
	bio: null,
	avatarUrl: null,
	socials: {
		x: 'https://x.com/janedoe'
	},
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
}

const coAuthor: ArticleAuthorProfile = {
	id: 'profile-2',
	pbUserId: 'pb-user-2',
	slug: 'john-doe',
	displayName: 'John Doe',
	bio: null,
	avatarUrl: null,
	socials: {
		linkedin: 'https://www.linkedin.com/in/johndoe/'
	},
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
}

function makeArticle(overrides: Partial<ArticleDocument> = {}): ArticleDocument {
	return {
		id: 'article-1',
		contentVersion: 1,
		rendererVersion: 1,
		editorSchemaVersion: 1,
		title: 'Sample Research',
		slug: 'sample-research',
		status: 'published',
		author: author.displayName,
		authorProfile: author,
		contentJson: { type: 'doc', content: [] },
		plainText: '',
		entities: [],
		charts: [],
		citations: [],
		embeds: [],
		tags: ['defi'],
		section: 'report',
		createdAt: '2026-03-01T00:00:00.000Z',
		updatedAt: '2026-03-01T00:00:00.000Z',
		publishedAt: '2026-03-02T00:00:00.000Z',
		firstPublishedAt: '2026-03-02T00:00:00.000Z',
		lastPublishedAt: '2026-03-03T00:00:00.000Z',
		...overrides
	}
}

function jsonLdAuthors(article: ArticleDocument): Array<Record<string, unknown>> {
	return buildArticleJsonLd(article).author as Array<Record<string, unknown>>
}

describe('ArticleSeo metadata authors', () => {
	it('emits primary and co-author Person entries in Article JSON-LD', () => {
		const article = makeArticle({ coAuthors: [coAuthor] })
		const authors = jsonLdAuthors(article)

		expect(authors).toHaveLength(2)
		expect(authors[0]).toMatchObject({
			'@type': 'Person',
			'@id': 'https://defillama.com/research/authors/jane-doe',
			name: 'Jane Doe',
			url: 'https://defillama.com/research/authors/jane-doe',
			sameAs: ['https://x.com/janedoe'],
			worksFor: {
				'@type': 'Organization',
				'@id': 'https://defillama.com/research/authors/defillama-research',
				name: 'DefiLlama Research',
				url: 'https://defillama.com/research/authors/defillama-research'
			}
		})
		expect(authors[1]).toMatchObject({
			'@type': 'Person',
			'@id': 'https://defillama.com/research/authors/john-doe',
			name: 'John Doe',
			url: 'https://defillama.com/research/authors/john-doe',
			sameAs: ['https://www.linkedin.com/in/johndoe/']
		})
		expect(JSON.stringify(buildArticleJsonLd(article))).not.toContain('pb-user')
	})

	it('emits DefiLlama Research plus visible people for brand-byline articles', () => {
		const article = makeArticle({
			author: 'Internal Admin',
			brandByline: true,
			coAuthors: [coAuthor]
		})
		const authors = jsonLdAuthors(article)

		expect(authors).toHaveLength(2)
		expect(authors[0]).toMatchObject({
			'@type': 'Organization',
			'@id': 'https://defillama.com/research/authors/defillama-research',
			name: 'DefiLlama Research',
			url: 'https://defillama.com/research/authors/defillama-research'
		})
		expect(authors[1]).toMatchObject({
			'@type': 'Person',
			name: 'John Doe',
			url: 'https://defillama.com/research/authors/john-doe'
		})
	})

	it('returns repeated Open Graph article author URLs in metadata order', () => {
		expect(getArticleOpenGraphAuthorUrls(makeArticle({ coAuthors: [coAuthor] }))).toEqual([
			'https://defillama.com/research/authors/jane-doe',
			'https://defillama.com/research/authors/john-doe'
		])
		expect(getArticleOpenGraphAuthorUrls(makeArticle({ brandByline: true, coAuthors: [coAuthor] }))).toEqual([
			'https://defillama.com/research/authors/defillama-research',
			'https://defillama.com/research/authors/john-doe'
		])
	})

	it('appends account-less guest authors with the right @type and no worksFor', () => {
		const article = makeArticle({
			guestAuthors: [
				{ name: 'Person A', type: 'Person', url: 'https://person-a.com' },
				{ name: 'Company B', type: 'Organization', url: 'https://company-b.com' },
				{ name: 'No URL Guest', type: 'Person' }
			]
		})
		const authors = jsonLdAuthors(article)

		expect(authors).toHaveLength(4)

		// Owner keeps the DefiLlama Research affiliation.
		expect(authors[0]).toMatchObject({ '@type': 'Person', name: 'Jane Doe' })
		expect(authors[0]).toHaveProperty('worksFor')

		// External guest (Person) — own URL, no affiliation, no internal @id.
		expect(authors[1]).toMatchObject({
			'@type': 'Person',
			name: 'Person A',
			url: 'https://person-a.com'
		})
		expect(authors[1]).not.toHaveProperty('worksFor')
		expect(authors[1]).not.toHaveProperty('@id')

		// External guest (Organization).
		expect(authors[2]).toMatchObject({
			'@type': 'Organization',
			name: 'Company B',
			url: 'https://company-b.com'
		})
		expect(authors[2]).not.toHaveProperty('worksFor')

		// Guest without a URL is still credited by name.
		expect(authors[3]).toMatchObject({ '@type': 'Person', name: 'No URL Guest' })
		expect(authors[3]).not.toHaveProperty('url')
		expect(authors[3]).not.toHaveProperty('worksFor')
	})

	it('includes guest author URLs in Open Graph metadata, skipping those without a URL', () => {
		const article = makeArticle({
			coAuthors: [coAuthor],
			guestAuthors: [
				{ name: 'Person A', type: 'Person', url: 'https://person-a.com' },
				{ name: 'No URL Guest', type: 'Person' }
			]
		})
		expect(getArticleOpenGraphAuthorUrls(article)).toEqual([
			'https://defillama.com/research/authors/jane-doe',
			'https://defillama.com/research/authors/john-doe',
			'https://person-a.com'
		])
	})
})
