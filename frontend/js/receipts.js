const receiptsApp = window.UniformShopApp;

function setupReceipts() {
    const refreshBtn = document.getElementById('receiptRefreshBtn');
    const closeBtn = document.getElementById('receiptPreviewClose');
    const modal = document.getElementById('receiptPreviewModal');

    refreshBtn?.addEventListener('click', () => {
        loadReceiptsSection();
    });
    closeBtn?.addEventListener('click', closeReceiptPreview);

    if (modal) {
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeReceiptPreview();
            }
        });
    }
}

async function loadReceiptsSection() {
    const body = document.getElementById('receiptHistoryBody');
    if (!body) {
        return;
    }

    const orderDateFilter = document.getElementById('posOrderDate')?.value || '';
    receiptsApp.loadPOSOrders?.(orderDateFilter);

    body.innerHTML = '<tr><td colspan="6" class="loading">Loading receipts...</td></tr>';

    try {
        const response = await fetch('/api/pos/orders/receipts?limit=250');
        const receipts = await response.json();

        if (!response.ok) {
            throw new Error(receipts.error || 'Failed to load receipts');
        }

        if (!receipts.length) {
            body.innerHTML = '<tr><td colspan="6" class="loading">No receipts found.</td></tr>';
            return;
        }

        body.innerHTML = receipts.map((receipt) => {
            const statusClass = receipt.receiptStatus === 'saved' || receipt.receiptStatus === 'sent'
                ? 'pos-status-active'
                : 'pos-status-warning';

            return `
                <tr>
                    <td>${receiptsApp.escapeHtml(receipt.orderNumber)}</td>
                    <td>${new Date(receipt.createdAt).toLocaleString()}</td>
                    <td>${receiptsApp.escapeHtml((receipt.paymentMethod || '').toUpperCase())}</td>
                    <td>${receiptsApp.formatCurrency(receipt.total)}</td>
                    <td><span class="pos-status-pill ${statusClass}">${receiptsApp.escapeHtml(receipt.receiptStatus || '-')}</span></td>
                    <td><button class="btn btn-secondary btn-small" data-receipt-view="${receipt._id}">View</button></td>
                </tr>
            `;
        }).join('');

        body.querySelectorAll('[data-receipt-view]').forEach((button) => {
            button.addEventListener('click', () => openReceiptPreview(button.getAttribute('data-receipt-view')));
        });
    } catch (error) {
        body.innerHTML = `<tr><td colspan="6" style="color: #d9534f;">${receiptsApp.escapeHtml(error.message)}</td></tr>`;
    }
}

async function openReceiptPreview(orderId) {
    const previewText = document.getElementById('receiptPreviewText');
    const modal = document.getElementById('receiptPreviewModal');
    if (!previewText || !modal || !orderId) {
        return;
    }

    previewText.textContent = 'Loading receipt...';
    modal.classList.add('show');

    try {
        const response = await fetch(`/api/pos/orders/${orderId}/receipt`);
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error || 'Unable to load receipt preview');
        }

        previewText.textContent = payload.text || 'No receipt text available.';
    } catch (error) {
        previewText.textContent = `Unable to load receipt: ${error.message}`;
    }
}

function closeReceiptPreview() {
    document.getElementById('receiptPreviewModal')?.classList.remove('show');
}

receiptsApp.setupReceipts = setupReceipts;
receiptsApp.loadReceiptsSection = loadReceiptsSection;
