/**
 * scrapers/shopee.js
 * Crawls Shopee search results via direct HTTP request (axios + cheerio).
 * Mimics a real browser session with accurate headers.
 */
const axios = require('axios');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'x-api-source': 'pc',
    'x-requested-with': 'XMLHttpRequest',
    'if-none-match': 'null',
};

async function scrapeShopee(keyword, maxResults = 15, basePrice = 50000) {
    const listings = [];

    try {
        const apiUrl = `https://shopee.co.id/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(keyword)}&limit=${maxResults}&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;
        console.log(`[Shopee] Crawling: ${apiUrl}`);

        const response = await axios.get(apiUrl, {
            headers: {
                ...BROWSER_HEADERS,
                'Referer': `https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}`,
            },
            timeout: 15000,
        });

        const data = response.data;

        if (data && data.items && Array.isArray(data.items)) {
            for (let i = 0; i < Math.min(data.items.length, maxResults); i++) {
                const item = data.items[i].item_basic || data.items[i];
                if (!item) continue;

                const price = Math.round((item.price || 0) / 100000);
                const original_price = Math.round((item.price_before_discount || item.price || 0) / 100000);

                if (price > 1000 && (item.name || '').length > 3) {
                    listings.push({
                        name: item.name,
                        price,
                        original_price,
                        discount_pct: item.raw_discount || 0,
                        rating: item.item_rating ? item.item_rating.rating_star : null,
                        sold_count: item.sold || 0,
                        store_name: item.shop_name || 'Shopee Seller',
                        badge: item.is_official_shop ? 'Shopee Mall' : (item.is_preferred_plus_seller ? 'Star+' : ''),
                        store_url: `https://shopee.co.id/product/${item.shopid}/${item.itemid}`,
                        platform: 'shopee',
                        is_real: true,
                    });
                }
            }
        }

        console.log(`[Shopee] Found ${listings.length} real listings for "${keyword}"`);

    } catch (err) {
        console.error(`[Shopee] Crawl error: ${err.message}`);
    }

    if (listings.length === 0) {
        console.log(`[Shopee] Using fallback data`);
        const bp = basePrice > 0 ? basePrice : 50000;
        const searchUrl = 'https://shopee.co.id/search?keyword=' + encodeURIComponent(keyword);
        listings.push(
            { name: `${keyword} - Garansi Resmi`, platform: 'shopee', price: Math.round(bp * 0.96), original_price: Math.round(bp * 1.05), discount_pct: 8, rating: 4.8, sold_count: 240, store_name: 'Official Store', badge: 'Star Seller', store_url: searchUrl, is_real: false },
            { name: keyword, platform: 'shopee', price: Math.round(bp), original_price: Math.round(bp), discount_pct: 0, rating: 4.9, sold_count: 890, store_name: 'Store Resmi Toko', badge: 'Shopee Mall', store_url: searchUrl, is_real: false }
        );
    }

    return listings;
}

module.exports = { scrapeShopee };
