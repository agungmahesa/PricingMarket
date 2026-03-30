/**
 * scrapers/tokopedia.js
 * Crawls Tokopedia search results via direct HTTP request (axios + cheerio).
 * Uses GraphQL API — more stable than HTML scraping for Tokopedia.
 */
const axios = require('axios');
const cheerio = require('cheerio');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Content-Type': 'application/json',
    'Origin': 'https://www.tokopedia.com',
    'Referer': 'https://www.tokopedia.com/',
    'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'Connection': 'keep-alive',
    'X-TKPD-AKAMAI': 'pdp_desktop',
};

const GQL_SEARCH_QUERY = `
query SearchProductQueryV4($params: String!) {
  ace_search_product_v4(params: $params) {
    data {
      products {
        id
        name
        url
        imageUrl
        price
        originalPrice
        discountPercentage
        ratingAverage
        countReview
        labelGroups {
          title
          type
        }
        shop {
          name
          url
        }
      }
    }
  }
}`;

async function scrapeTokopedia(keyword, maxResults = 15, basePrice = 50000) {
    const listings = [];

    try {
        // Strategy 1: Tokopedia GraphQL API
        const gqlParams = `rows=24&start=0&q=${encodeURIComponent(keyword)}&source=search&page=1&ob=23&safe_search=false`;
        console.log(`[Tokopedia] Crawling via GQL API`);

        const gqlResponse = await axios.post(
            'https://gql.tokopedia.com/graphql/SearchProductQueryV4',
            JSON.stringify([{
                operationName: 'SearchProductQueryV4',
                variables: { params: gqlParams },
                query: GQL_SEARCH_QUERY,
            }]),
            { headers: BROWSER_HEADERS, timeout: 15000 }
        );

        const gqlData = gqlResponse.data;
        const products = gqlData?.[0]?.data?.ace_search_product_v4?.data?.products || [];

        for (const p of products.slice(0, maxResults)) {
            const priceNum = parseInt((p.price || '').replace(/[^0-9]/g, '')) || 0;
            const originalNum = parseInt((p.originalPrice || '').replace(/[^0-9]/g, '')) || priceNum;
            if (priceNum > 1000 && (p.name || '').length > 3) {
                const badge = (p.labelGroups || []).find(l => l.type === 'gimmick')?.title || '';
                listings.push({
                    name: p.name,
                    price: priceNum,
                    original_price: originalNum,
                    discount_pct: p.discountPercentage || 0,
                    rating: parseFloat(p.ratingAverage) || null,
                    sold_count: 0,
                    store_name: p.shop?.name || 'Tokopedia Seller',
                    badge,
                    store_url: p.url || `https://www.tokopedia.com/search?q=${encodeURIComponent(keyword)}`,
                    platform: 'tokopedia',
                    is_real: true,
                });
            }
        }

        console.log(`[Tokopedia] GQL found ${listings.length} listings for "${keyword}"`);

    } catch (gqlErr) {
        console.error(`[Tokopedia] GQL error: ${gqlErr.message}`);

        // Strategy 2: Fallback — direct HTML crawl
        try {
            console.log(`[Tokopedia] Falling back to HTML crawl`);
            const htmlUrl = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(keyword)}`;
            const { data: html } = await axios.get(htmlUrl, {
                headers: {
                    ...BROWSER_HEADERS,
                    'Accept': 'text/html,application/xhtml+xml,application/xml',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                },
                timeout: 15000,
            });

            const $ = cheerio.load(html);
            const cardSelectors = [
                '[data-testid="master-product-card"]',
                '.css-1asz3by',
                '.pcv3__container',
            ];

            let cards = [];
            for (const sel of cardSelectors) {
                const found = $(sel);
                if (found.length >= 3) { cards = found.toArray(); break; }
            }

            for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
                const card = $(cards[i]);
                const name = card.find('[data-testid="spnSRPProdName"], [class*="title"]').text().trim();
                const pt = card.find('[data-testid="spnSRPProdPrice"], [class*="price"]').text().replace(/[^0-9]/g, '');
                const price = parseInt(pt) || 0;
                const store_name = card.find('[data-testid="spnSRPProdTabName"], [class*="shop"]').text().trim() || 'Tokopedia Seller';
                let store_url = card.find('a').attr('href') || '';
                if (store_url && !store_url.startsWith('http')) store_url = 'https://www.tokopedia.com' + store_url;
                if (price > 1000 && name.length > 3) {
                    listings.push({ name, price, original_price: price, discount_pct: 0, rating: null, sold_count: 0, store_name, badge: '', store_url, platform: 'tokopedia', is_real: true });
                }
            }
            console.log(`[Tokopedia] HTML crawl found ${listings.length} listings`);
        } catch (htmlErr) {
            console.error(`[Tokopedia] HTML crawl error: ${htmlErr.message}`);
        }
    }

    if (listings.length === 0) {
        console.log(`[Tokopedia] Using fallback data`);
        const bp = basePrice > 0 ? basePrice : 50000;
        const searchUrl = 'https://www.tokopedia.com/search?q=' + encodeURIComponent(keyword);
        listings.push(
            { name: `${keyword} Promo Flash Sale`, platform: 'tokopedia', price: Math.round(bp * 0.95), original_price: bp, discount_pct: 5, rating: 4.8, sold_count: 120, store_name: 'Toko Elektronik ID', badge: '', store_url: searchUrl, is_real: false },
            { name: `${keyword} Original`, platform: 'tokopedia', price: Math.round(bp * 0.98), original_price: Math.round(bp * 0.98), discount_pct: 0, rating: 4.9, sold_count: 550, store_name: 'Official Store ID', badge: 'Official Store', store_url: searchUrl, is_real: false },
            { name: `${keyword} BNIB`, platform: 'tokopedia', price: Math.round(bp * 0.92), original_price: Math.round(bp * 0.92), discount_pct: 0, rating: 4.7, sold_count: 45, store_name: 'Gadget Mart Murah', badge: '', store_url: searchUrl, is_real: false }
        );
    }

    return listings;
}

module.exports = { scrapeTokopedia };
