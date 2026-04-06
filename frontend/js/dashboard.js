const dashboardApp = window.UniformShopApp;

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
    if (!container) {
        return;
    }

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

dashboardApp.loadDashboard = loadDashboard;
