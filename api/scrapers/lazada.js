/**
 * scrapers/lazada.js
 * Crawls Lazada search results via direct HTTP request (axios + cheerio).
 * Extracts data from window.__moduleData__ JSON blob embedded in the page.
 */
const axios = require('axios');
const cheerio = require('cheerio');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
};

async function scrapeLazada(keyword, maxResults = 15, basePrice = 50000) {
    const listings = [];

    try {
        const targetUrl = `https://www.lazada.co.id/catalog/?q=${encodeURIComponent(keyword)}&_keyori=ss&from=input&spm=a2o4l.home.search.go.1&page=1`;
        console.log(`[Lazada] Crawling: ${targetUrl}`);

        const { data: html } = await axios.get(targetUrl, {
            headers: BROWSER_HEADERS,
            timeout: 15000,
        });

        const $ = cheerio.load(html);

        // Lazada embeds all product data inside window.__moduleData__ script tag
        let extracted = [];
        const scripts = $('script').toArray();

        for (const s of scripts) {
            const content = $(s).html() || '';
            if (content.includes('window.__moduleData__')) {
                try {
                    const match = content.match(/window\.__moduleData__\s*=\s*(\{[\s\S]*?\});\s*(?:window|<\/script>)/);
                    if (match) {
                        const data = JSON.parse(match[1]);
                        const listingKey = Object.keys(data).find(k => data[k]?.data?.mods?.listItems);
                        if (listingKey) {
                            const items = data[listingKey].data.mods.listItems || [];
                            extracted = items.slice(0, maxResults).map(item => ({
                                name: item.name || '',
                                price: Math.round(parseFloat(item.price || 0)),
                                original_price: Math.round(parseFloat(item.originalPrice || item.price || 0)),
                                discount_pct: item.discount ? parseInt(item.discount) : 0,
                                rating: item.ratingScore ? parseFloat(item.ratingScore) : null,
                                sold_count: 0,
                                store_name: item.sellerName || item.brandName || 'Lazada Seller',
                                store_url: item.productUrl
                                    ? (item.productUrl.startsWith('http') ? item.productUrl : 'https:' + item.productUrl)
                                    : '',
                                badge: item.isPowerSeller ? 'LazMall' : '',
                                platform: 'lazada',
                                is_real: true,
                            }));
                            break;
                        }
                    }
                } catch (e) { /* JSON parse issue, try next script */ }
            }
        }

        // Fallback: DOM parsing if __moduleData__ not found
        if (extracted.length === 0) {
            console.log(`[Lazada] Falling back to DOM parsing`);
            const cards = $('[data-qa-locator="product-item"], .Bm3ON, .box--ZO8i6').toArray();
            for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
                const card = $(cards[i]);
                const name = card.find('[class*="title"], .RfS5p').text().trim();
                const pt = card.find('[class*="price"], .ooOxS').text().replace(/[^0-9]/g, '');
                const price = parseInt(pt) || 0;
                const store_name = card.find('[class*="seller"], [class*="shop"]').text().trim() || 'Lazada Seller';
                let store_url = card.find('a').attr('href') || '';
                if (store_url && !store_url.startsWith('http')) store_url = 'https:' + store_url;
                if (price > 1000 && name.length > 2) {
                    extracted.push({ name, price, original_price: price, discount_pct: 0, rating: null, sold_count: 0, store_name, badge: '', store_url, platform: 'lazada', is_real: true });
                }
            }
        }

        for (const item of extracted) {
            if (item.price > 0) listings.push(item);
        }

        console.log(`[Lazada] Found ${listings.length} real listings for "${keyword}"`);

    } catch (err) {
        console.error(`[Lazada] Crawl error: ${err.message}`);
    }

    if (listings.length === 0) {
        console.log('[Lazada] Using fallback data');
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
