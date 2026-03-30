/**
 * scrapers/tokopedia.js
 * Scrapes search results from Tokopedia using ScraperAPI (Offloaded Rendering).
 * Returns array of product listings for a given keyword.
 */
const axios = require('axios');
const cheerio = require('cheerio');

const TOKOPEDIA_SEARCH = 'https://www.tokopedia.com/search?st=product&q=';

async function scrapeTokopedia(keyword, maxResults = 15, basePrice = 50000) {
    const listings = [];
    const proxyUrl = process.env.PROXY_URL; // http://user:pass@host:port
    
    // Extract API Key from PROXY_URL if it's a ScraperAPI URL
    // Format: http://scraperapi:APIKEY@proxy-server.scraperapi.com:8001
    let apiKey = '';
    if (proxyUrl && proxyUrl.includes('scraperapi')) {
        const match = proxyUrl.match(/scraperapi:([^@]+)/);
        if (match) apiKey = match[1];
    }

    try {
        const targetUrl = TOKOPEDIA_SEARCH + encodeURIComponent(keyword);
        console.log(`[Tokopedia] Crawling: ${targetUrl}`);

        let html = '';
        if (apiKey) {
            // Use ScraperAPI with rendering enabled to bypass bot detection & JS rendering
            const scraperApiUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=id`;
            console.log(`[Tokopedia] Using ScraperAPI Render Mode`);
            const response = await axios.get(scraperApiUrl, { timeout: 60000 });
            html = response.data;
        } else {
            // Fallback to direct axios (likely for local testing or if no proxy set)
            console.log(`[Tokopedia] No ScraperAPI key found, using direct request`);
            const response = await axios.get(targetUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 10000 
            });
            html = response.data;
        }

        const $ = cheerio.load(html);
        
        // Find all potential product cards using the same resilient selectors as before
        const cardSelectors = [
            '[data-testid="master-product-card"]',
            '.css-1asz3by',
            '.pcv3__container',
            '[data-testid="divSRPContentProducts"] > div',
            '.css-1mbt72s',
            '.css-jza8fo'
        ];

        let cards = [];
        for (const sel of cardSelectors) {
            const found = $(sel);
            if (found.length >= 3) { 
                cards = found.toArray(); 
                break; 
            }
        }

        if (cards.length === 0) {
            // Last resort: find anything that looks like a product card
            cards = $('div').filter((i, el) => {
                const text = $(el).text();
                return text.includes('Rp') && $(el).find('a').length > 0;
            }).toArray().slice(0, 15);
        }

        for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
            const card = $(cards[i]);
            try {
                // Product name
                const nameEl = card.find('[data-testid="spnSRPProdName"], .css-1b6t4dn, .prd_link-product-name, [class*="title"]');
                const name = nameEl.text().trim();

                // Price
                const priceEl = card.find('[data-testid="spnSRPProdPrice"], .css-1ksbe7z, .prd_link-product-price, [class*="price"]');
                const pt = priceEl.text().replace(/[^0-9]/g, '');
                const price = parseInt(pt) || 0;

                // Store
                const storeEl = card.find('[data-testid="spnSRPProdTabName"], .css-1rn65ee, .prd_link-shop-name, [class*="shop"]');
                const store_name = storeEl.text().trim() || 'Tokopedia Seller';

                // Badge
                const badgeEl = card.find('[data-testid="spnSRPProdLabel"], [class*="badge"], img[src*="official"]');
                const badge = badgeEl.length > 0 ? 'Official Store' : '';

                // URL
                const linkEl = card.find('a');
                const store_url = linkEl.attr('href') || '';
                const final_url = store_url.startsWith('http') ? store_url : 'https://www.tokopedia.com' + store_url;

                if (price > 1000 && name.length > 3) {
                    listings.push({ 
                        name, 
                        price, 
                        original_price: price, 
                        discount_pct: 0, 
                        rating: 4.8, 
                        sold_count: 0, 
                        store_name, 
                        badge, 
                        store_url: final_url, 
                        platform: 'tokopedia',
                        is_real: true 
                    });
                }
            } catch (e) { }
        }

        console.log(`[Tokopedia] Found ${listings.length} real listings for "${keyword}"`);

    } catch (err) {
        console.error(`[Tokopedia] Crawl Error: ${err.message}`);
    }

    // Fallback: If no real findings, use the same high-fidelity simulated data
    if (listings.length === 0) {
        console.log(`[Tokopedia] Using dynamic fallback data`);
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


module.exports = { scrapeTokopedia };
