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

    stockApp.setTableMessage(body, 8, 'Loading stock...');

    try {
        const response = await fetch('/api/pos/products/all');
        const products = await response.json();

        if (!response.ok) {
            throw new Error(products.error || 'Failed to load stock');
        }

        const inventoryRows = dedupeStockProducts(products);

        if (!inventoryRows.length) {
            stockApp.setTableMessage(body, 8, 'No stock products found.');
            return;
        }

        stockApp.replaceChildren(body, inventoryRows.map((product) => {
            const row = document.createElement('tr');

            row.append(
                stockApp.createTableCell(product.name || ''),
                stockApp.createTableCell(product.category || ''),
                stockApp.createTableCell(product.size || ''),
                stockApp.createTableCell(product.sku || '-'),
                stockApp.createTableCell(stockApp.formatCurrency(product.price)),
                stockApp.createTableCell(String(Number(product.stockOnHand || 0))),
                stockApp.createTableCell(String(Number(product.stockInWarehouse || 0)))
            );

            const actionsCell = document.createElement('td');
            const editButton = stockApp.createButton({
                className: 'btn btn-secondary btn-small',
                text: 'Edit',
                onClick: () => stockApp.openPOSProductModal?.(product)
            });
            actionsCell.appendChild(editButton);
            row.appendChild(actionsCell);

            return row;
        }));

    } catch (error) {
        stockApp.setTableMessage(body, 8, error.message, { color: '#d9534f', className: '' });
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
