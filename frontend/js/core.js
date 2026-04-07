const app = window.UniformShopApp || (window.UniformShopApp = {});

const currencyFormatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
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
const fixedSizeOrder = new Map([
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
    return currencyFormatter.format(Number(value || 0));
};

app.compareSizes = function compareSizes(leftValue, rightValue) {
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

    const parseRank = (value) => {
        if (fixedSizeOrder.has(value)) return fixedSizeOrder.get(value);
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

app.el = function el(tagName, options = {}, children = []) {
    const element = document.createElement(tagName);

    if (options.className) {
        element.className = options.className;
    }
    if (options.text !== undefined) {
        element.textContent = options.text;
    }
    if (options.html !== undefined) {
        element.innerHTML = options.html;
    }
    if (options.type) {
        element.type = options.type;
    }
    if (options.value !== undefined) {
        element.value = options.value;
    }
    if (options.id) {
        element.id = options.id;
    }
    if (options.attrs) {
        Object.entries(options.attrs).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                element.setAttribute(key, String(value));
            }
        });
    }
    if (options.dataset) {
        Object.entries(options.dataset).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                element.dataset[key] = String(value);
            }
        });
    }
    if (options.style) {
        Object.assign(element.style, options.style);
    }

    const childList = Array.isArray(children) ? children : [children];
    childList.filter(Boolean).forEach((child) => element.appendChild(child));
    return element;
};

app.replaceChildren = function replaceChildren(element, children = []) {
    if (!element) {
        return;
    }
    element.replaceChildren(...(Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean)));
};

app.createButton = function createButton({ className = '', text = '', type = 'button', dataset, attrs, onClick } = {}) {
    const button = app.el('button', {
        className,
        text,
        type,
        dataset,
        attrs
    });
    if (typeof onClick === 'function') {
        button.addEventListener('click', onClick);
    }
    return button;
};

app.createTableCell = function createTableCell(content = '', options = {}) {
    const cell = document.createElement('td');
    if (options.className) {
        cell.className = options.className;
    }
    if (options.colspan) {
        cell.colSpan = options.colspan;
    }
    if (content instanceof Node) {
        cell.appendChild(content);
        return cell;
    }
    if (options.strong) {
        cell.appendChild(app.el('strong', { text: String(content ?? '') }));
        return cell;
    }
    cell.textContent = String(content ?? '');
    return cell;
};

app.setTableMessage = function setTableMessage(body, colspan, message, options = {}) {
    if (!body) {
        return;
    }
    const row = document.createElement('tr');
    const cell = app.createTableCell(message, {
        colspan,
        className: options.className || 'loading'
    });
    if (options.color) {
        cell.style.color = options.color;
    }
    row.appendChild(cell);
    body.replaceChildren(row);
};

app.readCookie = function readCookie(cookieName) {
    const cookieSource = document.cookie || '';
    const cookies = cookieSource.split(';').map((entry) => entry.trim()).filter(Boolean);
    const match = cookies.find((entry) => entry.startsWith(`${cookieName}=`));
    if (!match) {
        return '';
    }
    return decodeURIComponent(match.substring(cookieName.length + 1));
};

app.getCsrfToken = function getCsrfToken() {
    return app.readCookie('uniform_shop_csrf_token');
};

window.fetch = async (resource, options) => {
    const requestOptions = options ? { ...options } : {};
    const method = String(requestOptions.method || 'GET').toUpperCase();
    const isMutatingMethod = !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);
    const isApiRequest = typeof resource === 'string' && resource.startsWith('/api/');

    if (isMutatingMethod && isApiRequest) {
        const headers = new Headers(requestOptions.headers || {});
        if (!headers.has('x-csrf-token')) {
            const csrfToken = app.getCsrfToken();
            if (csrfToken) {
                headers.set('x-csrf-token', csrfToken);
            }
        }
        requestOptions.headers = headers;
    }

    const response = await app.nativeFetch(resource, requestOptions);

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
