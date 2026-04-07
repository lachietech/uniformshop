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

    const groupedYearProjectionSizes = (yearProjectionComparison.sizeBreakdown || []).reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {});

    dashboardApp.replaceChildren(container, [
        buildStatsGrid(totals, forecast),
        buildDashboardGrid(projectionVsCurrentProgress, yearProjectionComparison, forecastSummary, groupedYearProjectionSizes)
    ]);
}

function buildStatsGrid(totals, forecast) {
    return dashboardApp.el('div', { className: 'stats-grid' }, [
        createStatCard('Current Month', formatNumber(totals.currentTotal), totals.currentMonth || 'N/A'),
        createStatCard(
            'Same Month Last Year',
            totals.yearOverYearTotal !== null ? formatNumber(totals.yearOverYearTotal) : 'N/A',
            totals.yearOverYearMonth ? `${formatDelta(totals.yearOverYearDelta)} / ${formatPercent(totals.yearOverYearPercent)}` : 'Not enough history',
            getTrendClass(totals.yearOverYearDelta || 0)
        ),
        createStatCard('Next Forecast', forecast[0] ? formatNumber(forecast[0].projectedTotal) : 'N/A', forecast[0]?.month || 'Forecast unavailable'),
        createStatCard(
            'This Month Across Years',
            `${formatNumber(totals.currentTotal)} vs ${totals.yearOverYearTotal !== null ? formatNumber(totals.yearOverYearTotal) : 'N/A'}`,
            totals.yearOverYearMonth || 'No previous year month available',
            getTrendClass(totals.yearOverYearDelta || 0)
        )
    ]);
}

function buildDashboardGrid(projectionVsCurrentProgress, yearProjectionComparison, forecastSummary, groupedYearProjectionSizes) {
    return dashboardApp.el('div', { className: 'dashboard-grid' }, [
        buildProjectionPanel(projectionVsCurrentProgress),
        buildYearComparisonPanel(yearProjectionComparison, forecastSummary, groupedYearProjectionSizes)
    ]);
}

function buildProjectionPanel(projectionVsCurrentProgress) {
    const breakdownNodes = (projectionVsCurrentProgress.categoryBreakdown || []).map((category, index) => createSnapshotDetails({
        open: index === 0,
        title: category.category,
        subtitle: `Projected ${formatNumber(category.projectedYearTotal)} vs Current ${formatNumber(category.actualToDateTotal)}`,
        changeValue: formatDelta(category.remainingToProjection * -1 || 0),
        changeText: category.completionPercent === null ? 'N/A' : `${category.completionPercent.toFixed(1)}% complete`,
        changeClass: getTrendClass(-(category.remainingToProjection || 0)),
        headers: ['Size', 'Projected Year', 'Current Position', 'Remaining to Target', 'Likelihood'],
        rows: (category.sizes || []).map((item) => [
            { text: item.size },
            { text: formatNumber(item.projectedYearTotal) },
            { text: formatNumber(item.actualToDateTotal) },
            { text: formatNumber(item.remainingToProjection), className: getTrendClass(-(item.remainingToProjection || 0)) },
            {
                text: item.likelihoodOfReachingProjection === null ? 'N/A' : `${item.likelihoodOfReachingProjection.toFixed(0)}%`,
                className: getTrendClass(item.likelihoodOfReachingProjection ? item.likelihoodOfReachingProjection - 100 : 0)
            }
        ])
    }));

    return dashboardApp.el('div', { className: 'dashboard-panel dashboard-panel-wide' }, [
        createPanelHeader('Current Year Projection vs Current Position', `${projectionVsCurrentProgress.currentYear || 'Current year'} as of ${projectionVsCurrentProgress.asOfMonth || 'latest month'}`),
        dashboardApp.el('div', { className: 'year-compare-grid' }, [
            createStatCard('Projected Full Year', formatNumber(projectionVsCurrentProgress.projectedYearTotal)),
            createStatCard('Current Position', formatNumber(projectionVsCurrentProgress.actualToDateTotal)),
            createStatCard('Remaining to Projection', formatNumber(projectionVsCurrentProgress.remainingToProjection), '', getTrendClass(-(projectionVsCurrentProgress.remainingToProjection || 0))),
            createStatCard('Completion', projectionVsCurrentProgress.completionPercent === null ? 'N/A' : `${projectionVsCurrentProgress.completionPercent.toFixed(1)}%`)
        ]),
        dashboardApp.el('div', { className: 'snapshot-dropdown-list' }, breakdownNodes.length ? breakdownNodes : [dashboardApp.el('p', { className: 'loading', text: 'No projection progress breakdown available.' })])
    ]);
}

function buildYearComparisonPanel(yearProjectionComparison, forecastSummary, groupedYearProjectionSizes) {
    const groupedEntries = Object.entries(groupedYearProjectionSizes || {});
    const detailNodes = groupedEntries.map(([category, items], index) => {
        const currentTotal = items.reduce((sum, row) => sum + (row.currentYearTotal || 0), 0);
        const previousTotal = items.reduce((sum, row) => sum + (row.previousYearTotal || 0), 0);
        const delta = currentTotal - previousTotal;
        const deltaPercent = previousTotal === 0 ? null : (delta / previousTotal) * 100;

        return createSnapshotDetails({
            open: index === 0,
            title: category,
            subtitle: `${yearProjectionComparison.currentYear || 'Current'} ${formatNumber(currentTotal)} vs ${yearProjectionComparison.previousYear || 'Previous'} ${formatNumber(previousTotal)}`,
            changeValue: formatDelta(delta),
            changeText: formatPercent(deltaPercent),
            changeClass: getTrendClass(delta),
            headers: ['Size', yearProjectionComparison.currentYear || 'Current Year', yearProjectionComparison.previousYear || 'Previous Year', 'Delta'],
            rows: items.map((item) => [
                { text: item.size },
                { text: formatNumber(item.currentYearTotal) },
                { text: formatNumber(item.previousYearTotal) },
                { text: `${formatDelta(item.delta || 0)} (${formatPercent(item.deltaPercent)})`, className: getTrendClass(item.delta || 0) }
            ])
        });
    });

    return dashboardApp.el('div', { className: 'dashboard-panel dashboard-panel-wide' }, [
        createPanelHeader('Calendar Year Projection Comparison', `${yearProjectionComparison.currentYear || 'Current year'} vs ${yearProjectionComparison.previousYear || 'Previous year'}`),
        dashboardApp.el('div', { className: 'year-compare-grid' }, [
            createStatCard(`${yearProjectionComparison.currentYear || 'Current Year'} Projected Total`, formatNumber(yearProjectionComparison.currentYearTotal)),
            createStatCard(`${yearProjectionComparison.previousYear || 'Previous Year'} Projected Total`, formatNumber(yearProjectionComparison.previousYearTotal)),
            createStatCard('Year over Year Projection Change', formatDelta(yearProjectionComparison.delta || 0), formatPercent(yearProjectionComparison.deltaPercent), getTrendClass(yearProjectionComparison.delta || 0)),
            createStatCard('12-Month Forward Forecast', formatNumber(forecastSummary.projectedYearTotal), `Avg ${formatNumber(forecastSummary.projectedAverageMonthly)} per month`)
        ]),
        dashboardApp.el('div', { className: 'year-size-breakdown-block' }, [
            createPanelHeader('Year Projection by Category + Size', 'Same dropdown style as category breakdown', { marginTop: '10px' }),
            dashboardApp.el('div', { className: 'snapshot-dropdown-list' }, detailNodes.length ? detailNodes : [dashboardApp.el('p', { className: 'loading', text: 'No size year projection breakdown available.' })])
        ])
    ]);
}

function createStatCard(label, value, subtext = '', extraClass = '') {
    const className = ['stat-card', extraClass].filter(Boolean).join(' ');
    const children = [
        dashboardApp.el('span', { className: 'stat-label', text: label }),
        dashboardApp.el('strong', { className: 'stat-value', text: value })
    ];
    if (subtext) {
        children.push(dashboardApp.el('span', { className: 'stat-subtext', text: subtext }));
    }
    return dashboardApp.el('div', { className }, children);
}

function createPanelHeader(title, subtitle, style = null) {
    return dashboardApp.el('div', { className: 'panel-header', style }, [
        dashboardApp.el('h3', { text: title }),
        dashboardApp.el('span', { text: subtitle })
    ]);
}

function createSnapshotDetails(config) {
    const details = dashboardApp.el('details', { className: 'snapshot-dropdown' });
    if (config.open) {
        details.open = true;
    }

    const summary = dashboardApp.el('summary', {}, [
        dashboardApp.el('div', { className: 'snapshot-summary-main' }, [
            dashboardApp.el('strong', { text: config.title }),
            dashboardApp.el('span', { text: config.subtitle })
        ]),
        dashboardApp.el('div', { className: `snapshot-summary-change ${config.changeClass}` }, [
            dashboardApp.el('strong', { text: config.changeValue }),
            dashboardApp.el('span', { text: config.changeText })
        ])
    ]);

    details.appendChild(summary);
    details.appendChild(dashboardApp.el('div', { className: 'category-table-wrap' }, [createSimpleTable(config.headers, config.rows)]));
    return details;
}

function createSimpleTable(headers, rows) {
    const table = dashboardApp.el('table');
    const thead = dashboardApp.el('thead');
    const headRow = dashboardApp.el('tr');
    headers.forEach((header) => {
        headRow.appendChild(dashboardApp.el('th', { text: header }));
    });
    thead.appendChild(headRow);

    const tbody = dashboardApp.el('tbody');
    rows.forEach((row) => {
        const tr = dashboardApp.el('tr');
        row.forEach((cell) => {
            tr.appendChild(dashboardApp.el('td', { text: cell.text, className: cell.className || '' }));
        });
        tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    return table;
}

dashboardApp.loadDashboard = loadDashboard;
