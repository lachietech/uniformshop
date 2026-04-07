const navigationApp = window.UniformShopApp;
const routeToSectionMap = new Map(Object.entries(navigationApp.pageRoutes).map(([section, route]) => [route, section]));

const pageTitles = {
    dashboard: 'Dashboard',
    view: 'Sales Records',
    pos: 'Point of Sale',
    receipts: 'Receipts',
    stock: 'Stock Manager',
    access: 'Access Management',
    account: 'My Account'
};

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const section = button.getAttribute('data-section');
            if (!section) {
                return;
            }

            if (section === getCurrentPage()) {
                loadCurrentPage();
                return;
            }

            const route = button.getAttribute('data-route') || navigationApp.pageRoutes[section];
            if (route) {
                window.history.pushState({}, '', route);
                loadCurrentPage();
            }
        });
    });

    window.addEventListener('popstate', loadCurrentPage);

    setActiveSection(getCurrentPage());
}

function setActiveSection(section) {
    document.querySelectorAll('.nav-btn').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-section') === section);
    });
    document.querySelectorAll('.section').forEach((panel) => {
        panel.classList.toggle('active', panel.id === section);
    });
}

function getCurrentPage() {
    const pathname = window.location.pathname || navigationApp.pageRoutes.dashboard;
    return routeToSectionMap.get(pathname) || 'dashboard';
}

function loadCurrentPage() {
    const currentPage = getCurrentPage();
    setActiveSection(currentPage);
    document.title = `${pageTitles[currentPage] || 'Dashboard'} | Harris Fields State School Uniform Shop Manager`;

    if (currentPage === 'dashboard') {
        navigationApp.loadDashboard?.();
        return;
    }
    if (currentPage === 'view') {
        navigationApp.loadSalesData?.();
        navigationApp.loadAllProductsForMonth?.();
        return;
    }
    if (currentPage === 'pos') {
        navigationApp.loadPOSSection?.();
        return;
    }
    if (currentPage === 'receipts') {
        navigationApp.loadReceiptsSection?.();
        return;
    }
    if (currentPage === 'stock') {
        navigationApp.loadStockSection?.();
        return;
    }
    if (currentPage === 'access') {
        if (navigationApp.state.currentSessionUser?.role !== 'admin') {
            window.location.assign(navigationApp.pageRoutes.dashboard);
            return;
        }
        navigationApp.loadUsers?.();
        navigationApp.loadAuditLogs?.();
        return;
    }
    if (currentPage === 'account') {
        navigationApp.refreshAccountSection?.();
    }
}

navigationApp.setupNavigation = setupNavigation;
navigationApp.setActiveSection = setActiveSection;
navigationApp.getCurrentPage = getCurrentPage;
navigationApp.loadCurrentPage = loadCurrentPage;
