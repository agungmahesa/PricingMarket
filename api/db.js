/**
 * db.js — Supabase database helpers (Replacement for SQLite)
 */
const supabase = require('./supabase');

const stmts = {
  // Products
  getAllProducts: async () => {
    const { data: products, error } = await supabase.from('products').select('*').eq('active', 1).order('created_at', { ascending: false });
    if (error) throw error;

    // Fetch today's prices for aggregation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: prices, error: priceErr } = await supabase.from('price_history').select('product_id, price').gte('scraped_at', today.toISOString());

    return products.map(p => {
      const productPrices = (prices || []).filter(ph => ph.product_id === p.id).map(ph => ph.price);
      let today_min = null, today_avg = null, today_max = null;
      if (productPrices.length > 0) {
        today_min = Math.min(...productPrices);
        today_max = Math.max(...productPrices);
        today_avg = productPrices.reduce((a, b) => a + b, 0) / productPrices.length;
      }
      return {
        ...p,
        today_min,
        today_avg,
        today_max,
        listing_count: productPrices.length
      };
    });
  },

  getProductById: async (id) => {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  insertProduct: async (p) => {
    const { data, error } = await supabase.from('products').insert([p]).select().single();
    if (error) throw error;
    return data; // contains id
  },

  updateProduct: async (p) => {
    const { id, ...updates } = p;
    const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  updateLastScraped: async (id) => {
    await supabase.from('products').update({ last_scraped: new Date().toISOString() }).eq('id', id);
  },

  deleteProduct: async (id) => {
    await supabase.from('products').update({ active: 0 }).eq('id', id);
  },

  // Price history
  getRecentPrices: async (product_id) => {
    const { data, error } = await supabase.from('price_history').select('*').eq('product_id', product_id).order('scraped_at', { ascending: false }).limit(200);
    if (error) throw error;
    return data;
  },

  getLatestByPlatform: async (product_id) => {
    const { data: prices, error } = await supabase.from('price_history').select('*').eq('product_id', product_id).order('scraped_at', { ascending: false });
    if (error) throw error;

    const latestPerPlatform = {};
    for (const p of prices) {
      if (!latestPerPlatform[p.platform]) {
        const latestTime = p.scraped_at;
        latestPerPlatform[p.platform] = prices.filter(x => x.platform === p.platform && new Date(x.scraped_at).getTime() > new Date(latestTime).getTime() - 60000);
      }
    }
    return Object.values(latestPerPlatform).flat().sort((a, b) => a.price - b.price);
  },

  getPriceTrend: async (product_id, days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const { data, error } = await supabase.from('price_history').select('*').eq('product_id', product_id).gte('scraped_at', d.toISOString());
    if (error) throw error;

    const grouped = {};
    data.forEach(row => {
      const day = row.scraped_at.split('T')[0];
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(row.price);
    });

    return Object.keys(grouped).sort().map(day => {
      const arr = grouped[day];
      return {
        day,
        min_price: Math.min(...arr),
        max_price: Math.max(...arr),
        avg_price: arr.reduce((a, b) => a + b, 0) / arr.length,
        listing_count: arr.length
      };
    });
  },

  // Alerts
  getAlerts: async () => {
    const { data, error } = await supabase.from('alerts').select('*, products(name)').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data.map(d => ({ ...d, product_name: d.products?.name }));
  },

  insertAlert: async (a) => {
    await supabase.from('alerts').insert([a]);
  },

  markAlertRead: async (id) => {
    await supabase.from('alerts').update({ is_read: 1 }).eq('id', id);
  }
};

// Bulk insert price listings
const insertListings = async (productId, listings) => {
  const payload = listings.map(l => ({
    product_id: productId,
    platform: l.platform,
    listing_name: l.name || '',
    store_name: l.store_name || '',
    store_url: l.store_url || '',
    price: l.price,
    original_price: l.original_price || l.price,
    discount_pct: l.discount_pct || 0,
    rating: l.rating || null,
    sold_count: l.sold_count || 0,
    badge: l.badge || '',
    is_real: l.is_real === true,
  }));

  if (payload.length > 0) {
    await supabase.from('price_history').insert(payload);
  }
  await stmts.updateLastScraped(productId);
};

// Auto-create alerts when price drops significantly
async function checkAndCreateAlerts(productId, newListings, previousMin) {
  if (!previousMin || newListings.length === 0) return;
  const newMin = Math.min(...newListings.map(l => l.price));
  if (newMin < previousMin * 0.95) {
    const cheapest = newListings.find(l => l.price === newMin);
    await stmts.insertAlert({
      product_id: productId,
      type: 'danger',
      title: `Kompetitor turunkan harga ke ${formatRp(newMin)}`,
      description: `${cheapest?.store_name || 'Kompetitor'} di ${cheapest?.platform} menawarkan harga baru ${formatRp(newMin)} (turun ${Math.round((1 - newMin / previousMin) * 100)}% dari sebelumnya ${formatRp(previousMin)}).`,
    });
  }
}

function formatRp(n) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

module.exports = { stmts, insertListings, checkAndCreateAlerts };
