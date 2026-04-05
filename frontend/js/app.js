let currentEditId = null;
let currentEditRecord = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupFilterButtons();
    setupAddMonthForm();
    setupAddRecordForm();
    setupModal();
    loadDashboard();
    loadSalesData();
});

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.getAttribute('data-section');
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(section).classList.add('active');
            
            if (section === 'dashboard') {
                loadDashboard();
            }
            if (section === 'view') {
                loadSalesData();
            }
            if (section === 'add-month') {
                loadAllProductsForMonth();
            }
        });
    });
}

function formatNumber(value) {
    return new Intl.NumberFormat('en-AU', {
        maximumFractionDigits: 0
    }).format(value || 0);
}

function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return 'N/A';
    }
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(1)}%`;
}

function formatDelta(value) {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${formatNumber(value || 0)}`;
}

function getTrendClass(value) {
    if (value > 0) {
        return 'trend-up';
    }
    if (value < 0) {
        return 'trend-down';
    }
    return 'trend-flat';
}

async function loadDashboard() {
    const container = document.getElementById('dashboardContent');
    if (!container) {
        return;
    }

    container.innerHTML = '<p class="loading">Loading dashboard...</p>';

    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load dashboard');
        }

        renderDashboard(data);
    } catch (error) {
        container.innerHTML = `<p class="loading" style="color: #d9534f;">Error loading dashboard: ${error.message}</p>`;
    }
}

function renderDashboard(data) {
    const container = document.getElementById('dashboardContent');
    const totals = data.totals || {};
    const monthlySeries = data.monthlySeries || [];
    const projectionVsCurrentProgress = data.projectionVsCurrentProgress || {};
    const yearProjectionComparison = data.yearProjectionComparison || {};
    const forecastSummary = data.forecastSummary || {};
    const forecast = data.forecast || [];

    if (!monthlySeries.length) {
        container.innerHTML = '<p class="loading">No sales data available yet.</p>';
        return;
    }

    const currentMonthName = totals.currentMonth ? totals.currentMonth.split('-')[0] : null;

    const progressBreakdownHtml = (projectionVsCurrentProgress.categoryBreakdown || []).map((category, categoryIndex) => `
        <details class="snapshot-dropdown" ${categoryIndex === 0 ? 'open' : ''}>
            <summary>
                <div class="snapshot-summary-main">
                    <strong>${category.category}</strong>
                    <span>Projected ${formatNumber(category.projectedYearTotal)} vs Current ${formatNumber(category.actualToDateTotal)}</span>
                </div>
                <div class="snapshot-summary-change ${getTrendClass(-(category.remainingToProjection || 0))}">
                    <strong>${formatDelta(category.remainingToProjection * -1 || 0)}</strong>
                    <span>${category.completionPercent === null ? 'N/A' : `${category.completionPercent.toFixed(1)}% complete`}</span>
                </div>
            </summary>
            <div class="category-table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Size</th>
                            <th>Projected Year</th>
                            <th>Current Position</th>
                            <th>Remaining to Target</th>
                            <th>Likelihood</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(category.sizes || []).map((item) => `
                            <tr>
                                <td>${item.size}</td>
                                <td>${formatNumber(item.projectedYearTotal)}</td>
                                <td>${formatNumber(item.actualToDateTotal)}</td>
                                <td class="${getTrendClass(-(item.remainingToProjection || 0))}">${formatNumber(item.remainingToProjection)}</td>
                                <td class="${getTrendClass(item.likelihoodOfReachingProjection ? item.likelihoodOfReachingProjection - 100 : 0)}">${item.likelihoodOfReachingProjection === null ? 'N/A' : `${item.likelihoodOfReachingProjection.toFixed(0)}%`}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </details>
    `).join('');

    const groupedYearProjectionSizes = (yearProjectionComparison.sizeBreakdown || []).reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {});

    const yearProjectionSizeHtml = Object.entries(groupedYearProjectionSizes).map(([category, items], categoryIndex) => {
        const currentTotal = items.reduce((sum, row) => sum + (row.currentYearTotal || 0), 0);
        const previousTotal = items.reduce((sum, row) => sum + (row.previousYearTotal || 0), 0);
        const delta = currentTotal - previousTotal;
        const deltaPercent = previousTotal === 0 ? null : (delta / previousTotal) * 100;

        return `
            <details class="snapshot-dropdown" ${categoryIndex === 0 ? 'open' : ''}>
                <summary>
                    <div class="snapshot-summary-main">
                        <strong>${category}</strong>
                        <span>${yearProjectionComparison.currentYear || 'Current'} ${formatNumber(currentTotal)} vs ${yearProjectionComparison.previousYear || 'Previous'} ${formatNumber(previousTotal)}</span>
                    </div>
                    <div class="snapshot-summary-change ${getTrendClass(delta)}">
                        <strong>${formatDelta(delta)}</strong>
                        <span>${formatPercent(deltaPercent)}</span>
                    </div>
                </summary>
                <div class="category-table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Size</th>
                                <th>${yearProjectionComparison.currentYear || 'Current Year'}</th>
                                <th>${yearProjectionComparison.previousYear || 'Previous Year'}</th>
                                <th>Delta</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map((item) => `
                                <tr>
                                    <td>${item.size}</td>
                                    <td>${formatNumber(item.currentYearTotal)}</td>
                                    <td>${formatNumber(item.previousYearTotal)}</td>
                                    <td class="${getTrendClass(item.delta || 0)}">${formatDelta(item.delta || 0)} (${formatPercent(item.deltaPercent)})</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </details>
        `;
    }).join('');

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <span class="stat-label">Current Month</span>
                <strong class="stat-value">${formatNumber(totals.currentTotal)}</strong>
                <span class="stat-subtext">${totals.currentMonth || 'N/A'}</span>
            </div>
            <div class="stat-card ${getTrendClass(totals.yearOverYearDelta || 0)}">
                <span class="stat-label">Same Month Last Year</span>
                <strong class="stat-value">${totals.yearOverYearTotal !== null ? formatNumber(totals.yearOverYearTotal) : 'N/A'}</strong>
                <span class="stat-subtext">${totals.yearOverYearMonth ? `${formatDelta(totals.yearOverYearDelta)} / ${formatPercent(totals.yearOverYearPercent)}` : 'Not enough history'}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Next Forecast</span>
                <strong class="stat-value">${forecast[0] ? formatNumber(forecast[0].projectedTotal) : 'N/A'}</strong>
                <span class="stat-subtext">${forecast[0]?.month || 'Forecast unavailable'}</span>
            </div>
            <div class="stat-card ${getTrendClass(totals.yearOverYearDelta || 0)}">
                <span class="stat-label">This Month Across Years</span>
                <strong class="stat-value">${formatNumber(totals.currentTotal)} vs ${totals.yearOverYearTotal !== null ? formatNumber(totals.yearOverYearTotal) : 'N/A'}</strong>
                <span class="stat-subtext">${totals.yearOverYearMonth || 'No previous year month available'}</span>
            </div>
        </div>

        <div class="dashboard-grid">
            <div class="dashboard-panel dashboard-panel-wide">
                <div class="panel-header">
                    <h3>Current Year Projection vs Current Position</h3>
                    <span>${projectionVsCurrentProgress.currentYear || 'Current year'} as of ${projectionVsCurrentProgress.asOfMonth || 'latest month'}</span>
                </div>
                <div class="year-compare-grid">
                    <div class="stat-card">
                        <span class="stat-label">Projected Full Year</span>
                        <strong class="stat-value">${formatNumber(projectionVsCurrentProgress.projectedYearTotal)}</strong>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Current Position</span>
                        <strong class="stat-value">${formatNumber(projectionVsCurrentProgress.actualToDateTotal)}</strong>
                    </div>
                    <div class="stat-card ${getTrendClass(-(projectionVsCurrentProgress.remainingToProjection || 0))}">
                        <span class="stat-label">Remaining to Projection</span>
                        <strong class="stat-value">${formatNumber(projectionVsCurrentProgress.remainingToProjection)}</strong>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Completion</span>
                        <strong class="stat-value">${projectionVsCurrentProgress.completionPercent === null ? 'N/A' : `${projectionVsCurrentProgress.completionPercent.toFixed(1)}%`}</strong>
                    </div>
                </div>
                <div class="snapshot-dropdown-list">
                    ${progressBreakdownHtml || '<p class="loading">No projection progress breakdown available.</p>'}
                </div>
            </div>

            <div class="dashboard-panel dashboard-panel-wide">
                <div class="panel-header">
                    <h3>Calendar Year Projection Comparison</h3>
                    <span>${yearProjectionComparison.currentYear || 'Current year'} vs ${yearProjectionComparison.previousYear || 'Previous year'}</span>
                </div>
                <div class="year-compare-grid">
                    <div class="stat-card">
                        <span class="stat-label">${yearProjectionComparison.currentYear || 'Current Year'} Projected Total</span>
                        <strong class="stat-value">${formatNumber(yearProjectionComparison.currentYearTotal)}</strong>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">${yearProjectionComparison.previousYear || 'Previous Year'} Projected Total</span>
                        <strong class="stat-value">${formatNumber(yearProjectionComparison.previousYearTotal)}</strong>
                    </div>
                    <div class="stat-card ${getTrendClass(yearProjectionComparison.delta || 0)}">
                        <span class="stat-label">Year over Year Projection Change</span>
                        <strong class="stat-value">${formatDelta(yearProjectionComparison.delta || 0)}</strong>
                        <span class="stat-subtext">${formatPercent(yearProjectionComparison.deltaPercent)}</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">12-Month Forward Forecast</span>
                        <strong class="stat-value">${formatNumber(forecastSummary.projectedYearTotal)}</strong>
                        <span class="stat-subtext">Avg ${formatNumber(forecastSummary.projectedAverageMonthly)} per month</span>
                    </div>
                </div>

                <div class="year-size-breakdown-block">
                    <div class="panel-header" style="margin-top: 10px;">
                        <h3>Year Projection by Category + Size</h3>
                        <span>Same dropdown style as category breakdown</span>
                    </div>
                    <div class="snapshot-dropdown-list">
                        ${yearProjectionSizeHtml || '<p class="loading">No size year projection breakdown available.</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Load and display sales data
async function loadSalesData() {
    const tableContainer = document.getElementById('salesTable');
    tableContainer.innerHTML = '<p class="loading">Loading data...</p>';
    
    try {
        // Apply filters
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
        
        const sales = data;
        
        if (sales.length === 0) {
            tableContainer.innerHTML = '<p class="loading">No data found.</p>';
            return;
        }
        
        // Group by category
        const grouped = sales.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category].push(item);
            return acc;
        }, {});
        
        let html = '';
        for (const [category, items] of Object.entries(grouped)) {
            html += `<h3 style="margin-top: 30px; margin-bottom: 15px; color: #333;">${category}</h3>`;
            html += '<table>';
            html += '<thead><tr><th>Size</th><th>Months</th><th>Total Sales</th><th>Actions</th></tr></thead>';
            html += '<tbody>';
            
            items.forEach(item => {
                const total = item.sales.reduce((a, b) => a + b, 0);
                const monthCount = item.months.length;
                const monthsPreview = item.months.slice(-3).join(', ');
                
                html += `<tr>
                    <td><strong>${item.size}</strong></td>
                    <td>${monthCount} months (latest: ${monthsPreview})</td>
                    <td><strong>${total}</strong></td>
                    <td>
                        <button class="btn btn-secondary btn-small" onclick="openEditModal('${item._id}', '${item.category}', '${item.size}')">Edit</button>
                        <button class="btn btn-danger btn-small" onclick="deleteSale('${item._id}')">Delete</button>
                    </td>
                </tr>`;
            });
            
            html += '</tbody></table>';
        }
        
        tableContainer.innerHTML = html;
    } catch (error) {
        tableContainer.innerHTML = `<p class="loading" style="color: #d9534f;">Error loading data: ${error.message}</p>`;
    }
}

// Filter functionality
function setupFilterButtons() {
    const categoryFilter = document.getElementById('categoryFilter');
    const sizeFilter = document.getElementById('sizeFilter');
    const filterBtn = document.getElementById('filterBtn');
    
    if (categoryFilter && sizeFilter && filterBtn) {
        // Update size filter when category changes
        categoryFilter.addEventListener('change', async () => {
            const category = categoryFilter.value;
            sizeFilter.innerHTML = '<option value="">All Sizes</option>';
            
            if (category) {
                try {
                    const response = await fetch(`/api/metadata/categories/${category}/sizes`);
                    const data = await response.json();
                    data.sizes.forEach(size => {
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

// Load all products for month addition
async function loadAllProductsForMonth() {
    const container = document.getElementById('monthInputsContainer');
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
        
        // Get the next month from existing data
        let allMonths = [];
        data.forEach(item => {
            if (item.months && Array.isArray(item.months)) {
                allMonths = [...new Set([...allMonths, ...item.months])];
            }
        });
        
        const nextMonth = getNextMonth(allMonths);
        document.getElementById('monthName').value = nextMonth;
        
        // Group by category
        const grouped = data.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category].push(item);
            return acc;
        }, {});
        
        let html = '';
        for (const [category, items] of Object.entries(grouped)) {
            html += `<div style="border-top: 1px solid #ddd; margin-top: 12px; padding-top: 12px;">
                <strong style="color: #333; font-size: 0.95em;">${category}</strong>`;
            
            items.forEach(item => {
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

// Calculate next month based on existing months
function getNextMonth(existingMonths) {
    const monthMap = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
    };
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    if (existingMonths.length === 0) {
        const today = new Date();
        const month = monthNames[today.getMonth()];
        const year = today.getFullYear();
        return `${month}-${year.toString().slice(-2)}`;
    }
    
    // Parse last month and calculate next
    const lastMonth = existingMonths[existingMonths.length - 1];
    const [monthStr, yearStr] = lastMonth.split('-');
    let month = monthMap[monthStr];
    let year = parseInt(yearStr);
    
    month++;
    if (month > 12) {
        month = 1;
        year++;
    }
    
    const nextMonthStr = monthNames[month - 1];
    return `${nextMonthStr}-${year.toString().slice(-2)}`;
}

// Add month to existing records
function setupAddMonthForm() {
    const form = document.getElementById('addMonthForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
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
                
                const updates = inputs.map(input => ({
                    recordId: input.getAttribute('data-record-id'),
                    value: parseInt(input.value) || 0
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
                            successCount++;
                        } else {
                            const error = await response.json();
                            if (response.status === 400 && error.error?.includes('already exists')) {
                                // Month already exists, skip
                            } else {
                                errorCount++;
                            }
                        }
                    } catch (err) {
                        errorCount++;
                    }
                }
                
                if (errorCount === 0) {
                    status.className = 'status-message success';
                    status.textContent = `✓ Month ${month} added to all ${successCount} products`;
                    form.reset();
                    loadAllProductsForMonth();
                    loadSalesData();
                    loadDashboard();
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

// Add new product record
function setupAddRecordForm() {
    const form = document.getElementById('addRecordForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const category = document.getElementById('newCategory').value;
            const size = document.getElementById('newSize').value;
            const month = document.getElementById('initialMonth').value.trim();
            const value = parseInt(document.getElementById('initialValue').value) || 0;
            
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
                    loadDashboard();
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

// Edit functionality
async function openEditModal(id, category, size) {
    try {
        const response = await fetch(`/api/sales/${id}`);
        const data = await response.json();
        currentEditId = id;
        currentEditRecord = data;
        
        document.getElementById('editTitle').textContent = `${category} - ${size}`;
        
        const editMonths = document.getElementById('editMonths');
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
        
        document.getElementById('editModal').classList.add('show');
    } catch (error) {
        alert('Error loading record: ' + error.message);
    }
}

document.getElementById('saveEditBtn')?.addEventListener('click', async () => {
    const sales = [];
    document.querySelectorAll('#editMonths input').forEach(input => {
        sales.push(parseInt(input.value) || 0);
    });
    
    try {
        const response = await fetch(`/api/sales/${currentEditId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: currentEditRecord.category,
                size: currentEditRecord.size,
                months: currentEditRecord.months,
                sales: sales
            })
        });
        
        if (response.ok) {
            alert('Record updated successfully');
            closeModal();
            loadSalesData();
            loadDashboard();
        } else {
            throw new Error('Update failed');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
});

document.getElementById('deleteBtn')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    
    try {
        const response = await fetch(`/api/sales/${currentEditId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('Record deleted successfully');
            closeModal();
            loadSalesData();
            loadDashboard();
        } else {
            throw new Error('Delete failed');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
});

// Delete functionality
async function deleteSale(id) {
    if (!confirm('Are you sure you want to delete this record?')) return;
    
    try {
        const response = await fetch(`/api/sales/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('Record deleted successfully');
            loadSalesData();
            loadDashboard();
        } else {
            throw new Error('Delete failed');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Modal functionality
function setupModal() {
    const modal = document.getElementById('editModal');
    const closeBtn = document.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (modal) {
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });
    }
}

function closeModal() {
    currentEditRecord = null;
    document.getElementById('editModal').classList.remove('show');
}
