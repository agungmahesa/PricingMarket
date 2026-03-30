/**
 * scrapers/shopee.js
 * Scrapes search results from Shopee using its direct Search API.
 * Returns array of product listings for a given keyword.
 */
const axios = require('axios');

async function scrapeShopee(keyword, maxResults = 15, basePrice = 50000) {
    const listings = [];
    const proxyUrl = process.env.PROXY_URL; // http://user:pass@host:port
    
    // Extract Proxy details if using ScraperAPI proxy mode
    let proxyConfig = false;
    if (proxyUrl) {
        try {
            const urlFormat = new URL(proxyUrl);
            proxyConfig = {
                protocol: urlFormat.protocol.replace(':', ''),
                host: urlFormat.hostname,
                port: parseInt(urlFormat.port),
                auth: { username: urlFormat.username, password: urlFormat.password }
            };
        } catch (e) {
            console.error('[Shopee] Invalid PROXY_URL logic format');
        }
    }

    try {
        const apiUrl = `https://shopee.co.id/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(keyword)}&limit=${maxResults}&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;
        console.log(`[Shopee] Crawling API: ${apiUrl}`);

        const requestOptions = {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': `https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}`,
                'x-api-source': 'pc'
            },
            timeout: 15000
        };

        if (proxyConfig) {
            console.log(`[Shopee] Routing API request through proxy`);
            requestOptions.proxy = proxyConfig;
        }

        const response = await axios.get(apiUrl, requestOptions);
        
        if (response.data && response.data.items) {
            const items = response.data.items;
            for (let i = 0; i < Math.min(items.length, maxResults); i++) {
                const item = items[i].item_basic || items[i];
                if (!item) continue;

                const name = item.name || '';
                // Shopee API returns price in raw int, needs dividing by 100,000
                const price = Math.round((item.price || 0) / 100000);
                const original_price = Math.round((item.price_before_discount || item.price || 0) / 100000);
                
                if (price > 1000) {
                    listings.push({
                        name: name,
                        price: price,
                        original_price: original_price,
                        discount_pct: item.raw_discount || 0,
                        rating: item.item_rating ? item.item_rating.rating_star : null,
                        sold_count: item.sold || 0,
                        store_name: item.shop_name || 'Shopee Seller',
                        badge: item.is_official_shop ? 'Shopee Mall' : (item.is_preferred_plus_seller ? 'Star+' : ''),
                        store_url: `https://shopee.co.id/product/${item.shopid}/${item.itemid}`,
                        platform: 'shopee',
                        is_real: true
                    });
                }
            }
        }

        console.log(`[Shopee] Found ${listings.length} real listings for "${keyword}"`);

    } catch (err) {
        console.error(`[Shopee] API Crawl Error: ${err.message}`);
    }

    // Fallback: If no real findings (e.g. API blocked, format changed), use dynamic fallback data
    if (listings.length === 0) {
        console.log(`[Shopee] Using dynamic fallback data`);
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
