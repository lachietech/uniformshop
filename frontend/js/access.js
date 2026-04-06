const accessApp = window.UniformShopApp;

function setupAccessManagement() {
    document.getElementById('createUserForm')?.addEventListener('submit', createUser);
    document.getElementById('accessRefreshBtn')?.addEventListener('click', loadUsers);
    document.getElementById('refreshAuditBtn')?.addEventListener('click', loadAuditLogs);
    document.getElementById('saveUserBtn')?.addEventListener('click', saveManagedUser);
    document.getElementById('cancelUserBtn')?.addEventListener('click', closeUserModal);
    document.getElementById('userModalClose')?.addEventListener('click', closeUserModal);

    const modal = document.getElementById('userModal');
    if (modal) {
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeUserModal();
            }
        });
    }
}

function setupAccountSection() {
    document.getElementById('changePasswordForm')?.addEventListener('submit', changePassword);
}

function showAccessStatus(message, kind = 'info') {
    const status = document.getElementById('accessStatus');
    if (!status) return;
    status.className = `status-message ${kind}`;
    status.textContent = message;
}

function showChangePasswordStatus(message, kind = 'info') {
    const status = document.getElementById('changePasswordStatus');
    if (!status) {
        return;
    }
    if (!message) {
        status.className = 'status-message';
        status.textContent = '';
        return;
    }
    status.className = `status-message ${kind}`;
    status.textContent = message;
}

function applyUserAccessState() {
    const mustChangePassword = Boolean(accessApp.state.currentSessionUser?.mustChangePassword);
    document.querySelectorAll('.nav-btn').forEach((button) => {
        const section = button.getAttribute('data-section');
        if (!section) {
            return;
        }
        button.disabled = mustChangePassword && section !== 'account';
        button.classList.toggle('hidden', section === 'access' && accessApp.state.currentSessionUser?.role !== 'admin');
    });

    const accountNotice = document.getElementById('accountNotice');
    if (mustChangePassword) {
        if (accountNotice) {
            accountNotice.className = 'status-message error';
            accountNotice.textContent = 'Password change required. Update your password before using the rest of the platform.';
        }
        accessApp.setActiveSection?.('account');
    } else if (accountNotice) {
        accountNotice.className = 'status-message info';
        accountNotice.textContent = 'Keep your account secure by using a unique password and updating it when access changes.';
    }
}

function refreshAccountSection() {
    const accountUsername = document.getElementById('accountUsername');
    const accountRole = document.getElementById('accountRole');
    const accountPasswordState = document.getElementById('accountPasswordState');

    if (accountUsername) {
        accountUsername.textContent = accessApp.state.currentSessionUser?.username || '-';
    }
    if (accountRole) {
        accountRole.textContent = accessApp.state.currentSessionUser?.role === 'admin' ? 'Administrator' : 'Staff';
    }
    if (accountPasswordState) {
        accountPasswordState.textContent = accessApp.state.currentSessionUser?.mustChangePassword ? 'Change required' : 'Current';
    }
    applyUserAccessState();
}

function forcePasswordChangeMode(message = 'Password change required.') {
    if (!accessApp.state.currentSessionUser) {
        return;
    }
    accessApp.state.currentSessionUser = {
        ...accessApp.state.currentSessionUser,
        mustChangePassword: true
    };
    refreshAccountSection();
    accessApp.setActiveSection?.('account');
    showChangePasswordStatus(message, 'error');
}

async function loadUsers() {
    const body = document.getElementById('usersTableBody');
    if (!body || accessApp.state.currentSessionUser?.role !== 'admin') {
        return;
    }

    body.innerHTML = '<tr><td colspan="5" class="loading">Loading users...</td></tr>';
    try {
        const response = await fetch('/api/auth/users');
        const users = await response.json();
        if (!response.ok) {
            throw new Error(users.error || 'Failed to load users');
        }

        if (!users.length) {
            body.innerHTML = '<tr><td colspan="5" class="loading">No users found.</td></tr>';
            return;
        }

        body.innerHTML = users.map((user) => `
            <tr>
                <td>${accessApp.escapeHtml(user.username)}</td>
                <td>${user.role === 'admin' ? 'Administrator' : 'Staff'}</td>
                <td>
                    <span class="pos-status-pill ${getUserStatusClass(user)}">
                        ${getUserStatusLabel(user)}
                    </span>
                </td>
                <td>${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
                <td><button class="btn btn-secondary btn-small" data-user-id="${user.id}">Manage</button></td>
            </tr>
        `).join('');

        body.querySelectorAll('[data-user-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const user = users.find((item) => item.id === button.getAttribute('data-user-id'));
                if (user) {
                    openUserModal(user);
                }
            });
        });
    } catch (error) {
        body.innerHTML = `<tr><td colspan="5" style="color: #d9534f;">${error.message}</td></tr>`;
    }
}

async function createUser(event) {
    event.preventDefault();
    const username = document.getElementById('newUserUsername')?.value.trim() || '';
    const password = document.getElementById('newUserPassword')?.value || '';
    const role = document.getElementById('newUserRole')?.value || 'staff';

    try {
        const response = await fetch('/api/auth/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create user');
        }

        document.getElementById('createUserForm')?.reset();
        const setupNote = data.user.mustChangePassword ? ' Password change will be required on first sign-in.' : '';
        showAccessStatus(`User ${data.user.username} created successfully.${setupNote}`, 'success');
        await loadUsers();
        await loadAuditLogs();
    } catch (error) {
        showAccessStatus(error.message, 'error');
    }
}

function getUserStatusLabel(user) {
    if (!user.active) {
        return 'Inactive';
    }
    if (user.mustChangePassword) {
        return 'Password reset required';
    }
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
        return 'Locked';
    }
    return 'Active';
}

function getUserStatusClass(user) {
    if (!user.active) {
        return 'pos-status-inactive';
    }
    if (user.mustChangePassword) {
        return 'pos-status-warning';
    }
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
        return 'pos-status-warning';
    }
    return 'pos-status-active';
}

function openUserModal(user) {
    accessApp.state.currentManagedUser = user;
    const titleEl = document.getElementById('userModalTitle');
    const usernameEl = document.getElementById('manageUserUsername');
    const roleEl = document.getElementById('manageUserRole');
    const activeEl = document.getElementById('manageUserActive');
    const passwordEl = document.getElementById('manageUserPassword');
    const modalEl = document.getElementById('userModal');
    if (!titleEl || !usernameEl || !roleEl || !activeEl || !passwordEl || !modalEl) {
        return;
    }

    titleEl.textContent = `Manage ${user.username}`;
    usernameEl.value = user.username;
    roleEl.value = user.role;
    activeEl.checked = Boolean(user.active);
    passwordEl.value = '';
    modalEl.classList.add('show');
}

function closeUserModal() {
    accessApp.state.currentManagedUser = null;
    document.getElementById('userModal')?.classList.remove('show');
}

async function saveManagedUser() {
    if (!accessApp.state.currentManagedUser) {
        return;
    }

    const username = document.getElementById('manageUserUsername')?.value.trim() || '';
    const role = document.getElementById('manageUserRole')?.value || 'staff';
    const active = document.getElementById('manageUserActive')?.checked ?? true;
    const password = document.getElementById('manageUserPassword')?.value || '';

    try {
        const response = await fetch(`/api/auth/users/${accessApp.state.currentManagedUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, role, active, password })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to update user');
        }

        closeUserModal();
        showAccessStatus(`User ${data.user.username} updated successfully.`, 'success');
        await loadUsers();
        await loadAuditLogs();
        if (accessApp.state.currentSessionUser && data.user.id === accessApp.state.currentSessionUser.id) {
            accessApp.state.currentSessionUser = { ...accessApp.state.currentSessionUser, ...data.user };
            document.getElementById('sessionUsername').textContent = data.user.username;
            document.getElementById('sessionRole').textContent = data.user.role === 'admin' ? 'Administrator' : 'Staff';
            document.getElementById('accessNavBtn')?.classList.toggle('hidden', data.user.role !== 'admin');
            refreshAccountSection();
            if (data.user.role !== 'admin' && accessApp.getCurrentPage?.() === 'access') {
                window.location.assign(accessApp.pageRoutes.dashboard);
            }
        }
    } catch (error) {
        showAccessStatus(error.message, 'error');
    }
}

async function loadAuditLogs() {
    const body = document.getElementById('auditLogBody');
    if (!body || accessApp.state.currentSessionUser?.role !== 'admin') {
        return;
    }

    body.innerHTML = '<tr><td colspan="5" class="loading">Loading activity...</td></tr>';
    try {
        const response = await fetch('/api/auth/audit-logs');
        const logs = await response.json();
        if (!response.ok) {
            throw new Error(logs.error || 'Failed to load activity');
        }

        if (!logs.length) {
            body.innerHTML = '<tr><td colspan="5" class="loading">No audit activity recorded yet.</td></tr>';
            return;
        }

        body.innerHTML = logs.map((entry) => `
            <tr>
                <td>${new Date(entry.createdAt).toLocaleString()}</td>
                <td>${accessApp.escapeHtml(entry.action)}</td>
                <td>${accessApp.escapeHtml(entry.actorUsername || 'system')}</td>
                <td>${accessApp.escapeHtml(entry.targetUsername || '-')}</td>
                <td>${accessApp.escapeHtml(formatAuditDetails(entry.details))}</td>
            </tr>
        `).join('');
    } catch (error) {
        body.innerHTML = `<tr><td colspan="5" style="color: #d9534f;">${error.message}</td></tr>`;
    }
}

function formatAuditDetails(details) {
    if (!details || typeof details !== 'object') {
        return '-';
    }

    return Object.entries(details)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(' | ') || '-';
}

async function changePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPasswordInput')?.value || '';
    const newPassword = document.getElementById('newPasswordInput')?.value || '';
    const confirmPassword = document.getElementById('confirmPasswordInput')?.value || '';
    const button = document.getElementById('changePasswordBtn');

    showChangePasswordStatus('', 'info');
    button.disabled = true;
    button.textContent = 'Updating...';

    try {
        const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to change password');
        }

        accessApp.state.currentSessionUser = { ...accessApp.state.currentSessionUser, ...data.user };
        document.getElementById('changePasswordForm')?.reset();
        document.getElementById('sessionUsername').textContent = data.user.username;
        document.getElementById('sessionRole').textContent = data.user.role === 'admin' ? 'Administrator' : 'Staff';
        refreshAccountSection();
        showChangePasswordStatus('Password updated successfully.', 'success');
        if (accessApp.state.currentSessionUser.role === 'admin') {
            loadAuditLogs();
        }
        if (!accessApp.state.currentSessionUser.mustChangePassword) {
            window.location.assign(accessApp.pageRoutes.dashboard);
        }
    } catch (error) {
        showChangePasswordStatus(error.message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Update Password';
    }
}

accessApp.setupAccessManagement = setupAccessManagement;
accessApp.setupAccountSection = setupAccountSection;
accessApp.loadUsers = loadUsers;
accessApp.loadAuditLogs = loadAuditLogs;
accessApp.refreshAccountSection = refreshAccountSection;
accessApp.forcePasswordChangeMode = forcePasswordChangeMode;
accessApp.showChangePasswordStatus = showChangePasswordStatus;
