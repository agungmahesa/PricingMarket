const express = require('express');
const router = express.Router();
const { stmts } = require('../db');

// GET /api/products — list all active products with latest market stats
router.get('/', async (req, res) => {
    try {
        const products = await stmts.getAllProducts();
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/products/:id — get single product
router.get('/:id', async (req, res) => {
    try {
        const product = await stmts.getProductById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/products — add a new product to monitor
router.post('/', async (req, res) => {
    try {
        const {
            name, keyword, sku = '', category = 'Umum',
            our_price = 0, hpp = 0, target_margin = 20,
            platforms = ['tokopedia', 'shopee'],
        } = req.body;

        if (!name || !keyword) {
            return res.status(400).json({ success: false, error: 'name and keyword are required' });
        }

        const created = await stmts.insertProduct({
            name, keyword, sku, category,
            our_price: parseFloat(our_price) || 0,
            hpp: parseFloat(hpp) || 0,
            target_margin: parseFloat(target_margin) || 20,
            platforms: Array.isArray(platforms) ? platforms.join(',') : platforms,
        });

        res.status(201).json({ success: true, data: created });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/products/:id — update product
router.put('/:id', async (req, res) => {
    try {
        const existing = await stmts.getProductById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });

        const {
            name = existing.name,
            keyword = existing.keyword,
            sku = existing.sku,
            category = existing.category,
            our_price = existing.our_price,
            hpp = existing.hpp,
            target_margin = existing.target_margin,
            platforms = existing.platforms,
        } = req.body;

        const updated = await stmts.updateProduct({
            id: req.params.id, name, keyword, sku, category,
            our_price: parseFloat(our_price),
            hpp: parseFloat(hpp),
            target_margin: parseFloat(target_margin),
            platforms: Array.isArray(platforms) ? platforms.join(',') : platforms,
        });

        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/products/:id — soft-delete (marks inactive)
router.delete('/:id', async (req, res) => {
    try {
        const existing = await stmts.getProductById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });

        await stmts.deleteProduct(req.params.id);
        res.json({ success: true, message: 'Product removed from monitoring' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
