import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from './firebase-config.js';
import { showView, updateNav, displayAuthError, displayAuthSuccess, clearAuthMessages, authElements, dashboardElements } from './ui.js';
import { clearInProgressSession } from './modules/session-manager.js';
import { initializeAppAfterAuth } from './app.js';
import { logger } from './utils/logger.js';

let currentUser = null;

export function getCurrentUser() {
    return currentUser;
}

function getFriendlyAuthErrorMessage(error) {
    switch (error.code) {
        case 'auth/invalid-email': return "El formato del email no es válido.";
        case 'auth/user-disabled': return "Esta cuenta de usuario ha sido deshabilitada.";
        case 'auth/user-not-found': return "No se encontró ningún usuario con este email.";
        case 'auth/wrong-password': return "La contraseña es incorrecta.";
        case 'auth/email-already-in-use': return "Este email ya está registrado. Intenta iniciar sesión.";
        case 'auth/weak-password': return "La contraseña es demasiado débil (mínimo 6 caracteres).";
        case 'auth/operation-not-allowed': return "Inicio de sesión con email/contraseña no habilitado.";
        case 'auth/missing-password': return "Por favor, introduce una contraseña.";
        default:
            logger.error('Unhandled Auth Error:', error);
            return "Error de autenticación. Inténtalo de nuevo.";
    }
}

export async function handleEmailSignup(event) {
    event.preventDefault(); // Prevent form submission if attached to form
    clearAuthMessages();
    const email = authElements.emailInput.value;
    const password = authElements.passwordInput.value;
    if (!email || !password) {
        displayAuthError("Por favor, introduce email y contraseña.");
        return;
    }
    if (password.length < 6) {
        displayAuthError("La contraseña debe tener al menos 6 caracteres.");
        return;
    }

    authElements.signupBtn.disabled = true;
    authElements.loginBtn.disabled = true;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest
        displayAuthSuccess("¡Registro exitoso! Serás redirigido.");
    } catch (error) {
        displayAuthError(getFriendlyAuthErrorMessage(error));
        // Load diagnostics on auth errors that might be network-related
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            // Dynamically import the diagnostics function
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
    event.preventDefault(); // Prevent form submission
    clearAuthMessages();
    const email = authElements.emailInput.value;
    const password = authElements.passwordInput.value;
    if (!email || !password) {
        displayAuthError("Por favor, introduce email y contraseña.");
        return;
    }

    authElements.loginBtn.disabled = true;
    authElements.signupBtn.disabled = true;

    try {        await signInWithEmailAndPassword(auth, email, password);
        displayAuthSuccess("¡Inicio de sesión exitoso! Serás redirigido.");
        // onAuthStateChanged will handle fetching routines for existing user
    } catch (error) {
        displayAuthError(getFriendlyAuthErrorMessage(error));
        // Load diagnostics on auth errors that might be network-related
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            // Dynamically import the diagnostics function
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
        alert("Error al cerrar sesión.");
    }
}

// Attach event listeners to the auth buttons
// Ensure this runs after the DOM is ready and elements are available.
// Since auth.js is a module and imports authElements from ui.js (which queries the DOM),
// this should generally be fine.
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
        await initializeAppAfterAuth(user); // This will now fetch/initialize routines
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