import { saveInProgressSession, loadInProgressSession } from './modules/session-manager.js';
import { logger } from './utils/logger.js';

const VERSION_KEY = 'gym-tracker-version';
const BACKUP_SESSION_KEY = 'gym-tracker-backup-session';
const DEFAULT_VERSION = '1.0.2';

async function getCurrentVersionFromManifest() {
    try {
        const response = await fetch('./manifest.json');
        const manifest = await response.json();
        return manifest.version || DEFAULT_VERSION;
    } catch (error) {
        logger.error('Version Manager: Error fetching version from manifest:', error);
        return DEFAULT_VERSION;
    }
}

function restoreSessionSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return false;
    }

    if (!('routineId' in snapshot)) {
        return false;
    }

    saveInProgressSession({
        routineId: snapshot.routineId,
        data: snapshot.data || {},
        timestamp: snapshot.timestamp || Date.now()
    });

    return true;
}

export async function initVersionControl() {
    const currentVersion = await getCurrentVersionFromManifest();
    const storedVersion = localStorage.getItem(VERSION_KEY);

    logger.info(`Version Manager: Current=${currentVersion}, Stored=${storedVersion || 'none'}`);

    if (!storedVersion) {
        localStorage.setItem(VERSION_KEY, currentVersion);
        logger.info('Version Manager: First installation detected');
        return { isUpdate: false, isFirstInstall: true };
    }

    if (storedVersion !== currentVersion) {
        logger.info(`Version Manager: Update detected from ${storedVersion} to ${currentVersion}`);
        await handleAppUpdate(storedVersion, currentVersion);
        return { isUpdate: true, isFirstInstall: false, oldVersion: storedVersion };
    }

    return { isUpdate: false, isFirstInstall: false };
}

async function handleAppUpdate(oldVersion, newVersion) {
    try {
        const inProgressSession = loadInProgressSession();
        if (inProgressSession) {
            logger.info('Version Manager: Backing up in-progress session');
            localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(inProgressSession));
        }

        showUpdateNotification(oldVersion, newVersion);
        await clearBrowserCaches();
        localStorage.setItem(VERSION_KEY, newVersion);

        if (inProgressSession && restoreSessionSnapshot(inProgressSession)) {
            logger.info('Version Manager: Restored in-progress session');
        }

        localStorage.removeItem(BACKUP_SESSION_KEY);
        logger.info('Version Manager: Update process completed successfully');
    } catch (error) {
        logger.error('Version Manager: Error during update process:', error);

        const backupSession = localStorage.getItem(BACKUP_SESSION_KEY);
        if (!backupSession) {
            return;
        }

        try {
            const sessionData = JSON.parse(backupSession);
            if (restoreSessionSnapshot(sessionData)) {
                logger.info('Version Manager: Session restored from backup after error');
            }
        } catch (restoreError) {
            logger.error('Version Manager: Could not restore session from backup:', restoreError);
        } finally {
            localStorage.removeItem(BACKUP_SESSION_KEY);
        }
    }
}

async function clearBrowserCaches() {
    try {
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            const deletePromises = cacheNames
                .filter((name) => name.startsWith('gym-tracker-'))
                .map((name) => {
                    logger.info(`Version Manager: Deleting cache: ${name}`);
                    return caches.delete(name);
                });
            await Promise.all(deletePromises);
        }

        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.update();
            }
        }

        logger.info('Version Manager: Browser caches cleared successfully');
    } catch (error) {
        logger.error('Version Manager: Error clearing caches:', error);
    }
}

function showUpdateNotification(oldVersion, newVersion) {
    const notification = document.createElement('div');
    notification.id = 'update-notification';
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
        animation: slideInFromTop 0.5s ease-out;
    `;

    notification.innerHTML = `
        <div style="margin-bottom: 8px;">
            <strong>Aplicacion actualizada</strong>
        </div>
        <div style="font-size: 0.9em; opacity: 0.9;">
            Version ${newVersion} instalada correctamente
        </div>
    `;

    if (!document.querySelector('#update-notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'update-notification-styles';
        styles.textContent = `
            @keyframes slideInFromTop {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            @keyframes fadeOut {
                from {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.5s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 4000);
}

export async function forceAppUpdate() {
    logger.info('Version Manager: Forcing app update...');

    const forceUpdateBtn = document.getElementById('force-update-btn');

    try {
        if (forceUpdateBtn) {
            forceUpdateBtn.classList.add('updating');
            forceUpdateBtn.innerHTML = 'Actualizando...';
            forceUpdateBtn.disabled = true;
        }

        const inProgressSession = loadInProgressSession();
        if (inProgressSession) {
            localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(inProgressSession));
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (forceUpdateBtn) {
            forceUpdateBtn.classList.remove('updating');
            forceUpdateBtn.classList.add('success');
            forceUpdateBtn.innerHTML = 'Listo';
        }

        await new Promise((resolve) => setTimeout(resolve, 800));

        await clearBrowserCaches();
        window.location.reload(true);
    } catch (error) {
        logger.error('Version Manager: Error during forced update:', error);

        if (forceUpdateBtn) {
            forceUpdateBtn.classList.remove('updating', 'success');
            forceUpdateBtn.classList.add('error');
            forceUpdateBtn.innerHTML = 'Error';
            forceUpdateBtn.disabled = false;

            setTimeout(() => {
                forceUpdateBtn.classList.remove('error');
                forceUpdateBtn.innerHTML = 'Actualizar';
            }, 3000);
        }

        setTimeout(() => {
            window.location.reload();
        }, 4000);
    }
}

export async function getCurrentVersion() {
    return getCurrentVersionFromManifest();
}

export function checkForBackupSession() {
    const backupSession = localStorage.getItem(BACKUP_SESSION_KEY);
    if (!backupSession) {
        return false;
    }

    try {
        const sessionData = JSON.parse(backupSession);
        const restored = restoreSessionSnapshot(sessionData);
        localStorage.removeItem(BACKUP_SESSION_KEY);

        if (restored) {
            logger.info('Version Manager: Backup session restored on app start');
        }

        return restored;
    } catch (error) {
        logger.error('Version Manager: Error restoring backup session:', error);
        localStorage.removeItem(BACKUP_SESSION_KEY);
        return false;
    }
}

