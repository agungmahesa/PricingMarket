/**
 * scrapers/lazada.js
 * Scrapes search results from Lazada using ScraperAPI (Offloaded Rendering).
 */
const axios = require('axios');
const cheerio = require('cheerio');

const LAZADA_SEARCH = 'https://www.lazada.co.id/catalog/?q=';

async function scrapeLazada(keyword, maxResults = 15, basePrice = 50000) {
    const listings = [];
    const proxyUrl = process.env.PROXY_URL; // http://user:pass@host:port
    
    // Extract API Key from PROXY_URL if it's a ScraperAPI URL
    let apiKey = '';
    if (proxyUrl && proxyUrl.includes('scraperapi')) {
        const match = proxyUrl.match(/scraperapi:([^@]+)/);
        if (match) apiKey = match[1];
    }

    try {
        const targetUrl = LAZADA_SEARCH + encodeURIComponent(keyword);
        console.log(`[Lazada] Crawling: ${targetUrl}`);

        let html = '';
        if (apiKey) {
            // Use ScraperAPI with rendering enabled because Lazada relies heavily on JS
            const scraperApiUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=id`;
            console.log(`[Lazada] Using ScraperAPI Render Mode`);
            const response = await axios.get(scraperApiUrl, { timeout: 60000 });
            html = response.data;
        } else {
            // Fallback to direct axios
            console.log(`[Lazada] No ScraperAPI key found, using direct request`);
            const response = await axios.get(targetUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 15000 
            });
            html = response.data;
        }

        const $ = cheerio.load(html);
        let extracted = [];

        // Try to extract from embedded JSON data (most reliable for Lazada)
        const scripts = $('script').toArray();
        for (const s of scripts) {
            const content = $(s).html();
            if (content && content.includes('window.__moduleData__')) {
                try {
                    const match = content.match(/window\.__moduleData__\s*=\s*(\{.*?\});?\s*(?:window|<\/script>)/s);
                    if (match) {
                        const data = JSON.parse(match[1]);
                        const listingKey = Object.keys(data).find(k => data[k]?.data?.mods?.listItems);
                        if (listingKey) {
                            const items = data[listingKey].data.mods.listItems;
                            extracted = items.slice(0, maxResults).map(item => ({
                                name: item.name || '',
                                price: Math.round(parseFloat(item.price || 0)),
                                original_price: Math.round(parseFloat(item.originalPrice || item.price || 0)),
                                discount_pct: item.discount ? parseInt(item.discount) : 0,
                                rating: item.ratingScore ? parseFloat(item.ratingScore) : null,
                                sold_count: 0,
                                store_name: item.sellerName || item.brandName || 'Lazada Seller',
                                store_url: item.productUrl ? (item.productUrl.startsWith('http') ? item.productUrl : 'https:' + item.productUrl) : '',
                                badge: item.isPowerSeller ? 'LazMall' : '',
                                platform: 'lazada',
                                is_real: true
                            }));
                        }
                    }
                } catch (e) {
                    // JSON parse error, ignore
                }
            }
        }

        // Fallback: DOM parsing if __moduleData__ wasn't found (e.g., structure changed)
        if (extracted.length === 0) {
            console.log(`[Lazada] Falling back to DOM parsing via Cheerio`);
            const cards = $('[data-qa-locator="product-item"], .bmM-w, .info-content').toArray();
            
            for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
                const card = $(cards[i]);
                try {
                    const nameEl = card.find('[class*="title"], [data-qa-locator="product-item"] a, .RfS5p');
                    const name = nameEl.text().trim();

                    const priceEl = card.find('[class*="price"] span, .price-sale, .ooOxS');
                    const pt = priceEl.text().replace(/[^0-9]/g, '');
                    const price = parseInt(pt) || 0;

                    const origEl = card.find('[class*="original"], .price-original, ._17m_b');
                    const opt = origEl.text().replace(/[^0-9]/g, '');
                    const original_price = parseInt(opt) || price;

                    const ratingEl = card.find('[class*="rating"], .rate-value');
                    const rating = parseFloat(ratingEl.text()) || null;

                    const storeEl = card.find('[class*="seller"], [class*="shop"], .PrNBy');
                    const store_name = storeEl.text().trim() || 'Lazada Seller';

                    let store_url = card.find('a').attr('href') || '';
                    if (store_url && !store_url.startsWith('http')) store_url = 'https:' + store_url;

                    const badgeEl = card.find('[class*="lazmall"], [class*="official"], ._2Srvq');
                    const badge = badgeEl.length > 0 ? 'LazMall' : '';

                    if (price > 1000 && name.length > 2) {
                        extracted.push({ 
                            name, price, original_price, discount_pct: 0, rating, sold_count: 0, 
                            store_name, badge, store_url, platform: 'lazada', is_real: true 
                        });
                    }
                } catch (e) { }
            }
        }

        for (const item of extracted) {
            if (item.price > 0) listings.push(item);
        }

        console.log(`[Lazada] Found ${listings.length} real listings for "${keyword}"`);

    } catch (err) {
        console.error(`[Lazada] Crawl Error: ${err.message}`);
    }

    // Fallback for cloud IPs (if blocked or ScraperAPI fails)
    if (listings.length === 0) {
        console.log('[Lazada] Using dynamic fallback data');
        const bp = basePrice > 0 ? basePrice : 50000;
        const searchUrl = 'https://www.lazada.co.id/catalog/?q=' + encodeURIComponent(keyword);
        listings.push(
            { name: `${keyword} Bonus Ekstra`, platform: 'lazada', price: Math.round(bp * 0.99), original_price: Math.round(bp * 1.05), discount_pct: 3, rating: 4.8, sold_count: 0, store_name: 'Lazada Authorized', badge: 'LazMall', store_url: searchUrl, is_real: false },
            { name: keyword, platform: 'lazada', price: Math.round(bp * 1.01), original_price: Math.round(bp * 1.01), discount_pct: 0, rating: 5.0, sold_count: 0, store_name: 'Flagship Store', badge: 'LazMall', store_url: searchUrl, is_real: false }
        );
    }

    return listings;
}

module.exports = { scrapeLazada };
