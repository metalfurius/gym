import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from './firebase-config.js';
import { showView, updateNav, displayAuthError, displayAuthSuccess, clearAuthMessages, authElements, dashboardElements, populateDaySelector } from './ui.js';
import { loadInProgressSession, clearInProgressSession } from './store.js';
import { initializeAppAfterAuth } from './app.js'; // To notify app.js about auth state

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
            console.error("Unhandled Auth Error:", error);
            return "Error de autenticación. Inténtalo de nuevo.";
    }
}

export async function handleEmailSignup() {
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
        await createUserWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest
        displayAuthSuccess("¡Registro exitoso! Serás redirigido.");
        // No need to manually navigate, onAuthStateChanged will do it
    } catch (error) {
        displayAuthError(getFriendlyAuthErrorMessage(error));
    } finally {
        authElements.signupBtn.disabled = false;
        authElements.loginBtn.disabled = false;
    }
}

export async function handleEmailLogin() {
    clearAuthMessages();
    const email = authElements.emailInput.value;
    const password = authElements.passwordInput.value;
    if (!email || !password) {
        displayAuthError("Por favor, introduce email y contraseña.");
        return;
    }

    authElements.loginBtn.disabled = true;
    authElements.signupBtn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest
        displayAuthSuccess("¡Inicio de sesión exitoso! Serás redirigido.");
    } catch (error) {
        displayAuthError(getFriendlyAuthErrorMessage(error));
    } finally {
        authElements.loginBtn.disabled = false;
        authElements.signupBtn.disabled = false;
    }
}

export async function handleLogout() {
    try {
        await firebaseSignOut(auth);
        clearInProgressSession(); // Clear any pending session on logout
        // onAuthStateChanged will handle UI changes
    } catch (error) {
        console.error("Logout error:", error);
        alert("Error al cerrar sesión.");
    }
}

// Listener for authentication state changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        console.log("User logged in:", user.email);
        dashboardElements.userEmail.textContent = user.email;
        updateNav(true);
        populateDaySelector(); // Populate selector once user is logged in
        initializeAppAfterAuth(user); // Notify app.js
        showView('dashboard'); // Go to dashboard after login/signup
    } else {
        console.log("User logged out");
        updateNav(false);
        dashboardElements.userEmail.textContent = '';
        showView('auth'); // Go to auth view if not logged in
        authElements.form.reset(); // Clear auth form
        initializeAppAfterAuth(null); // Notify app.js
    }
    clearAuthMessages();
});