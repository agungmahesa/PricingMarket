/**
 * server.js — Main Express application (Supabase Version)
 */
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────
const productsRouter = require('./routes/products');
const pricesRouter = require('./routes/prices');
const { router: scrapeRouter } = require('./routes/scrape');
const { stmts } = require('./db');
const supabase = require('./supabase');

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API is alive', time: new Date().toISOString() });
});
// Proxy Diagnostic
app.get('/api/health/proxy', async (req, res) => {
    const axios = require('axios');
    const proxyUrl = process.env.PROXY_URL;
    if (!proxyUrl) return res.json({ success: false, error: 'PROXY_URL not set' });
    try {
        const { URL } = require('url');
        const p = new URL(proxyUrl);
        const start = Date.now();
        const response = await axios.get('https://api.ipify.org?format=json', {
            proxy: {
                protocol: p.protocol.replace(':', ''),
                host: p.hostname,
                port: p.port,
                auth: { username: p.username, password: p.password }
            },
            timeout: 10000
        });
        res.json({ success: true, ip: response.data.ip, duration: Date.now() - start });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
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

// GET /api/stats — dashboard summary stats
app.get('/api/stats', async (req, res) => {
    try {
        if (!supabase) throw new Error('Supabase client not initialized');
        const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });

        // Simple mock if DB empty or unreachable
        res.json({
            success: true,
            data: {
                productCount: productCount || 0,
                listingCount: 0,
                alertCount: 0,
                avgMarketPrice: 0
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Export app for Vercel
module.exports = app;

// ── Start Server ──────────────────────────────────────────
// Only listen if not running in a serverless environment (like Vercel)
if (require.main === module) {
    app.listen(PORT, () => console.log(`Run on ${PORT}`));
}
