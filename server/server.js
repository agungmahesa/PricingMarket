/**
 * server.js — Main Express application (Supabase Version)
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));

// ── Routes ────────────────────────────────────────────────
const productsRouter = require('./routes/products');
const pricesRouter = require('./routes/prices');
const { router: scrapeRouter } = require('./routes/scrape');
const { stmts } = require('./db');
const supabase = require('./supabase');

app.use('/api/products', productsRouter);
app.use('/api/products', pricesRouter);   // nested: /api/products/:id/prices etc.
app.use('/api/scrape', scrapeRouter);

// GET /api/alerts (standalone)
app.get('/api/alerts', async (req, res) => {
    try {
        const alerts = await stmts.getAlerts();
        res.json({ success: true, data: alerts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/alerts/:id/read
app.put('/api/alerts/:id/read', async (req, res) => {
    try {
        await stmts.markAlertRead(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/stats — dashboard summary stats
app.get('/api/stats', async (req, res) => {
    try {
        // Product Count
        const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', 1);

        // Listing Count (Last 24h)
        const d = new Date();
        d.setHours(d.getHours() - 24);
        const { data: listings } = await supabase.from('price_history').select('price').gte('scraped_at', d.toISOString());

        const listingCount = listings ? listings.length : 0;

        // Alert Count (Unread)
        const { count: alertCount } = await supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('is_read', 0);

        // Avg Market Price
        let avgMarketPrice = 0;
        if (listings && listings.length > 0) {
            avgMarketPrice = listings.reduce((a, b) => a + b.price, 0) / listings.length;
        }

        res.json({
            success: true,
            data: {
                productCount: productCount || 0,
                listingCount,
                alertCount: alertCount || 0,
                avgMarketPrice: Math.round(avgMarketPrice)
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// SPA fallback for HTML frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Export app for Vercel
module.exports = app;

// ── Start Server ──────────────────────────────────────────
// Only listen if not running in a serverless environment (like Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 PriceIQ Server running at http://localhost:${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}\n`);

        // Start scheduler
        try {
            const { startScheduler } = require('./scheduler');
            startScheduler();
        } catch (e) {
            console.warn('[Scheduler] Could not start scheduler:', e.message);
        }
    });
}
