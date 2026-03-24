/**
 * routes/scrape.js — On-demand and batch scraping triggers (Async Supabase)
 */
const express = require('express');
const router = express.Router();
const { stmts, insertListings, checkAndCreateAlerts } = require('../db');
const { scrapeTokopedia } = require('../scrapers/tokopedia');
const { scrapeShopee } = require('../scrapers/shopee');
const { scrapeLazada } = require('../scrapers/lazada');

// Track in-progress scrapes
const scrapeStatus = new Map(); // productId -> { status, startedAt, result }

// Helper: run scrape for a single product
async function scrapeProduct(product) {
    const platforms = (product.platforms || 'tokopedia').split(',').map(p => p.trim());
    const allListings = [];

    // Get previous min price for alert comparison
    const prevPrices = await stmts.getRecentPrices(product.id);
    const prevMin = prevPrices.length > 0 ? Math.min(...prevPrices.map(p => p.price)) : null;

    const scraperMap = {
        tokopedia: scrapeTokopedia,
        shopee: scrapeShopee,
        lazada: scrapeLazada,
    };

    // Run all scrapers in parallel to fit in Vercel's 10s timeout
    const scrapePromises = platforms
        .filter(p => scraperMap[p])
        .map(async (platform) => {
            try {
                console.log(`[Scraper] Starting ${platform} for "${product.keyword}"`);
                // Limit to 10 results for speed
                return await scraperMap[platform](product.keyword, 10, product.our_price);
            } catch (err) {
                console.error(`[Scraper] ${platform} failed: ${err.message}`);
                return [];
            }
        });

    const results = await Promise.all(scrapePromises);
    results.forEach(listings => allListings.push(...listings));

    if (allListings.length > 0) {
        await insertListings(product.id, allListings);
        await checkAndCreateAlerts(product.id, allListings, prevMin);
    }

    return allListings;
}

// POST /api/scrape/:id — scrape a single product
router.post('/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const product = await stmts.getProductById(productId);

        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

        if (scrapeStatus.get(productId)?.status === 'running') {
            return res.json({ success: true, status: 'already_running', message: 'Scrape sedang berjalan...' });
        }

        scrapeStatus.set(productId, { status: 'running', startedAt: new Date().toISOString() });

        try {
            const listings = await scrapeProduct(product);
            scrapeStatus.set(productId, { status: 'done', finishedAt: new Date().toISOString(), count: listings.length });
            res.json({ success: true, status: 'done', data: listings, message: `Scraping selesai untuk "${product.name}"` });
        } catch (err) {
            scrapeStatus.set(productId, { status: 'error', error: err.message });
            res.status(500).json({ success: false, error: err.message });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/scrape/:id/status
router.get('/:id/status', (req, res) => {
    const productId = parseInt(req.params.id);
    const status = scrapeStatus.get(productId) || { status: 'idle' };
    res.json({ success: true, data: status });
});

// POST /api/scrape/all — scrape all active products sequentially
router.post('/all', async (req, res) => {
    try {
        const products = await stmts.getAllProducts();
        res.json({ success: true, message: `Batch scrape dimulai untuk ${products.length} produk`, count: products.length });

        // Run sequentially
        (async () => {
            for (const product of products) {
                if (scrapeStatus.get(product.id)?.status === 'running') continue;
                scrapeStatus.set(product.id, { status: 'running', startedAt: new Date().toISOString() });
                try {
                    const listings = await scrapeProduct(product);
                    scrapeStatus.set(product.id, { status: 'done', finishedAt: new Date().toISOString(), count: listings.length });
                } catch (err) {
                    scrapeStatus.set(product.id, { status: 'error', error: err.message });
                }
                await new Promise(r => setTimeout(r, 3000));
            }
            console.log('[Scraper] Batch scrape complete');
        })();
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = { router, scrapeProduct };
