const stockApp = window.UniformShopApp;

function setupStockManager() {
    const refreshBtn = document.getElementById('stockRefreshBtn');
    const syncBtn = document.getElementById('stockSyncBtn');

    refreshBtn?.addEventListener('click', loadStockSection);
    syncBtn?.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/pos/products/sync-from-sales', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Unable to sync products from sales');
            }
            await loadStockSection();
        } catch (error) {
            alert(error.message);
        }
    });
}

async function loadStockSection() {
    const body = document.getElementById('stockTableBody');
    if (!body) {
        return;
    }

    body.innerHTML = '<tr><td colspan="8" class="loading">Loading stock...</td></tr>';

    try {
        const response = await fetch('/api/pos/products/all');
        const products = await response.json();

        if (!response.ok) {
            throw new Error(products.error || 'Failed to load stock');
        }

        const inventoryRows = dedupeStockProducts(products);

        if (!inventoryRows.length) {
            body.innerHTML = '<tr><td colspan="8" class="loading">No stock products found.</td></tr>';
            return;
        }

        body.innerHTML = inventoryRows.map((product) => `
            <tr>
                <td>${stockApp.escapeHtml(product.name)}</td>
                <td>${stockApp.escapeHtml(product.category || '')}</td>
                <td>${stockApp.escapeHtml(product.size || '')}</td>
                <td>${stockApp.escapeHtml(product.sku || '-')}</td>
                <td>${stockApp.formatCurrency(product.price)}</td>
                <td>${Number(product.stockOnHand || 0)}</td>
                <td>${Number(product.stockInWarehouse || 0)}</td>
                <td>
                    <button class="btn btn-secondary btn-small" data-stock-edit="${product._id}">Edit</button>
                </td>
            </tr>
        `).join('');

        body.querySelectorAll('[data-stock-edit]').forEach((button) => {
            button.addEventListener('click', async () => {
                const product = inventoryRows.find((item) => item._id === button.getAttribute('data-stock-edit'));
                if (product) {
                    stockApp.openPOSProductModal?.(product);
                }
            });
        });

    } catch (error) {
        body.innerHTML = `<tr><td colspan="8" style="color: #d9534f;">${stockApp.escapeHtml(error.message)}</td></tr>`;
    }
}

function dedupeStockProducts(products) {
    const byKey = new Map();

    for (const product of products) {
        const key = getProductDedupeKey(product);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, product);
            continue;
        }

        if (shouldReplaceProduct(existing, product)) {
            byKey.set(key, product);
        }
    }

    return [...byKey.values()].sort((a, b) => {
        const categoryCompare = String(a.category || '').localeCompare(String(b.category || ''));
        if (categoryCompare !== 0) {
            return categoryCompare;
        }

        const sizeCompare = stockApp.compareSizes?.(a.size, b.size) || 0;
        if (sizeCompare !== 0) {
            return sizeCompare;
        }

        const nameA = String(a.name || '').toLowerCase();
        const nameB = String(b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });
}

function getProductDedupeKey(product) {
    const salesRecordId = String(product.salesRecordId || '').trim();
    if (salesRecordId) {
        return `sales:${salesRecordId}`;
    }

    const normalizedSku = String(product.sku || '').trim().toUpperCase();
    const normalizedCategory = String(product.category || '').trim().toUpperCase();
    const normalizedSize = String(product.size || '').trim().toUpperCase();

    if (normalizedSku) {
        return `sku:${normalizedSku}`;
    }

    if (normalizedCategory || normalizedSize) {
        return `variant:${normalizedCategory}|${normalizedSize}`;
    }

    const normalizedName = String(product.name || '').trim().toUpperCase();
    return `name:${normalizedName}`;
}

function shouldReplaceProduct(existing, candidate) {
    const existingTime = Date.parse(existing.updatedAt || existing.createdAt || 0);
    const candidateTime = Date.parse(candidate.updatedAt || candidate.createdAt || 0);

    if (Number.isNaN(existingTime)) {
        return true;
    }
    if (Number.isNaN(candidateTime)) {
        return false;
    }
    return candidateTime > existingTime;
}

stockApp.setupStockManager = setupStockManager;
stockApp.loadStockSection = loadStockSection;
