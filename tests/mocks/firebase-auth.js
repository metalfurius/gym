import {
    __authState,
    __cloneMockValue,
    __createMockUser,
    __notifyAuthListeners,
} from './firebase-state.js';

const authInstance = {
    currentUser: null,
};

function normalizeCredentials(email, password) {
    if (!email) {
        throw { code: 'auth/invalid-email', message: 'Missing email' };
    }

    if (!password) {
        throw { code: 'auth/missing-password', message: 'Missing password' };
    }
}

export function getAuth() {
    return authInstance;
}

export function onAuthStateChanged(_auth, callback) {
    __authState.listeners.add(callback);
    Promise.resolve().then(() => callback(__authState.currentUser));

    return () => {
        __authState.listeners.delete(callback);
    };
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
    normalizeCredentials(email, password);

    if (password.length < 6) {
        throw { code: 'auth/weak-password', message: 'Password must be at least 6 characters' };
    }

    if (__authState.usersByEmail.has(email)) {
        throw { code: 'auth/email-already-in-use', message: 'Email already exists' };
    }

    const user = __createMockUser(email);
    __authState.usersByEmail.set(email, {
        user,
        password,
    });

    __authState.currentUser = __cloneMockValue(user);
    authInstance.currentUser = __cloneMockValue(user);
    await __notifyAuthListeners();

    return {
        user: __cloneMockValue(user),
        operationType: 'signIn',
        providerId: 'password',
    };
}

export async function signInWithEmailAndPassword(_auth, email, password) {
    normalizeCredentials(email, password);

    const account = __authState.usersByEmail.get(email);
    if (!account) {
        throw { code: 'auth/user-not-found', message: 'User not found' };
    }

    if (account.password !== password) {
        throw { code: 'auth/wrong-password', message: 'Wrong password' };
    }

    __authState.currentUser = __cloneMockValue(account.user);
    authInstance.currentUser = __cloneMockValue(account.user);
    await __notifyAuthListeners();

    return {
        user: __cloneMockValue(account.user),
        operationType: 'signIn',
        providerId: 'password',
    };
}

export async function signOut(_auth) {
    __authState.currentUser = null;
    authInstance.currentUser = null;
    await __notifyAuthListeners();
}

export function __getMockAuthState() {
    return {
        currentUser: __cloneMockValue(__authState.currentUser),
        users: Array.from(__authState.usersByEmail.keys()),
    };
}
