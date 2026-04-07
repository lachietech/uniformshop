const allowedNextTargets = new Set([
    '/dashboard',
    '/sales-records',
    '/pos',
    '/receipts',
    '/stock-manager',
    '/access-management',
    '/account'
]);

function readCookie(cookieName) {
    const cookieSource = document.cookie || '';
    const cookies = cookieSource.split(';').map((entry) => entry.trim()).filter(Boolean);
    const match = cookies.find((entry) => entry.startsWith(`${cookieName}=`));
    if (!match) {
        return '';
    }
    return decodeURIComponent(match.substring(cookieName.length + 1));
}

function getCsrfToken() {
    return readCookie('uniform_shop_csrf_token');
}

async function fetchWithCsrf(resource, options = {}) {
    const requestOptions = { ...options };
    const method = String(requestOptions.method || 'GET').toUpperCase();
    const isMutatingMethod = !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);

    if (isMutatingMethod) {
        const headers = new Headers(requestOptions.headers || {});
        const csrfToken = getCsrfToken();
        if (csrfToken && !headers.has('x-csrf-token')) {
            headers.set('x-csrf-token', csrfToken);
        }
        requestOptions.headers = headers;
    }

    return fetch(resource, requestOptions);
}

async function preloadCsrfToken() {
    try {
        await fetch('/api/csrf-token', { cache: 'no-store' });
    } catch (error) {
        // Best effort: page-level GET requests usually provide a token cookie already.
    }
}

function getSafeNextTarget() {
    const params = new URLSearchParams(window.location.search);
    const nextValue = (params.get('next') || '/dashboard').trim();
    if (!allowedNextTargets.has(nextValue)) {
        return '/dashboard';
    }
    return nextValue;
}

function showLoginScreen(message = '') {
    const loginPanel = document.getElementById('loginPanel');
    const setupPanel = document.getElementById('setupPanel');
    const passwordInput = document.getElementById('passwordInput');

    loginPanel?.classList.remove('hidden');
    setupPanel?.classList.add('hidden');
    if (passwordInput) {
        passwordInput.value = '';
    }

    const passwordError = document.getElementById('passwordError');
    const setupError = document.getElementById('setupError');
    if (passwordError) {
        passwordError.textContent = message;
    }
    if (setupError) {
        setupError.textContent = '';
    }
}

function showInitialSetup(message = '') {
    const loginPanel = document.getElementById('loginPanel');
    const setupPanel = document.getElementById('setupPanel');

    loginPanel?.classList.add('hidden');
    setupPanel?.classList.remove('hidden');

    const passwordError = document.getElementById('passwordError');
    const setupError = document.getElementById('setupError');
    if (passwordError) {
        passwordError.textContent = '';
    }
    if (setupError) {
        setupError.textContent = message;
    }
}

async function checkExistingSession() {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!response.ok) {
        return false;
    }

    window.location.assign(getSafeNextTarget());
    return true;
}

async function loadSetupStatus(message = '') {
    try {
        const response = await fetch('/api/auth/setup-status', { cache: 'no-store' });
        const data = await response.json();
        if (data.needsSetup) {
            showInitialSetup(message);
            return;
        }
        showLoginScreen(message);
    } catch (error) {
        showLoginScreen('Could not connect to server');
    }
}

async function login() {
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const username = usernameInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    if (!username || !password) {
        showLoginScreen('Enter both username and password');
        return;
    }

    showLoginScreen('');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing In...';
    }

    try {
        const response = await fetchWithCsrf('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (!response.ok) {
            showLoginScreen(data.error || 'Authentication failed');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
            return;
        }

        window.location.assign(getSafeNextTarget());
    } catch (error) {
        showLoginScreen('Could not connect to server');
    } finally {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
        }
    }
}

async function runInitialSetup() {
    const username = document.getElementById('setupUsernameInput')?.value.trim() || '';
    const password = document.getElementById('setupPasswordInput')?.value || '';
    const confirmPassword = document.getElementById('setupConfirmPasswordInput')?.value || '';
    const setupBtn = document.getElementById('setupBtn');

    if (setupBtn) {
        setupBtn.disabled = true;
        setupBtn.textContent = 'Creating...';
    }

    try {
        const response = await fetchWithCsrf('/api/auth/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, confirmPassword })
        });
        const data = await response.json();
        if (!response.ok) {
            showInitialSetup(data.error || 'Unable to complete setup');
            return;
        }

        window.location.assign(getSafeNextTarget());
    } catch (error) {
        showInitialSetup('Could not connect to server');
    } finally {
        if (setupBtn) {
            setupBtn.disabled = false;
            setupBtn.textContent = 'Create Administrator';
        }
    }
}

function setupEventHandlers() {
    const loginBtn = document.getElementById('loginBtn');
    const setupBtn = document.getElementById('setupBtn');
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const setupUsernameInput = document.getElementById('setupUsernameInput');
    const setupPasswordInput = document.getElementById('setupPasswordInput');
    const setupConfirmPasswordInput = document.getElementById('setupConfirmPasswordInput');

    loginBtn?.addEventListener('click', login);
    setupBtn?.addEventListener('click', runInitialSetup);

    usernameInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            login();
        }
    });
    passwordInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            login();
        }
    });

    setupUsernameInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            runInitialSetup();
        }
    });
    setupPasswordInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            runInitialSetup();
        }
    });
    setupConfirmPasswordInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            runInitialSetup();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    setupEventHandlers();
    await preloadCsrfToken();
    const hasSession = await checkExistingSession();
    if (!hasSession) {
        await loadSetupStatus();
    }
});
