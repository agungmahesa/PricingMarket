/**
 * routes/prices.js — Price history and analytics endpoints (Supabase Async)
 */
const express = require('express');
const router = express.Router();
const { stmts } = require('../db');

// GET /api/products/:id/prices — all recent price listings
router.get('/:id/prices', async (req, res) => {
    try {
        const prices = await stmts.getRecentPrices(req.params.id);
        res.json({ success: true, data: prices });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/products/:id/competitors — latest snapshot per platform
router.get('/:id/competitors', async (req, res) => {
    try {
        const listings = await stmts.getLatestByPlatform(req.params.id);
        res.json({ success: true, data: listings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/products/:id/trend?days=30 — daily min/avg/max trend
router.get('/:id/trend', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const trend = await stmts.getPriceTrend(req.params.id, days);
        res.json({ success: true, data: trend });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
