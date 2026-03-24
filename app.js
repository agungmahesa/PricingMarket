/* ============================================================
   MARKETPLACE PRICING INTELLIGENCE — app.js (Live API version)
   ============================================================ */

const API = '/api';

// ── Utility ──────────────────────────────────────────────
function formatRp(num) {
  if (!num || num === 0) return '—';
  if (num >= 1000000) return 'Rp ' + (num / 1000000).toFixed(1).replace('.0', '') + ' Jt';
  if (num >= 1000) return 'Rp ' + Math.round(num / 1000) + 'K';
  return 'Rp ' + num;
}
function formatRpFull(num) {
  if (!num) return '—';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}
function scoreColor(s) {
  if (s >= 85) return '#22c55e';
  if (s >= 70) return '#f59e0b';
  return '#ef4444';
}
function computeStatus(ourPrice, minMarket, maxMarket) {
  if (!ourPrice || !minMarket) return 'belum';
  const median = (minMarket + maxMarket) / 2;
  if (ourPrice > median * 1.08) return 'tinggi';
  if (ourPrice < median * 0.92) return 'rendah';
  return 'optimal';
}
function computeScore(ourPrice, minMarket, medianMarket) {
  if (!ourPrice || !medianMarket) return null;
  const diff = Math.abs(ourPrice - medianMarket) / medianMarket;
  return Math.max(40, Math.round(100 - diff * 200));
}

// ── State ─────────────────────────────────────────────────
let allProducts = [];
let allAlerts = [];
let selectedProductId = null;
let scrapePollers = {};
let priceChartInstance = null;

// ── API Calls ─────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    return await res.json();
  } catch (e) {
    console.error('API Error:', path, e.message);
    return { success: false, error: e.message };
  }
}

// ── Load Dashboard Stats ──────────────────────────────────
async function loadStats() {
  const r = await apiFetch('/stats');
  if (!r.success) return;
  const { productCount, listingCount, alertCount, avgMarketPrice } = r.data;
  animateValue('stat-products', document.getElementById('stat-products')?.textContent, productCount);
  animateValue('stat-competitors', document.getElementById('stat-competitors')?.textContent, listingCount);
  animateValue('stat-alerts', document.getElementById('stat-alerts')?.textContent, alertCount);
  const priceEl = document.getElementById('stat-avg-price');
  if (priceEl) priceEl.textContent = avgMarketPrice > 0 ? formatRp(avgMarketPrice) : '—';
}

// ── Load Products ─────────────────────────────────────────
async function loadProducts() {
  const r = await apiFetch('/products');
  if (!r.success) {
    showServerError();
    return;
  }
  allProducts = r.data;
  renderProductTable();
  renderProductSelect();
}

function renderProductTable(filter = 'all') {
  const tbody = document.getElementById('productTableBody');
  if (!tbody) return;

  const filtered = filter === 'all' ? allProducts : allProducts.filter(p => {
    const st = computeStatus(p.our_price, p.today_min, p.today_max);
    return st === filter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#64748b;padding:2rem">
      ${allProducts.length === 0
        ? '📦 Belum ada produk. Klik <strong>+ Tambah Produk</strong> untuk mulai monitoring.'
        : 'Tidak ada produk dengan filter ini.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const status = computeStatus(p.our_price, p.today_min, p.today_max);
    const score = computeScore(p.our_price, p.today_min, (p.today_min + p.today_max) / 2);
    const sc = score ? scoreColor(score) : '#64748b';
    const statusLabel = { optimal: '✓ Optimal', tinggi: '↑ Terlalu Tinggi', rendah: '↓ Terlalu Rendah', belum: '⏳ Belum scrape' };
    const lastScrape = p.last_scraped ? new Date(p.last_scraped).toLocaleString('id-ID') : '—';
    const listings = p.listing_count || 0;

    return `<tr>
      <td>
        <div class="product-name">${p.name}</div>
        <div class="product-sku">${p.keyword} · ${p.platforms}</div>
        <div class="product-sku" style="color:#475569">Update: ${lastScrape}</div>
      </td>
      <td><span class="price-val price-ours">${p.our_price > 0 ? formatRpFull(p.our_price) : '—'}</span></td>
      <td><span class="price-val" style="color:#22d3ee">${p.today_min ? formatRpFull(p.today_min) : '—'}</span></td>
      <td><span class="price-val" style="color:#f59e0b">${p.today_avg ? formatRpFull(p.today_avg) : '—'}</span></td>
      <td><span class="price-val" style="color:#94a3b8">${p.today_max ? formatRpFull(p.today_max) : '—'}</span></td>
      <td><span class="status-badge status-${status}">${statusLabel[status]}</span></td>
      <td>
        ${score
        ? `<div class="score-bar-cell"><div class="mini-score-bar"><div class="mini-score-fill" style="width:${score}%;background:${sc}"></div></div><span style="font-size:12px;font-weight:700;color:${sc}">${score}</span></div>`
        : `<span style="color:#475569;font-size:12px">${listings} listing${listings > 1 ? 's' : ''}</span>`}
      </td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="action-btn" onclick="triggerScrape(${p.id})" id="scrape-btn-${p.id}">
          🔄 Scrape
        </button>
        <button class="action-btn" onclick="viewProductDetail(${p.id})">Detail →</button>
        <button class="action-btn" style="border-color:#ef4444;color:#ef4444" onclick="deleteProduct(${p.id})">🗑️ Hapus</button>
      </td>
    </tr>`;
  }).join('');
}

function renderProductSelect() {
  const sel = document.getElementById('productSelect');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = allProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if (prev && allProducts.find(p => p.id == prev)) sel.value = prev;
  else if (allProducts.length > 0) {
    sel.value = allProducts[0].id;
    selectedProductId = allProducts[0].id;
  }
}

// ── Load Alerts ───────────────────────────────────────────
async function loadAlerts() {
  const r = await apiFetch('/alerts');
  if (!r.success) return;
  allAlerts = r.data;
  renderAlertsSidebar();
  renderAlertsPage();
  // Update badge
  const unread = allAlerts.filter(a => !a.is_read).length;
  document.querySelectorAll('.badge').forEach(b => { if (b.closest('[data-page="alerts"]')) b.textContent = unread || ''; });
  const notifDot = document.querySelector('.notif-dot');
  if (notifDot) notifDot.style.display = unread > 0 ? 'block' : 'none';
}

function renderAlertsSidebar() {
  const el = document.getElementById('alertsList');
  if (!el) return;
  if (allAlerts.length === 0) {
    el.innerHTML = '<div style="padding:1rem;color:#64748b;font-size:13px">Tidak ada alert.</div>';
    return;
  }
  const typeMap = { danger: '📉', warn: '⚡', info: '📊' };
  el.innerHTML = allAlerts.slice(0, 5).map(a => `
    <div class="alert-item" style="${a.is_read ? 'opacity:0.5' : ''}">
      <div class="alert-icon ${a.type || 'info'}"><span>${typeMap[a.type] || '📋'}</span></div>
      <div class="alert-content">
        <div class="alert-title">${a.title}</div>
        <div class="alert-meta">${a.product_name || ''} · ${new Date(a.created_at).toLocaleString('id-ID')}</div>
      </div>
    </div>
  `).join('');
}

// ── Load Chart ────────────────────────────────────────────
function loadChartJS(cb) {
  if (window.Chart) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  s.onload = cb;
  document.head.appendChild(s);
}

async function loadAndRenderChart(productId, days = 30) {
  const r = await apiFetch(`/products/${productId}/trend?days=${days}`);
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let labels, minArr, avgArr, maxArr, ourArr;

  if (r.success && r.data.length > 0) {
    labels = r.data.map(d => new Date(d.day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
    minArr = r.data.map(d => d.min_price);
    avgArr = r.data.map(d => d.avg_price);
    maxArr = r.data.map(d => d.max_price);
    const product = allProducts.find(p => p.id == productId);
    ourArr = r.data.map(() => product?.our_price || null);
  } else {
    // Fallback mock-style data when no real data yet
    const n = days;
    labels = []; minArr = []; avgArr = []; maxArr = []; ourArr = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
    }
    // Empty arrays — chart shows empty state
  }

  const makeGrad = (color) => {
    const g = ctx.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, color + '44'); g.addColorStop(1, color + '00');
    return g;
  };

  if (priceChartInstance) priceChartInstance.destroy();
  priceChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Harga Kita', data: ourArr, borderColor: '#6366f1', backgroundColor: makeGrad('#6366f1'), borderWidth: 2.5, pointRadius: 0, tension: 0.4, fill: true },
        { label: 'Min Pasar', data: minArr, borderColor: '#22d3ee', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.4, fill: false },
        { label: 'Median', data: avgArr, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false },
        { label: 'Max Pasar', data: maxArr, borderColor: '#ef4444', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.4, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827', borderColor: '#1e2d45', borderWidth: 1,
          titleColor: '#e2e8f0', bodyColor: '#94a3b8',
          callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + formatRpFull(ctx.parsed.y) },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(30,45,69,0.5)' }, ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(30,45,69,0.5)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => formatRp(v) } },
      },
    },
  });

  // Update subtitle
  const sub = document.querySelector('.card-subtitle');
  const p = allProducts.find(x => x.id == productId);
  if (sub && p) sub.textContent = `${days} hari terakhir · ${p.name}`;
}

// ── Competitor Page ───────────────────────────────────────
async function renderCompetitorPage() {
  const el = document.getElementById('competitorFull');
  if (!el) return;

  el.innerHTML = `<div><div class="section-title">Monitor Kompetitor</div><div class="section-sub">Memuat data...</div></div><div class="comp-grid" id="compGrid"><div style="color:#64748b;padding:2rem">Memuat listing...</div></div>`;

  if (allProducts.length === 0) {
    el.innerHTML = `<div><div class="section-title">Monitor Kompetitor</div><div class="section-sub">Belum ada produk yang dimonitor. Tambah produk dahulu.</div></div>`;
    return;
  }

  const productId = selectedProductId || allProducts[0]?.id;
  const product = allProducts.find(p => p.id == productId);

  const r = await apiFetch(`/products/${productId}/competitors`);
  const listings = r.success ? r.data : [];

  const platLabel = { tokopedia: 'Tokopedia', shopee: 'Shopee', lazada: 'Lazada' };
  const ourPrice = product?.our_price || 0;

  const productSelector = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <label style="font-size:13px;color:#94a3b8">Produk:</label>
      <select id="competitorProductSelect" class="filter-select" onchange="onCompetitorProductChange(this.value)">
        ${allProducts.map(p => `<option value="${p.id}" ${p.id == productId ? 'selected' : ''}>${p.name}</option>`).join('')}
      </select>
      <button class="btn-sm btn-primary" onclick="triggerScrape(${productId})" id="comp-scrape-btn">🔄 Scrape Sekarang</button>
      <button class="btn-sm" style="background:transparent;border:1px solid #ef4444;color:#ef4444" onclick="deleteProduct(${productId}); setTimeout(()=>navigate('dashboard'), 500)">🗑️ Hapus Produk</button>
    </div>
  `;

  const totalListings = listings.length;

  el.innerHTML = `
    <div>
      <div class="section-title">Monitor Kompetitor</div>
      <div class="section-sub">Memantau ${totalListings} listing aktif dari hasil scraping terbaru</div>
    </div>
    ${productSelector}
    <div class="comp-grid" id="compGrid">
      ${listings.length === 0
      ? `<div style="color:#64748b;padding:2rem;grid-column:1/-1;text-align:center">
            Belum ada data kompetitor untuk produk ini.<br>Klik <strong>🔄 Scrape Sekarang</strong> untuk mengambil data real.
           </div>`
      : listings.map(l => {
        const diff = ourPrice > 0
          ? (l.price < ourPrice * 0.97 ? 'cheaper' : l.price > ourPrice * 1.03 ? 'dearer' : 'same')
          : 'same';
        const diffLabel = { cheaper: '⬇ Lebih Murah dari Kita', dearer: '⬆ Lebih Mahal dari Kita', same: '≈ Setara Harga Kita' };
        return `
              <div class="comp-card">
                <div class="comp-platform ${l.platform}">${platLabel[l.platform] || l.platform}</div>
                <div class="comp-store">${l.store_name || '—'}</div>
                <div class="comp-price">${formatRpFull(l.price)}</div>
                <div class="comp-meta">
                  ${l.rating ? `<span class="comp-badge">⭐ ${Number(l.rating).toFixed(1)}</span>` : ''}
                  ${l.sold_count > 0 ? `<span class="comp-badge">🛒 ${l.sold_count.toLocaleString()} terjual</span>` : ''}
                  ${l.discount_pct > 0 ? `<span class="comp-badge" style="color:#ef4444">🔖 -${l.discount_pct}%</span>` : ''}
                  ${l.badge ? `<span class="comp-badge" style="color:#f59e0b;border-color:#f59e0b">🏅 ${l.badge}</span>` : ''}
                </div>
                ${l.store_url ? `<a href="${l.store_url}" target="_blank" style="font-size:11px;color:#6366f1;text-decoration:none;display:inline-block;margin-top:6px">Lihat di ${platLabel[l.platform]} →</a>` : ''}
                <div class="comp-diff ${diff}">${diffLabel[diff]}</div>
                <div style="font-size:11px;color:#475569;margin-top:6px">${new Date(l.scraped_at).toLocaleString('id-ID')}</div>
              </div>`;
      }).join('')}
    </div>
  `;
}

window.onCompetitorProductChange = function (id) {
  selectedProductId = parseInt(id);
  renderCompetitorPage();
};

// ── Recommendations Page ──────────────────────────────────
async function renderRecommendationsPage() {
  const el = document.getElementById('recommendationsFull');
  if (!el) return;

  if (allProducts.length === 0) {
    el.innerHTML = `<div><div class="section-title">Rekomendasi Harga Optimal</div><div class="section-sub">Tambah produk dan lakukan scraping untuk mendapatkan rekomendasi.</div></div>`;
    return;
  }

  const recos = allProducts
    .filter(p => p.today_min && p.today_min > 0)
    .map(p => {
      const status = computeStatus(p.our_price, p.today_min, p.today_max);
      const median = (p.today_min + p.today_max) / 2;
      let optimal, strategy, impact, marginNote;

      if (status === 'tinggi') {
        optimal = Math.round(median * 0.98);
        strategy = 'Penetrasi';
        const volBoost = Math.round((p.our_price - optimal) / p.our_price * 100 * 2.5);
        impact = `+${volBoost}% volume est.`;
        if (p.hpp > 0) {
          const origMargin = Math.round((p.our_price - p.hpp) / p.our_price * 100);
          const newMargin = Math.round((optimal - p.hpp) / optimal * 100);
          marginNote = `Margin: ${origMargin}% → ${newMargin}%`;
        }
      } else if (status === 'rendah') {
        optimal = Math.round(median * 1.02);
        strategy = 'Premium';
        const marginBoost = p.hpp > 0 ? Math.round((optimal - p.our_price) / p.hpp * 100) : 5;
        impact = `Margin +${marginBoost}%`;
        marginNote = '';
      } else {
        optimal = Math.round(median);
        strategy = 'Paritas';
        impact = 'Harga sudah optimal';
        marginNote = '';
      }

      return { product: p, status, optimal, strategy, impact, marginNote };
    });

  el.innerHTML = `
    <div>
      <div class="section-title">Rekomendasi Harga Optimal</div>
      <div class="section-sub">Berdasarkan data real dari ${allProducts.length} produk yang dipantau</div>
    </div>
    ${recos.length === 0
      ? `<div class="card" style="padding:2rem;text-align:center;color:#64748b">Belum ada data harga pasar. Lakukan scraping produk terlebih dahulu.</div>`
      : `<div class="reco-grid">
          ${recos.map(r => `
            <div class="reco-full-card">
              <div>
                <div class="product-name">${r.product.name}</div>
                <div class="product-sku">${r.product.keyword}</div>
              </div>
              <div class="reco-price-row">
                <div class="reco-price-box">
                  <div class="label">Saat Ini</div>
                  <div class="price" style="color:#e2e8f0">${formatRpFull(r.product.our_price)}</div>
                </div>
                <div class="reco-arrow">→</div>
                <div class="reco-price-box" style="border:1px solid rgba(99,102,241,0.3)">
                  <div class="label">Optimal</div>
                  <div class="price" style="color:#22c55e">${formatRpFull(r.optimal)}</div>
                </div>
              </div>
              <div class="reco-impact">
                <span class="impact-chip up">📈 ${r.impact}</span>
                <span class="impact-chip strat">🎯 ${r.strategy}</span>
                ${r.marginNote ? `<span class="impact-chip warn">💰 ${r.marginNote}</span>` : ''}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px">
                <div style="background:#0a0f1e;border-radius:8px;padding:8px;text-align:center">
                  <div style="font-size:10px;color:#64748b">Min Pasar</div>
                  <div style="font-size:13px;font-weight:700;color:#22d3ee">${formatRp(r.product.today_min)}</div>
                </div>
                <div style="background:#0a0f1e;border-radius:8px;padding:8px;text-align:center">
                  <div style="font-size:10px;color:#64748b">Median</div>
                  <div style="font-size:13px;font-weight:700;color:#f59e0b">${formatRp((r.product.today_min + r.product.today_max) / 2)}</div>
                </div>
                <div style="background:#0a0f1e;border-radius:8px;padding:8px;text-align:center">
                  <div style="font-size:10px;color:#64748b">Max Pasar</div>
                  <div style="font-size:13px;font-weight:700;color:#94a3b8">${formatRp(r.product.today_max)}</div>
                </div>
              </div>
              <button class="btn-apply" onclick="applyRecommendation(${r.product.id}, ${r.optimal}, this)">Terapkan Harga</button>
            </div>
          `).join('')}
        </div>`}
  `;
}

window.applyRecommendation = async function (productId, optimal, btn) {
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  const r = await apiFetch(`/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify({ our_price: optimal }),
  });
  if (r.success) {
    btn.textContent = '✓ Harga Diperbarui';
    btn.style.background = '#22c55e';
    await loadProducts();
    await loadStats();
  } else {
    btn.textContent = '✕ Gagal';
    btn.style.background = '#ef4444';
    setTimeout(() => { btn.textContent = 'Terapkan Harga'; btn.style.background = ''; btn.disabled = false; }, 2000);
  }
};

// ── Alerts Full Page ──────────────────────────────────────
function renderAlertsPage() {
  const el = document.getElementById('alertsFull');
  if (!el) return;
  const typeIcons = { danger: '📉', warn: '⚡', info: '📊' };
  el.innerHTML = `
    <div>
      <div class="section-title">Alert & Notifikasi</div>
      <div class="section-sub">${allAlerts.length} alert · ${allAlerts.filter(a => !a.is_read).length} belum dibaca</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${allAlerts.length === 0
      ? `<div class="card" style="padding:2rem;text-align:center;color:#64748b">Belum ada alert. Sistem akan otomatis membuat alert saat scraping mendeteksi perubahan harga.</div>`
      : allAlerts.map((a, i) => `
          <div class="alert-full-item" id="alert-full-${a.id}" style="${a.is_read ? 'opacity:0.5' : ''}">
            <div class="alert-icon ${a.type || 'info'}" style="width:40px;height:40px;font-size:18px;border-radius:10px">${typeIcons[a.type] || '📋'}</div>
            <div class="alert-full-body">
              <div class="alert-full-title">${a.title}</div>
              <div class="alert-full-desc">${a.description || ''}</div>
              <div class="alert-meta" style="margin-top:4px">🕐 ${new Date(a.created_at).toLocaleString('id-ID')} · ${a.product_name || ''}</div>
            </div>
            <div class="alert-actions">
              ${!a.is_read ? `<button class="btn-act" onclick="markAlertRead(${a.id}, this)">✓ Baca</button>` : '<span style="font-size:12px;color:#475569">Dibaca</span>'}
            </div>
          </div>`).join('')}
    </div>
  `;
}

window.markAlertRead = async function (id, btn) {
  await apiFetch(`/alerts/${id}/read`, { method: 'PUT' });
  btn.closest('.alert-full-item').style.opacity = '0.5';
  btn.textContent = 'Dibaca';
  btn.disabled = true;
};

// ── Settings Page ─────────────────────────────────────────
function renderSettingsPage() {
  const el = document.getElementById('settingsFull');
  if (!el) return;
  el.innerHTML = `
    <div><div class="section-title">Pengaturan</div><div class="section-sub">Konfigurasi sistem PriceIQ</div></div>
    <div class="settings-section">
      <h3>Status Server</h3>
      <div class="settings-row">
        <div><div class="settings-label">Backend API</div><div class="settings-desc">http://localhost:3001</div></div>
        <span id="serverStatus" style="font-weight:700;color:#22c55e">● Online</span>
      </div>
      <div class="settings-row">
        <div><div class="settings-label">Database</div><div class="settings-desc">SQLite — priceiq.db</div></div>
        <span style="font-weight:700;color:#22c55e">● Aktif</span>
      </div>
      <div class="settings-row">
        <div><div class="settings-label">Scheduler</div><div class="settings-desc">Auto-scrape setiap 30 menit</div></div>
        <span style="font-weight:700;color:#22c55e">● Berjalan</span>
      </div>
    </div>
    <div class="settings-section">
      <h3>Manajemen Produk</h3>
      <div class="settings-row">
        <div><div class="settings-label">Total Produk Dipantau</div><div class="settings-desc">${allProducts.length} produk aktif</div></div>
        <button class="btn-sm btn-primary" id="batchScrapeBtn" onclick="batchScrapeAll()">🔄 Scrape Semua</button>
      </div>
    </div>
  `;
}

// ── Scraping Controls ─────────────────────────────────────
window.triggerScrape = async function (productId) {
  const btn = document.getElementById(`scrape-btn-${productId}`);
  const compBtn = document.getElementById('comp-scrape-btn');
  const spinBtns = [btn, compBtn].filter(Boolean);

  spinBtns.forEach(b => { b.disabled = true; b.textContent = '⏳ Scraping...'; });

  const r = await apiFetch(`/scrape/${productId}`, { method: 'POST' });

  if (r.success && r.status === 'done') {
    // Direct success if server awaited
    spinBtns.forEach(b => { b.disabled = false; b.textContent = '🔄 Scrape'; });
    showToast(`✅ Scraping selesai! ${r.count || (r.data ? r.data.length : 0)} listing ditemukan.`, 'success');
    await loadProducts(); await loadStats(); await loadAlerts();
    const activePage = document.querySelector('.nav-item.active')?.dataset.page;
    if (activePage === 'competitors') await renderCompetitorPage();
    if (activePage === 'recommendations') await renderRecommendationsPage();
    loadChartJS(() => loadAndRenderChart(selectedProductId || allProducts[0]?.id));
    return;
  }

  if (!r.success) {
    spinBtns.forEach(b => { b.disabled = false; b.textContent = '🔄 Scrape'; });
    showToast('⚠️ Gagal: ' + (r.error || 'Timeout'), 'error');
    return;
  }

  showToast('Scraping dimulai...', 'info');

  // Fallback Polling (if server returns early or for batch)
  if (scrapePollers[productId]) clearInterval(scrapePollers[productId]);
  scrapePollers[productId] = setInterval(async () => {
    const sr = await apiFetch(`/scrape/${productId}/status`);
    if (sr.success && (sr.data.status === 'done' || sr.data.status === 'error')) {
      clearInterval(scrapePollers[productId]);
      delete scrapePollers[productId];
      spinBtns.forEach(b => { b.disabled = false; b.textContent = '🔄 Scrape'; });

      if (sr.data.status === 'done') {
        showToast(`✅ Scraping selesai!`, 'success');
        await loadProducts(); await loadStats(); await loadAlerts();
        const activePage = document.querySelector('.nav-item.active')?.dataset.page;
        if (activePage === 'competitors') await renderCompetitorPage();
        if (activePage === 'recommendations') await renderRecommendationsPage();
        loadChartJS(() => loadAndRenderChart(selectedProductId || allProducts[0]?.id));
      } else {
        showToast('⚠️ Scraping error.', 'error');
      }
    }
  }, 5000);
};

window.batchScrapeAll = async function () {
  const btn = document.getElementById('batchScrapeBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Scraping...'; }
  await apiFetch('/scrape/all', { method: 'POST' });
  showToast(`Batch scraping dimulai untuk ${allProducts.length} produk.`, 'info');
  setTimeout(async () => {
    await loadProducts(); await loadStats(); await loadAlerts();
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Scrape Semua'; }
  }, 60000);
};

window.deleteProduct = async function (id) {
  if (!confirm('Hapus produk ini dari monitoring?')) return;
  try {
    const r = await apiFetch(`/products/${id}`, { method: 'DELETE' });
    if (r.success) {
      if (selectedProductId === id) selectedProductId = null;
      await loadProducts();
      await loadStats();
      showToast('Produk berhasil dihapus.', 'info');
      if (allProducts.length > 0 && !selectedProductId) {
        selectedProductId = allProducts[0].id;
        loadChartJS(() => loadAndRenderChart(selectedProductId, 30));
      } else if (allProducts.length === 0) {
        loadChartJS(() => loadAndRenderChart(null, 30));
      }
    } else {
      showToast('Gagal menghapus produk: ' + (r.error || 'Server error'), 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan: ' + err.message, 'error');
  }
};

window.viewProductDetail = async function (id) {
  selectedProductId = id;
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  await navigate('competitors');
  document.querySelector('[data-page="competitors"]').click();
};

// ── Toast Notification ────────────────────────────────────
function showToast(msg, type = 'info') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const colors = { success: '#22c55e', error: '#ef4444', info: '#6366f1' };
  const el = document.createElement('div');
  el.id = 'toast';
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:#111827;border:1px solid ${colors[type]};border-radius:10px;
    padding:12px 18px;color:#e2e8f0;font-size:13px;font-family:Inter,sans-serif;
    box-shadow:0 8px 30px rgba(0,0,0,0.5);max-width:340px;
    animation:slideIn 0.3s ease;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el && el.remove(), 5000);
}

// ── Add Product Modal ─────────────────────────────────────
function openAddProduct() {
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

async function saveProduct() {
  const name = document.getElementById('inp-name')?.value.trim();
  const keyword = document.getElementById('inp-keyword')?.value.trim();
  const sku = document.getElementById('inp-sku')?.value.trim();
  const category = document.getElementById('inp-category')?.value;
  const our_price = parseFloat(document.getElementById('inp-price')?.value) || 0;
  const hpp = parseFloat(document.getElementById('inp-hpp')?.value) || 0;
  const target_margin = parseFloat(document.getElementById('inp-margin')?.value) || 20;

  if (!name || !keyword) {
    showToast('⚠️ Nama produk dan keyword wajib diisi.', 'error');
    return;
  }

  const platforms = [];
  document.querySelectorAll('#platform-checks input:checked').forEach(cb => platforms.push(cb.value));
  if (platforms.length === 0) { showToast('⚠️ Pilih minimal satu platform.', 'error'); return; }

  const saveBtn = document.getElementById('modalSave');
  saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan...';

  const r = await apiFetch('/products', {
    method: 'POST',
    body: JSON.stringify({ name, keyword, sku, category, our_price, hpp, target_margin, platforms }),
  });

  saveBtn.disabled = false; saveBtn.textContent = 'Simpan & Pantau';

  if (r.success) {
    closeModal();
    await loadProducts();
    await loadStats();
    showToast(`✅ "${name}" ditambahkan! Klik 🔄 Scrape untuk ambil data harga.`, 'success');
    // Auto-trigger scrape
    setTimeout(() => triggerScrape(r.data.id), 1000);
  } else {
    showToast('⚠️ Gagal menyimpan: ' + r.error, 'error');
  }
}

// ── Server Error State ────────────────────────────────────
function showServerError() {
  const tbody = document.getElementById('productTableBody');
  if (!tbody) return;

  const isVercel = window.location.hostname.includes('vercel.app');
  const errorMsg = isVercel
    ? `⚠️ Dashboard tidak dapat terhubung ke Backend / Supabase.<br>
       <span style="font-size:0.9rem;opacity:0.8">Pastikan <b>Environment Variables</b> (SUPABASE_URL & KEY) sudah diset di Vercel <br> dan tabel database sudah dibuat melalui SQL Editor.</span>`
    : `⚠️ Tidak dapat terhubung ke server. Pastikan server berjalan:<br>
       <code style="background:#0a0f1e;padding:4px 8px;border-radius:4px;color:#22d3ee">cd pricing-intelligence && npm start</code>`;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:2rem">
    ${errorMsg}
  </td></tr>`;
}

// ── Navigation ────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard', monitor: 'Monitor Harga',
  competitors: 'Kompetitor', recommendations: 'Rekomendasi',
  alerts: 'Alert', settings: 'Pengaturan',
};

async function navigate(page) {
  document.querySelectorAll('.page').forEach(el => { el.classList.remove('active'); el.style.display = 'none'; });
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const target = document.getElementById('page-' + page);
  if (target) { target.style.display = 'flex'; requestAnimationFrame(() => target.classList.add('active')); }
  const navItem = document.querySelector(`[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;

  if (page === 'competitors') await renderCompetitorPage();
  if (page === 'recommendations') await renderRecommendationsPage();
  if (page === 'alerts') renderAlertsPage();
  if (page === 'settings') renderSettingsPage();
}

// ── Count Animation ───────────────────────────────────────
function animateValue(id, from, to, duration = 800) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  const fromNum = parseFloat(String(from).replace(/[^0-9]/g, '')) || 0;
  function step(ts) {
    const p = Math.min((ts - start) / duration, 1);
    const val = Math.round(fromNum + (to - fromNum) * (1 - Math.pow(1 - p, 3)));
    el.textContent = val.toLocaleString('id-ID');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); navigate(item.dataset.page); });
  });

  // Platform buttons
  document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // Filter
  document.getElementById('filterStatus')?.addEventListener('change', function () {
    renderProductTable(this.value);
  });

  // Chart tabs
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const pid = selectedProductId || allProducts[0]?.id;
      if (pid) loadChartJS(() => loadAndRenderChart(pid, parseInt(this.dataset.range)));
    });
  });

  // Product select for chart
  document.getElementById('productSelect')?.addEventListener('change', function () {
    selectedProductId = parseInt(this.value);
    loadChartJS(() => loadAndRenderChart(selectedProductId, 30));
  });

  // Modal
  document.getElementById('addProductBtn')?.addEventListener('click', openAddProduct);
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('modalCancel')?.addEventListener('click', closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  document.getElementById('modalSave')?.addEventListener('click', saveProduct);

  // Refresh
  document.getElementById('refreshBtn')?.addEventListener('click', async function () {
    this.querySelector('svg').style.animation = 'spin 0.6s linear';
    await loadStats();
    await loadProducts();
    await loadAlerts();
    loadChartJS(() => loadAndRenderChart(selectedProductId || allProducts[0]?.id));
    setTimeout(() => this.querySelector('svg').style.animation = '', 700);
  });

  // Search
  document.getElementById('searchInput')?.addEventListener('input', function () {
    const q = this.value.toLowerCase();
    document.querySelectorAll('#productTableBody tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // Mobile menu
  document.getElementById('menuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Initial data load
  await loadStats();
  await loadProducts();
  await loadAlerts();

  // Chart
  if (allProducts.length > 0) {
    selectedProductId = allProducts[0].id;
    loadChartJS(() => loadAndRenderChart(selectedProductId, 30));
  } else {
    loadChartJS(() => loadAndRenderChart(null, 30));
  }
});

// Add slide-in animation
const style = document.createElement('style');
style.textContent = `@keyframes slideIn { from { transform: translateX(20px); opacity:0 } to { transform: translateX(0); opacity:1 } }`;
document.head.appendChild(style);
