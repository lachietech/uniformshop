const salesApp = window.UniformShopApp;

async function loadSalesData() {
    const tableContainer = document.getElementById('salesTable');
    if (!tableContainer) {
        return;
    }
    tableContainer.innerHTML = '<p class="loading">Loading data...</p>';

    try {
        const category = document.getElementById('categoryFilter')?.value || '';
        const size = document.getElementById('sizeFilter')?.value || '';

        let url = '/api/sales';
        const params = new URLSearchParams();
        if (category) params.append('category', category);
        if (size) params.append('size', size);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load sales data');
        }

        if (!Array.isArray(data)) {
            throw new Error('Invalid sales data format');
        }

        if (data.length === 0) {
            tableContainer.innerHTML = '<p class="loading">No data found.</p>';
            return;
        }

        const grouped = data.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category].push(item);
            return acc;
        }, {});
        const lastFiveYears = getLastFiveYears();

        let html = '';
        for (const [category, items] of Object.entries(grouped)) {
            items.sort((left, right) => salesApp.compareSizes(left.size, right.size));
            html += `<h3 style="margin-top: 30px; margin-bottom: 15px; color: #333;">${category}</h3>`;
            html += '<table>';
            html += '<thead><tr><th>Size</th><th>Months</th><th>Last 5 Years</th><th>Actions</th></tr></thead>';
            html += '<tbody>';

            items.forEach((item) => {
                const monthCount = Array.isArray(item.months) ? item.months.length : 0;
                const monthsPreview = monthCount ? item.months.slice(-3).join(', ') : 'none';
                const yearlyBreakdown = getYearlySalesBreakdown(item, lastFiveYears);
                const breakdownHtml = yearlyBreakdown
                    .map((entry) => `${entry.year}: <strong>${entry.total}</strong>`)
                    .join(' | ');

                html += `<tr>
                    <td><strong>${item.size}</strong></td>
                    <td>${monthCount} months (latest: ${monthsPreview})</td>
                    <td>${breakdownHtml}</td>
                    <td>
                        <button class="btn btn-secondary btn-small" type="button" data-edit-id="${item._id}" data-edit-category="${item.category}" data-edit-size="${item.size}">Edit</button>
                        <button class="btn btn-danger btn-small" type="button" data-delete-id="${item._id}">Delete</button>
                    </td>
                </tr>`;
            });

            html += '</tbody></table>';
        }

        tableContainer.innerHTML = html;
        tableContainer.querySelectorAll('[data-edit-id]').forEach((button) => {
            button.addEventListener('click', () => {
                openEditModal(
                    button.getAttribute('data-edit-id'),
                    button.getAttribute('data-edit-category'),
                    button.getAttribute('data-edit-size')
                );
            });
        });
        tableContainer.querySelectorAll('[data-delete-id]').forEach((button) => {
            button.addEventListener('click', () => {
                deleteSale(button.getAttribute('data-delete-id'));
            });
        });
    } catch (error) {
        tableContainer.innerHTML = `<p class="loading" style="color: #d9534f;">Error loading data: ${error.message}</p>`;
    }
}

function getLastFiveYears() {
    const currentYear = new Date().getFullYear();
    return [currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear];
}

function parseYearFromMonthLabel(monthLabel) {
    const raw = String(monthLabel || '').trim();
    if (!raw) {
        return null;
    }

    const parts = raw.split('-');
    if (parts.length < 2) {
        return null;
    }

    const yearToken = parts[parts.length - 1].trim();
    if (!/^\d{2,4}$/.test(yearToken)) {
        return null;
    }

    const yearNumber = Number(yearToken);
    if (yearToken.length === 2) {
        return 2000 + yearNumber;
    }
    return yearNumber;
}

function getYearlySalesBreakdown(item, years) {
    const totalsByYear = new Map(years.map((year) => [year, 0]));
    const months = Array.isArray(item.months) ? item.months : [];
    const sales = Array.isArray(item.sales) ? item.sales : [];

    months.forEach((monthLabel, index) => {
        const year = parseYearFromMonthLabel(monthLabel);
        if (!totalsByYear.has(year)) {
            return;
        }
        const value = Number(sales[index] || 0);
        totalsByYear.set(year, totalsByYear.get(year) + value);
    });

    return years.map((year) => ({ year, total: totalsByYear.get(year) || 0 }));
}

function setupFilterButtons() {
    const categoryFilter = document.getElementById('categoryFilter');
    const sizeFilter = document.getElementById('sizeFilter');
    const filterBtn = document.getElementById('filterBtn');

    if (categoryFilter && sizeFilter && filterBtn) {
        categoryFilter.addEventListener('change', async () => {
            const category = categoryFilter.value;
            sizeFilter.innerHTML = '<option value="">All Sizes</option>';

            if (category) {
                try {
                    const response = await fetch(`/api/metadata/categories/${category}/sizes`);
                    const data = await response.json();
                    const sortedSizes = [...(data.sizes || [])].sort((left, right) => salesApp.compareSizes(left, right));
                    sortedSizes.forEach((size) => {
                        const option = document.createElement('option');
                        option.value = size;
                        option.textContent = size;
                        sizeFilter.appendChild(option);
                    });
                } catch (error) {
                    console.error('Error loading sizes:', error);
                }
            }
        });

        filterBtn.addEventListener('click', loadSalesData);
    }
}

async function loadAllProductsForMonth() {
    const container = document.getElementById('monthInputsContainer');
    if (!container) {
        return;
    }
    container.innerHTML = '<p class="loading">Loading products...</p>';

    try {
        const response = await fetch('/api/sales');
        const data = await response.json();

        if (!response.ok || !Array.isArray(data)) {
            throw new Error('Failed to load products');
        }

        if (data.length === 0) {
            container.innerHTML = '<p class="loading">No products found.</p>';
            return;
        }

        let allMonths = [];
        data.forEach((item) => {
            if (item.months && Array.isArray(item.months)) {
                allMonths = [...new Set([...allMonths, ...item.months])];
            }
        });

        const nextMonth = getNextMonth(allMonths);
        const monthNameInput = document.getElementById('monthName');
        if (monthNameInput) {
            monthNameInput.value = nextMonth;
        }

        const grouped = data.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category].push(item);
            return acc;
        }, {});

        let html = '';
        for (const [category, items] of Object.entries(grouped)) {
            items.sort((left, right) => salesApp.compareSizes(left.size, right.size));
            html += `<div style="border-top: 1px solid #ddd; margin-top: 12px; padding-top: 12px;">
                <strong style="color: #333; font-size: 0.95em;">${category}</strong>`;

            items.forEach((item) => {
                const recordId = item._id;
                const inputId = `month_${recordId}`;
                html += `<div class="month-input" style="margin-bottom: 8px;">
                    <label style="margin-bottom: 2px;">${item.size}</label>
                    <input type="number" id="${inputId}" data-record-id="${recordId}" placeholder="0" value="0" min="-999">
                </div>`;
            });

            html += '</div>';
        }

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p class="loading" style="color: #d9534f;">Error loading products: ${error.message}</p>`;
    }
}

function getNextMonth(existingMonths) {
    const monthMap = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
        Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
    };
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (existingMonths.length === 0) {
        const today = new Date();
        const month = monthNames[today.getMonth()];
        const year = today.getFullYear();
        return `${month}-${year.toString().slice(-2)}`;
    }

    const lastMonth = existingMonths[existingMonths.length - 1];
    const [monthStr, yearStr] = lastMonth.split('-');
    let month = monthMap[monthStr];
    let year = parseInt(yearStr, 10);

    month += 1;
    if (month > 12) {
        month = 1;
        year += 1;
    }

    return `${monthNames[month - 1]}-${year.toString().slice(-2)}`;
}

function setupAddMonthForm() {
    const form = document.getElementById('addMonthForm');
    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const month = document.getElementById('monthName').value.trim();
            const status = document.getElementById('monthStatus');

            if (!month) {
                status.className = 'status-message error';
                status.textContent = '✗ Please enter a month';
                return;
            }

            try {
                const inputs = Array.from(document.querySelectorAll('#monthInputsContainer input[data-record-id]'));
                if (inputs.length === 0) {
                    status.className = 'status-message error';
                    status.textContent = '✗ No products found';
                    return;
                }

                const updates = inputs.map((input) => ({
                    recordId: input.getAttribute('data-record-id'),
                    value: parseInt(input.value, 10) || 0
                }));

                status.className = 'status-message info';
                status.textContent = 'Adding month to products...';

                let successCount = 0;
                let errorCount = 0;

                for (const update of updates) {
                    try {
                        const response = await fetch(`/api/sales/${update.recordId}/add-month`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ month, value: update.value })
                        });

                        if (response.ok) {
                            successCount += 1;
                        } else {
                            const error = await response.json();
                            if (!(response.status === 400 && error.error?.includes('already exists'))) {
                                errorCount += 1;
                            }
                        }
                    } catch (error) {
                        errorCount += 1;
                    }
                }

                if (errorCount === 0) {
                    status.className = 'status-message success';
                    status.textContent = `✓ Month ${month} added to all ${successCount} products`;
                    form.reset();
                    loadAllProductsForMonth();
                    loadSalesData();
                    salesApp.loadDashboard?.();
                } else {
                    status.className = 'status-message error';
                    status.textContent = `⚠ Added to ${successCount} products, ${errorCount} had issues`;
                }
            } catch (error) {
                status.className = 'status-message error';
                status.textContent = `✗ Error: ${error.message}`;
            }
        });
    }
}

function setupAddRecordForm() {
    const form = document.getElementById('addRecordForm');
    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const category = document.getElementById('newCategory').value;
            const size = document.getElementById('newSize').value;
            const month = document.getElementById('initialMonth').value.trim();
            const value = parseInt(document.getElementById('initialValue').value, 10) || 0;
            const status = document.getElementById('recordStatus');

            try {
                const response = await fetch('/api/sales', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        category,
                        size,
                        months: [month],
                        sales: [value]
                    })
                });

                const data = await response.json();
                if (response.ok) {
                    status.className = 'status-message success';
                    status.textContent = `✓ New product record created with ${month}: ${value}`;
                    form.reset();
                    loadSalesData();
                    salesApp.loadDashboard?.();
                } else {
                    throw new Error(data.error);
                }
            } catch (error) {
                status.className = 'status-message error';
                status.textContent = `✗ Error: ${error.message}`;
            }
        });
    }
}

async function openEditModal(id, category, size) {
    try {
        const response = await fetch(`/api/sales/${id}`);
        const data = await response.json();
        salesApp.state.currentEditId = id;
        salesApp.state.currentEditRecord = data;

        const editTitle = document.getElementById('editTitle');
        const editMonths = document.getElementById('editMonths');
        const editModal = document.getElementById('editModal');
        if (!editTitle || !editMonths || !editModal) {
            return;
        }

        editTitle.textContent = `${category} - ${size}`;
        editMonths.innerHTML = '';

        data.months.forEach((month, index) => {
            const div = document.createElement('div');
            div.className = 'month-input';
            div.innerHTML = `
                <label>${month}</label>
                <input type="number" value="${data.sales[index]}" min="-999" data-month="${index}">
            `;
            editMonths.appendChild(div);
        });

        editModal.classList.add('show');
    } catch (error) {
        alert(`Error loading record: ${error.message}`);
    }
}

async function saveEditedRecord() {
    const sales = [];
    document.querySelectorAll('#editMonths input').forEach((input) => {
        sales.push(parseInt(input.value, 10) || 0);
    });

    try {
        const response = await fetch(`/api/sales/${salesApp.state.currentEditId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: salesApp.state.currentEditRecord.category,
                size: salesApp.state.currentEditRecord.size,
                months: salesApp.state.currentEditRecord.months,
                sales
            })
        });

        if (!response.ok) {
            throw new Error('Update failed');
        }

        alert('Record updated successfully');
        closeModal();
        loadSalesData();
        salesApp.loadDashboard?.();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteCurrentRecord() {
    if (!confirm('Are you sure you want to delete this record?')) return;

    try {
        const response = await fetch(`/api/sales/${salesApp.state.currentEditId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Delete failed');
        }

        alert('Record deleted successfully');
        closeModal();
        loadSalesData();
        salesApp.loadDashboard?.();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteSale(id) {
    if (!confirm('Are you sure you want to delete this record?')) return;

    try {
        const response = await fetch(`/api/sales/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Delete failed');
        }

        alert('Record deleted successfully');
        loadSalesData();
        salesApp.loadDashboard?.();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function setupModal() {
    const modal = document.getElementById('editModal');
    const closeBtn = document.querySelector('#editModal .close');
    const cancelBtn = document.getElementById('closeEditBtn');
    const saveBtn = document.getElementById('saveEditBtn');
    const deleteBtn = document.getElementById('deleteBtn');

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    saveBtn?.addEventListener('click', saveEditedRecord);
    deleteBtn?.addEventListener('click', deleteCurrentRecord);

    if (modal) {
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });
    }
}

function closeModal() {
    salesApp.state.currentEditRecord = null;
    document.getElementById('editModal')?.classList.remove('show');
}

salesApp.loadSalesData = loadSalesData;
salesApp.setupFilterButtons = setupFilterButtons;
salesApp.loadAllProductsForMonth = loadAllProductsForMonth;
salesApp.setupAddMonthForm = setupAddMonthForm;
salesApp.setupAddRecordForm = setupAddRecordForm;
salesApp.setupModal = setupModal;
