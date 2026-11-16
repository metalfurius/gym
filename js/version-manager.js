import { saveInProgressSession, loadInProgressSession } from './modules/session-manager.js';
import { logger } from './utils/logger.js';
import { t } from './i18n.js';
import { fetchLatestRelease, prepareReleaseWorker, activateReleaseWorker, compareRevisions } from './utils/release-updater.js';

const VERSION_KEY = 'gym-tracker-version';
const REVISION_KEY = 'gym-tracker-release-revision';
const BACKUP_SESSION_KEY = 'gym-tracker-backup-session';
const DEFAULT_VERSION = '2.8.2';
const DEFAULT_REVISION = 'v2.8.2';
let explicitUpdateInProgress = false;

function getDocumentRevision() {
    if (typeof document === 'undefined') return DEFAULT_REVISION;
    return document.querySelector('meta[name="gym-release-revision"]')?.content || DEFAULT_REVISION;
}

function normalizeReleaseMetadata(metadata = {}) {
    const version = typeof metadata.version === 'string' && metadata.version ? metadata.version : DEFAULT_VERSION;
    const revision = typeof metadata.revision === 'string' && metadata.revision
        ? metadata.revision
        : typeof metadata.release_revision === 'string' && metadata.release_revision
            ? metadata.release_revision
            : `v${version}`;

    return { version, revision };
}

async function fetchJson(path) {
    const url = new URL(path, window.location.href);
    url.searchParams.set('gym_update', `${Date.now()}-${Math.random()}`);
    const response = await fetch(url, { cache: 'no-store' });
    if (response && response.ok === false) {
        throw new Error(`Release metadata request failed with status ${response.status}`);
    }
    return response.json();
}

async function getCurrentReleaseMetadata() {
    try {
        return normalizeReleaseMetadata(await fetchJson('./release.json'));
    } catch (releaseError) {
        logger.warn('Release metadata unavailable; falling back to manifest:', releaseError);
        try {
            const manifest = await fetchJson('./manifest.json');
            return normalizeReleaseMetadata({
                version: manifest.version,
                revision: manifest.release_revision
            });
        } catch (manifestError) {
            logger.warn('Manifest metadata unavailable; using the shell revision:', manifestError);
            const revision = getDocumentRevision();
            return normalizeReleaseMetadata({
                version: revision.startsWith('v') ? revision.slice(1) : DEFAULT_VERSION,
                revision
            });
        }
    }
}

function restoreSessionSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || !('routineId' in snapshot)) {
        return false;
    }

    saveInProgressSession({
        routineId: snapshot.routineId,
        data: snapshot.data || {},
        timestamp: snapshot.timestamp || Date.now()
    });

    return true;
}

function backupInProgressSession() {
    const inProgressSession = loadInProgressSession();
    if (!inProgressSession) return null;

    localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(inProgressSession));
    return inProgressSession;
}

function storeReleaseMetadata(metadata) {
    localStorage.setItem(VERSION_KEY, metadata.version);
    localStorage.setItem(REVISION_KEY, metadata.revision);
}

function getUpdateStatusElement() {
    return typeof document === 'undefined' ? null : document.getElementById('update-status');
}

function setUpdateStatus(message, visible = false) {
    const statusElement = getUpdateStatusElement();
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.classList.toggle('sr-only', !visible);
    }
}

async function getServiceWorkerRegistration() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;

    if (typeof navigator.serviceWorker.getRegistration === 'function') {
        return navigator.serviceWorker.getRegistration();
    }

    if (typeof navigator.serviceWorker.getRegistrations === 'function') {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations[0] || null;
    }

    return null;
}

function showUpdateNotification(oldVersion, newVersion) {
    if (typeof document === 'undefined' || !document.body) return;

    const existing = document.getElementById('update-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'update-notification';
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');
    notification.setAttribute('aria-atomic', 'true');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #27ae60, #2ecc71);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        max-width: 90%;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    `;

    const title = document.createElement('strong');
    title.textContent = t('version.updated_title');
    const message = document.createElement('div');
    message.style.cssText = 'font-size: 0.9em; opacity: 0.9; margin-top: 8px;';
    message.textContent = t('version.updated_message', { version: newVersion, oldVersion });
    notification.append(title, message);
    document.body.appendChild(notification);
}

async function activateWaitingServiceWorker(registration, newVersion = null) {
    const waitingWorker = registration?.waiting;
    if (!waitingWorker) return false;

    backupInProgressSession();
    const versionLabel = newVersion || getDocumentRevision();
    setUpdateStatus(t('version.update_available', { version: versionLabel }));
    showUpdateNotification(localStorage.getItem(VERSION_KEY) || '', versionLabel);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return true;
}

async function waitForInstallingWorker(registration) {
    const installingWorker = registration?.installing;
    if (!installingWorker) return;

    if (installingWorker.state === 'installed') return;

    await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 10_000);
        installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' || installingWorker.state === 'redundant') {
                clearTimeout(timeout);
                resolve();
            }
        });
    });
}

export function registerServiceWorkerUpdates(registration) {
    if (!registration || typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    const hadController = Boolean(navigator.serviceWorker.controller);
    let activationRequested = false;
    let reloadRequested = false;

    const activateWaiting = async () => {
        if (explicitUpdateInProgress) return;
        if (activationRequested) return;
        if (!registration.waiting) return;
        activationRequested = true;
        await activateWaitingServiceWorker(registration);
        if (hadController) {
            setTimeout(() => {
                // Some browsers activate a worker without emitting controllerchange
                // until the next navigation. The replacement cache is complete at
                // this point, so a bounded fallback reload is safe and coherent.
                if (!reloadRequested && navigator.serviceWorker.controller) {
                    reloadRequested = true;
                    setUpdateStatus(t('version.update_reloading'));
                    window.location.reload();
                }
            }, 2_000);
        }
    };

    registration.addEventListener?.('updatefound', () => {
        const installingWorker = registration.installing;
        installingWorker?.addEventListener?.('statechange', () => {
            if (installingWorker.state === 'installed') activateWaiting();
        });
    });

    if (registration.waiting) activateWaiting().catch((error) => logger.warn('Waiting service worker activation failed:', error));

    navigator.serviceWorker.addEventListener?.('controllerchange', () => {
        if (!hadController || reloadRequested) return;
        reloadRequested = true;
        setUpdateStatus(t('version.update_reloading'));
        window.location.reload();
    });

    const updatePromise = registration.update?.();
    updatePromise?.catch((error) => {
        logger.warn('Service worker update check failed:', error);
        setUpdateStatus(t('version.update_check_error'));
    });
}

async function requestServiceWorkerUpdate(newVersion = null) {
    const registration = await getServiceWorkerRegistration();
    if (!registration) return false;

    if (newVersion && `v${newVersion}` !== getDocumentRevision()) {
        explicitUpdateInProgress = true;
        try {
            const { worker } = await prepareReleaseWorker({ revision: `v${newVersion}` });
            await activateReleaseWorker(worker);
            window.location.reload();
            return true;
        } finally {
            explicitUpdateInProgress = false;
        }
    }

    await registration.update?.();
    await waitForInstallingWorker(registration);
    return activateWaitingServiceWorker(registration, newVersion);
}

export async function initVersionControl() {
    let currentRelease = await getCurrentReleaseMetadata();
    const installedRevision = document.querySelector('meta[name="gym-release-revision"]')?.content;
    if (/^v\d+\.\d+\.\d+$/.test(installedRevision || '') &&
        (!/^v\d+\.\d+\.\d+$/.test(currentRelease.revision) || compareRevisions(currentRelease.revision, installedRevision) < 0)) {
        logger.warn('Ignoring release metadata older than the installed application');
        currentRelease = normalizeReleaseMetadata({ version: installedRevision.slice(1), revision: installedRevision });
    }
    const storedVersion = localStorage.getItem(VERSION_KEY);
    const storedRevision = localStorage.getItem(REVISION_KEY) || (storedVersion ? `v${storedVersion}` : null);

    logger.info(`Version Manager: Current=${currentRelease.revision}, Stored=${storedRevision || 'none'}`);

    if (!storedVersion) {
        storeReleaseMetadata(currentRelease);
        logger.info('Version Manager: First installation detected');
        return { isUpdate: false, isFirstInstall: true };
    }

    if (storedVersion !== currentRelease.version || storedRevision !== currentRelease.revision ||
        (installedRevision && installedRevision !== currentRelease.revision)) {
        logger.info(`Version Manager: Update detected from ${storedRevision} to ${currentRelease.revision}`);
        await handleAppUpdate(storedVersion, currentRelease);
        return { isUpdate: true, isFirstInstall: false, oldVersion: storedVersion };
    }

    return { isUpdate: false, isFirstInstall: false };
}

async function handleAppUpdate(oldVersion, newRelease) {
    try {
        const inProgressSession = backupInProgressSession();
        setUpdateStatus(t('version.update_available', { version: newRelease.version }));
        const activated = await requestServiceWorkerUpdate(newRelease.version);
        const installedRevision = document.querySelector('meta[name="gym-release-revision"]')?.content;
        if (installedRevision && newRelease.revision !== installedRevision && !activated) {
            throw new Error('The new release could not be installed');
        }
        storeReleaseMetadata(newRelease);

        if (inProgressSession && !loadInProgressSession()) {
            restoreSessionSnapshot(inProgressSession);
            logger.info('Version Manager: In-progress session preserved for update');
        }

        if (!activated) localStorage.removeItem(BACKUP_SESSION_KEY);
        if (newRelease.revision === getDocumentRevision()) showUpdateNotification(oldVersion, newRelease.version);
        logger.info('Version Manager: Update process completed successfully');
    } catch (error) {
        logger.error('Version Manager: Error during update process:', error);
        setUpdateStatus(t('version.update_recovery_error'));

        const backupSession = localStorage.getItem(BACKUP_SESSION_KEY);
        if (!backupSession) return;

        try {
            if (!loadInProgressSession() && restoreSessionSnapshot(JSON.parse(backupSession))) {
                logger.info('Version Manager: Session restored from update backup');
            }
        } catch (restoreError) {
            logger.error('Version Manager: Could not restore session from backup:', restoreError);
        } finally {
            localStorage.removeItem(BACKUP_SESSION_KEY);
        }
    }
}

export async function forceAppUpdate() {
    logger.info('Version Manager: Requesting app update...');
    const forceUpdateBtn = document.getElementById('force-update-btn');
    const previousBackup = localStorage.getItem(BACKUP_SESSION_KEY);
    let backedUp = false;

    try {
        if (forceUpdateBtn) {
            forceUpdateBtn.classList.add('updating');
            forceUpdateBtn.textContent = t('version.force_update_loading');
            forceUpdateBtn.disabled = true;
        }

        backedUp = Boolean(backupInProgressSession());
        explicitUpdateInProgress = true;
        const release = await fetchLatestRelease();
        if (compareRevisions(release.revision, getDocumentRevision()) < 0) {
            throw new Error('The latest release metadata is older than the installed application');
        }
        const { worker } = await prepareReleaseWorker(release);
        await activateReleaseWorker(worker);
        setUpdateStatus(t('version.update_reloading'));
        window.location.reload();
    } catch (error) {
        logger.error('Version Manager: Error during forced update:', error);
        if (backedUp) {
            if (previousBackup === null) localStorage.removeItem(BACKUP_SESSION_KEY);
            else localStorage.setItem(BACKUP_SESSION_KEY, previousBackup);
        }
        setUpdateStatus(t('version.update_recovery_error'), true);
        if (forceUpdateBtn) {
            forceUpdateBtn.classList.remove('updating');
            forceUpdateBtn.classList.add('error');
            forceUpdateBtn.textContent = t('version.force_update_error');
            forceUpdateBtn.disabled = false;
        }
    } finally {
        explicitUpdateInProgress = false;
    }
}

export async function getCurrentVersion() {
    const installed = document.querySelector('meta[name="gym-release-revision"]')?.content;
    if (/^v\d+\.\d+\.\d+$/.test(installed || '')) return installed.slice(1);
    return (await getCurrentReleaseMetadata()).version;
}

export function checkForBackupSession() {
    const backupSession = localStorage.getItem(BACKUP_SESSION_KEY);
    if (!backupSession) return false;

    try {
        if (loadInProgressSession()) {
            localStorage.removeItem(BACKUP_SESSION_KEY);
            return false;
        }
        const restored = restoreSessionSnapshot(JSON.parse(backupSession));
        localStorage.removeItem(BACKUP_SESSION_KEY);
        if (restored) logger.info('Version Manager: Backup session restored on app start');
        return restored;
    } catch (error) {
        logger.error('Version Manager: Error restoring backup session:', error);
        localStorage.removeItem(BACKUP_SESSION_KEY);
        return false;
    }
}
