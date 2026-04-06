const shellApp = window.UniformShopApp;

function safeSetup(methodName) {
    if (!shellApp || typeof shellApp[methodName] !== 'function') {
        return;
    }

    try {
        shellApp[methodName]();
    } catch (error) {
        console.error(`Startup step failed: ${methodName}`, error);
    }
}

function initializeAppShell() {
    if (shellApp?.state?.appInitialized) {
        return;
    }

    safeSetup('setupAuthUI');
    safeSetup('setupNavigation');
    safeSetup('setupFilterButtons');
    safeSetup('setupAddMonthForm');
    safeSetup('setupModal');
    safeSetup('setupPOS');
    safeSetup('setupReceipts');
    safeSetup('setupStockManager');
    safeSetup('setupAccessManagement');
    safeSetup('setupAccountSection');
    safeSetup('renderPOSCart');

    if (shellApp?.state) {
        shellApp.state.appInitialized = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeAppShell();
    shellApp.restoreSession?.();
});