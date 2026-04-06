const app = window.UniformShopApp || (window.UniformShopApp = {});

app.state = app.state || {
    currentEditId: null,
    currentEditRecord: null,
    posProducts: [],
    posCart: [],
    currentPosEditId: null,
    currentSessionUser: null,
    appInitialized: false,
    currentManagedUser: null
};

app.pageRoutes = {
    dashboard: '/dashboard',
    view: '/sales-records',
    pos: '/pos',
    receipts: '/receipts',
    stock: '/stock-manager',
    access: '/access-management',
    account: '/account'
};

app.nativeFetch = app.nativeFetch || window.fetch.bind(window);

app.escapeHtml = function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

app.formatCurrency = function formatCurrency(value) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value || 0));
};

app.compareSizes = function compareSizes(leftValue, rightValue) {
    const sizeAliases = new Map([
        ['SM', 'S'],
        ['SMALL', 'S'],
        ['MED', 'M'],
        ['MEDIUM', 'M'],
        ['LG', 'L'],
        ['LRG', 'L'],
        ['LARGE', 'L'],
        ['XSMALL', 'XS'],
        ['EXTRASMALL', 'XS'],
        ['XLARGE', 'XL'],
        ['EXTRALARGE', 'XL'],
        ['2X', '2XL'],
        ['3X', '3XL'],
        ['4X', '4XL'],
        ['5X', '5XL']
    ]);

    const normalize = (value) => {
        const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
        return sizeAliases.get(normalized) || normalized;
    };
    const left = normalize(leftValue);
    const right = normalize(rightValue);

    const parseNumeric = (value) => (/^\d+(\.\d+)?$/.test(value) ? Number(value) : null);
    const leftNumeric = parseNumeric(left);
    const rightNumeric = parseNumeric(right);

    if (leftNumeric !== null && rightNumeric !== null) return leftNumeric - rightNumeric;
    if (leftNumeric !== null) return -1;
    if (rightNumeric !== null) return 1;

    const fixedOrder = new Map([
        ['XXS', 0],
        ['XS', 1],
        ['S', 2],
        ['M', 3],
        ['L', 4],
        ['XL', 5],
        ['XXL', 6],
        ['2XL', 6],
        ['XXXL', 7],
        ['3XL', 7],
        ['4XL', 8],
        ['5XL', 9]
    ]);

    const parseRank = (value) => {
        if (fixedOrder.has(value)) return fixedOrder.get(value);
        const xlMatch = value.match(/^(\d+)XL$/);
        if (xlMatch) {
            return 5 + Number(xlMatch[1]) - 1;
        }
        return null;
    };

    const leftRank = parseRank(left);
    const rightRank = parseRank(right);

    if (leftRank !== null && rightRank !== null) return leftRank - rightRank;
    if (leftRank !== null) return -1;
    if (rightRank !== null) return 1;

    return left.localeCompare(right);
};

window.fetch = async (resource, options) => {
    const response = await app.nativeFetch(resource, options);

    if (response.status === 401 && typeof resource === 'string' && resource.startsWith('/api/') && !resource.startsWith('/api/auth/')) {
        app.handleUnauthorizedResponse?.();
    }

    if (response.status === 403 && typeof resource === 'string' && resource.startsWith('/api/') && !resource.startsWith('/api/auth/')) {
        try {
            const payload = await response.clone().json();
            if (payload?.code === 'PASSWORD_CHANGE_REQUIRED') {
                app.forcePasswordChangeMode?.(payload.error);
            }
        } catch (error) {
            // Ignore non-JSON 403 responses.
        }
    }

    return response;
};
