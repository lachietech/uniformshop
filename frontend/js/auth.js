const authApp = window.UniformShopApp;

function setupAuthUI() {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn?.addEventListener('click', logout);
}

function restoreSession() {
    let serverSessionUser = null;
    const sessionUserDataElement = document.getElementById('sessionUserData');
    if (sessionUserDataElement?.textContent) {
        try {
            serverSessionUser = JSON.parse(sessionUserDataElement.textContent);
        } catch (error) {
            serverSessionUser = null;
        }
    }

    if (!serverSessionUser) {
        handleUnauthorizedResponse();
        return;
    }

    enterAuthenticatedApp(serverSessionUser);
}

async function logout() {
    try {
        await authApp.nativeFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        // Best effort logout still clears the client state.
    }
    handleUnauthorizedResponse();
}

function enterAuthenticatedApp(user) {
    authApp.state.currentSessionUser = user;
    const sessionPanel = document.getElementById('sessionPanel');
    const sessionUsername = document.getElementById('sessionUsername');
    const sessionRole = document.getElementById('sessionRole');
    const accessNavBtn = document.getElementById('accessNavBtn');

    sessionPanel?.classList.remove('hidden');
    if (sessionUsername) {
        sessionUsername.textContent = user?.username || '-';
    }
    if (sessionRole) {
        sessionRole.textContent = user?.role === 'admin' ? 'Administrator' : 'Staff';
    }
    if (accessNavBtn) {
        accessNavBtn.classList.toggle('hidden', user?.role !== 'admin');
    }
    authApp.refreshAccountSection?.();
    if (user?.mustChangePassword) {
        if (authApp.getCurrentPage?.() !== 'account') {
            window.location.assign(authApp.pageRoutes.account);
            return;
        }
        authApp.setActiveSection?.('account');
        authApp.showChangePasswordStatus?.('Password change required before continuing.', 'error');
        return;
    }
    authApp.showChangePasswordStatus?.('', 'info');
    authApp.loadCurrentPage?.();
}

function handleUnauthorizedResponse() {
    authApp.state.currentSessionUser = null;
    const sessionPanel = document.getElementById('sessionPanel');
    const accessNavBtn = document.getElementById('accessNavBtn');
    sessionPanel?.classList.add('hidden');
    accessNavBtn?.classList.add('hidden');
    document.querySelectorAll('.nav-btn').forEach((button) => {
        button.disabled = false;
    });

    const nextTarget = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/signin?next=${nextTarget}`);
}

function forcePasswordChangeMode(message = 'Password change required before continuing.') {
    if (window.location.pathname !== '/account') {
        window.location.assign('/account');
        return;
    }

    authApp.showChangePasswordStatus?.(message, 'error');
}

authApp.setupAuthUI = setupAuthUI;
authApp.restoreSession = restoreSession;
authApp.handleUnauthorizedResponse = handleUnauthorizedResponse;
authApp.forcePasswordChangeMode = forcePasswordChangeMode;
