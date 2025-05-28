
import { saveInProgressSession, loadInProgressSession, clearInProgressSession } from './store.js';

const VERSION_KEY = 'gym-tracker-version';
const BACKUP_SESSION_KEY = 'gym-tracker-backup-session';

/**
 * Obtiene la versión actual del manifest.json
 */
async function getCurrentVersionFromManifest() {
    try {
        const response = await fetch('./manifest.json');
        const manifest = await response.json();
        return manifest.version;
    } catch (error) {
        console.error('Version Manager: Error fetching version from manifest:', error);
        // Fallback a versión por defecto si no se puede obtener del manifest
        return '1.1.0';
    }
}

/**
 * Inicializa el control de versiones y maneja actualizaciones
 */
export async function initVersionControl() {
    const CURRENT_VERSION = await getCurrentVersionFromManifest();
    const storedVersion = localStorage.getItem(VERSION_KEY);
    
    console.log(`Version Manager: Current=${CURRENT_VERSION}, Stored=${storedVersion || 'none'}`);
    
    if (!storedVersion) {
        // Primera instalación
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
        console.log('Version Manager: First installation detected');
        return { isUpdate: false, isFirstInstall: true };
    }
    
    if (storedVersion !== CURRENT_VERSION) {
        // Hay una actualización
        console.log(`Version Manager: Update detected from ${storedVersion} to ${CURRENT_VERSION}`);
        await handleAppUpdate(storedVersion, CURRENT_VERSION);
        return { isUpdate: true, isFirstInstall: false, oldVersion: storedVersion };
    }
    
    // Sin cambios de versión
    return { isUpdate: false, isFirstInstall: false };
}

/**
 * Maneja el proceso de actualización de la aplicación
 */
async function handleAppUpdate(oldVersion, newVersion) {
    try {
        // 1. Preservar sesión en progreso si existe
        const inProgressSession = loadInProgressSession();
        if (inProgressSession) {
            console.log('Version Manager: Backing up in-progress session');
            localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(inProgressSession));
        }
        
        // 2. Mostrar notificación de actualización
        showUpdateNotification(oldVersion, newVersion);
        
        // 3. Limpiar cachés del navegador (pero no localStorage, ya que contiene datos importantes)
        await clearBrowserCaches();
        
        // 4. Actualizar la versión almacenada
        localStorage.setItem(VERSION_KEY, newVersion);
        
        // 5. Restaurar sesión en progreso si existía
        if (inProgressSession) {
            console.log('Version Manager: Restoring in-progress session');
            saveInProgressSession(inProgressSession);
            localStorage.removeItem(BACKUP_SESSION_KEY);
        }
        
        console.log('Version Manager: Update process completed successfully');
        
    } catch (error) {
        console.error('Version Manager: Error during update process:', error);
        // En caso de error, intentar restaurar sesión desde backup
        const backupSession = localStorage.getItem(BACKUP_SESSION_KEY);
        if (backupSession) {
            try {
                const sessionData = JSON.parse(backupSession);
                saveInProgressSession(sessionData);
                localStorage.removeItem(BACKUP_SESSION_KEY);
                console.log('Version Manager: Session restored from backup after error');
            } catch (restoreError) {
                console.error('Version Manager: Could not restore session from backup:', restoreError);
            }
        }
    }
}

/**
 * Limpia los cachés del navegador
 */
async function clearBrowserCaches() {
    try {
        // Limpiar Cache API si está disponible
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            const deletePromises = cacheNames
                .filter(name => name.startsWith('gym-tracker-'))
                .map(name => {
                    console.log(`Version Manager: Deleting cache: ${name}`);
                    return caches.delete(name);
                });
            await Promise.all(deletePromises);
        }
        
        // Forzar recarga del Service Worker
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.update();
            }
        }
        
        console.log('Version Manager: Browser caches cleared successfully');
    } catch (error) {
        console.error('Version Manager: Error clearing caches:', error);
    }
}

/**
 * Muestra una notificación de actualización al usuario
 */
function showUpdateNotification(oldVersion, newVersion) {
    // Crear el elemento de notificación
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
            <strong>🎉 ¡Aplicación Actualizada!</strong>
        </div>
        <div style="font-size: 0.9em; opacity: 0.9;">
            Versión ${newVersion} instalada correctamente
        </div>
    `;
    
    // Añadir animación CSS
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
    
    // Auto-remover después de 4 segundos
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.5s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 4000);
}

/**
 * Fuerza una actualización manual de la aplicación
 */
export async function forceAppUpdate() {
    console.log('Version Manager: Forcing app update...');
    
    const forceUpdateBtn = document.getElementById('force-update-btn');
    
    try {
        // Cambiar el botón a estado de actualización
        if (forceUpdateBtn) {
            forceUpdateBtn.classList.add('updating');
            forceUpdateBtn.innerHTML = '⏳ Actualizando...';
            forceUpdateBtn.disabled = true;
        }
        
        // Backup de sesión en progreso
        const inProgressSession = loadInProgressSession();
        if (inProgressSession) {
            localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(inProgressSession));
        }
        
        // Simular un pequeño delay para que el usuario vea el estado
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mostrar estado de éxito brevemente
        if (forceUpdateBtn) {
            forceUpdateBtn.classList.remove('updating');
            forceUpdateBtn.classList.add('success');
            forceUpdateBtn.innerHTML = '✅ ¡Listo!';
        }
        
        // Esperar un momento antes de limpiar cachés y recargar
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Limpiar todos los cachés
        await clearBrowserCaches();
        
        // Recargar la página
        window.location.reload(true);
        
    } catch (error) {
        console.error('Version Manager: Error during forced update:', error);
        
        // Mostrar estado de error
        if (forceUpdateBtn) {
            forceUpdateBtn.classList.remove('updating', 'success');
            forceUpdateBtn.classList.add('error');
            forceUpdateBtn.innerHTML = '❌ Error';
            forceUpdateBtn.disabled = false;
            
            // Resetear el botón después de 3 segundos
            setTimeout(() => {
                forceUpdateBtn.classList.remove('error');
                forceUpdateBtn.innerHTML = '🔄 Actualizar';
            }, 3000);
        }
        
        // Fallback: recargar página simple después de mostrar error
        setTimeout(() => {
            window.location.reload();
        }, 4000);
    }
}

/**
 * Obtiene la versión actual de la aplicación
 */
export async function getCurrentVersion() {
    return await getCurrentVersionFromManifest();
}

/**
 * Verifica si hay una sesión respaldada que necesita ser restaurada
 */
export function checkForBackupSession() {
    const backupSession = localStorage.getItem(BACKUP_SESSION_KEY);
    if (backupSession) {
        try {
            const sessionData = JSON.parse(backupSession);
            saveInProgressSession(sessionData);
            localStorage.removeItem(BACKUP_SESSION_KEY);
            console.log('Version Manager: Backup session restored on app start');
            return true;
        } catch (error) {
            console.error('Version Manager: Error restoring backup session:', error);
            localStorage.removeItem(BACKUP_SESSION_KEY);
            return false;
        }
    }
    return false;
}
