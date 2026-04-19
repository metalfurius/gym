import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { auth } from './firebase-config.js';
import {
    showView,
    updateNav,
    displayAuthError,
    displayAuthSuccess,
    clearAuthMessages,
    authElements,
    dashboardElements
} from './ui.js';
import { clearInProgressSession } from './modules/session-manager.js';
import { initializeAppAfterAuth } from './app.js';
import { logger } from './utils/logger.js';
import { t } from './i18n.js';

let currentUser = null;

export function getCurrentUser() {
    return currentUser;
}

function getFriendlyAuthErrorMessage(error) {
    switch (error.code) {
        case 'auth/invalid-email': return t('auth.errors.invalid_email');
        case 'auth/user-disabled': return t('auth.errors.user_disabled');
        case 'auth/user-not-found': return t('auth.errors.user_not_found');
        case 'auth/wrong-password': return t('auth.errors.wrong_password');
        case 'auth/email-already-in-use': return t('auth.errors.email_already_in_use');
        case 'auth/weak-password': return t('auth.errors.weak_password');
        case 'auth/operation-not-allowed': return t('auth.errors.operation_not_allowed');
        case 'auth/missing-password': return t('auth.errors.missing_password');
        default:
            logger.error('Unhandled Auth Error:', error);
            return t('auth.errors.generic');
    }
}

export async function handleEmailSignup(event) {
    event.preventDefault();
    clearAuthMessages();
    const email = authElements.emailInput.value;
    const password = authElements.passwordInput.value;
    if (!email || !password) {
        displayAuthError(t('auth.errors.email_password_required'));
        return;
    }
    if (password.length < 6) {
        displayAuthError(t('auth.errors.password_min'));
        return;
    }

    authElements.signupBtn.disabled = true;
    authElements.loginBtn.disabled = true;

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        displayAuthSuccess(t('auth.signup_success'));
    } catch (error) {
        displayAuthError(getFriendlyAuthErrorMessage(error));
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            import('./app.js').then(module => {
                if (module.loadFirebaseDiagnostics) {
                    module.loadFirebaseDiagnostics();
                }
            });
        }
    } finally {
        authElements.signupBtn.disabled = false;
        authElements.loginBtn.disabled = false;
    }
}

export async function handleEmailLogin(event) {
    event.preventDefault();
    clearAuthMessages();
    const email = authElements.emailInput.value;
    const password = authElements.passwordInput.value;
    if (!email || !password) {
        displayAuthError(t('auth.errors.email_password_required'));
        return;
    }

    authElements.loginBtn.disabled = true;
    authElements.signupBtn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        displayAuthSuccess(t('auth.login_success'));
    } catch (error) {
        displayAuthError(getFriendlyAuthErrorMessage(error));
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            import('./app.js').then(module => {
                if (module.loadFirebaseDiagnostics) {
                    module.loadFirebaseDiagnostics();
                }
            });
        }
    } finally {
        authElements.loginBtn.disabled = false;
        authElements.signupBtn.disabled = false;
    }
}

export async function handleLogout() {
    try {
        await firebaseSignOut(auth);
        clearInProgressSession();
    } catch (error) {
        logger.error('Logout error:', error);
        alert(t('auth.logout_error'));
    }
}

if (authElements.loginBtn) {
    authElements.loginBtn.addEventListener('click', handleEmailLogin);
} else {
    logger.error('Login button not found for attaching event listener.');
}

if (authElements.signupBtn) {
    authElements.signupBtn.addEventListener('click', handleEmailSignup);
} else {
    logger.error('Signup button not found for attaching event listener.');
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        logger.info('User logged in:', user.email);
        dashboardElements.userEmail.textContent = user.email;
        updateNav(true);
        await initializeAppAfterAuth(user);
        showView('dashboard');
    } else {
        logger.info('User logged out');
        updateNav(false);
        dashboardElements.userEmail.textContent = '';
        showView('auth');
        authElements.form.reset();
        initializeAppAfterAuth(null);
    }
    clearAuthMessages();
});

