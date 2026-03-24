/**
 * scheduler.js — Cron job that scrapes all products every 30 minutes
 */
const cron = require('node-cron');
const { stmts } = require('./db');
const { scrapeProduct } = require('./routes/scrape');

let isRunning = false;

function startScheduler() {
    // Every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
        if (isRunning) {
            console.log('[Scheduler] Previous run still in progress, skipping...');
            return;
        }
        isRunning = true;
        console.log('[Scheduler] Starting scheduled scrape of all products...');

        const products = await stmts.getAllProducts();
        for (const product of products) {
            try {
                const listings = await scrapeProduct(product);
                console.log(`[Scheduler] Done: "${product.name}" — ${listings.length} listings`);
            } catch (err) {
                console.error(`[Scheduler] Error: "${product.name}" — ${err.message}`);
            }
            // 5s delay between products
            await new Promise(r => setTimeout(r, 5000));
        }

        isRunning = false;
        console.log(`[Scheduler] Completed. Next run in 30 minutes.`);
    });

    console.log('[Scheduler] Started — will scrape every 30 minutes');
}

module.exports = { startScheduler };
