const receiptsApp = window.UniformShopApp;

function setupReceipts() {
    const refreshBtn = document.getElementById('receiptRefreshBtn');
    const closeBtn = document.getElementById('receiptPreviewClose');
    const modal = document.getElementById('receiptPreviewModal');
    const historyBody = document.getElementById('receiptHistoryBody');

    refreshBtn?.addEventListener('click', () => {
        loadReceiptsSection();
    });
    closeBtn?.addEventListener('click', closeReceiptPreview);
    historyBody?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-receipt-view]');
        if (!button) {
            return;
        }
        openReceiptPreview(button.getAttribute('data-receipt-view'));
    });

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

    receiptsApp.setTableMessage(body, 6, 'Loading receipts...');

    try {
        const response = await fetch('/api/pos/orders/receipts?limit=250');
        const receipts = await response.json();

        if (!response.ok) {
            throw new Error(receipts.error || 'Failed to load receipts');
        }

        if (!receipts.length) {
            receiptsApp.setTableMessage(body, 6, 'No receipts found.');
            return;
        }

        receiptsApp.replaceChildren(body, receipts.map((receipt) => {
            const row = document.createElement('tr');
            const statusClass = receipt.receiptStatus === 'saved' || receipt.receiptStatus === 'sent'
                ? 'pos-status-active'
                : 'pos-status-warning';

            row.append(
                receiptsApp.createTableCell(receipt.orderNumber || ''),
                receiptsApp.createTableCell(new Date(receipt.createdAt).toLocaleString()),
                receiptsApp.createTableCell(String(receipt.paymentMethod || '').toUpperCase()),
                receiptsApp.createTableCell(receiptsApp.formatCurrency(receipt.total))
            );

            const statusCell = document.createElement('td');
            const statusPill = document.createElement('span');
            statusPill.className = `pos-status-pill ${statusClass}`;
            statusPill.textContent = receipt.receiptStatus || '-';
            statusCell.appendChild(statusPill);
            row.appendChild(statusCell);

            const actionCell = document.createElement('td');
            const viewButton = receiptsApp.createButton({
                className: 'btn btn-secondary btn-small',
                text: 'View',
                attrs: { 'data-receipt-view': receipt._id }
            });
            actionCell.appendChild(viewButton);
            row.appendChild(actionCell);

            return row;
        }));
    } catch (error) {
        receiptsApp.setTableMessage(body, 6, error.message, { color: '#d9534f', className: '' });
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
