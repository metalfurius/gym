/**
 * Settings modal module
 * Manages the settings modal, cache information display, and cache clearing
 */

import { logger } from '../utils/logger.js';
import { toast } from '../utils/notifications.js';
import { storageManager } from '../storage-manager.js';
import { formatDate } from '../ui.js';

// DOM Elements
let settingsBtn = null;
let settingsModal = null;
let settingsModalCloseBtn = null;
let clearCacheBtn = null;
let cacheInfoContainer = null;

let isInitialized = false;

/**
 * Formats bytes to a human-readable string
 * @param {number} bytes - The number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Loads and displays cache information in the settings modal
 */
export async function loadCacheInfo() {
    if (!cacheInfoContainer) {
        cacheInfoContainer = document.getElementById('cache-info-container');
        if (!cacheInfoContainer) {
            logger.warn('Cache info container not found');
            return;
        }
    }

    try {
        const { exerciseCache } = await import('../exercise-cache.js');
        const cacheStats = exerciseCache.getCacheStats();
        const storageEstimate = await storageManager.getStorageEstimate();
        
        let html = '<div class="cache-stats">';
        
        // Exercise cache stats
        html += `
            <div class="cache-stat-item">
                <span class="cache-stat-label">Ejercicios en caché:</span>
                <span class="cache-stat-value">${cacheStats.exerciseCount}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">Total de registros:</span>
                <span class="cache-stat-value">${cacheStats.totalEntries}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">Tamaño del caché de ejercicios:</span>
                <span class="cache-stat-value">${formatBytes(cacheStats.cacheSize)}</span>
            </div>
        `;
        
        if (cacheStats.newestEntry) {
            html += `
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Última actualización:</span>
                    <span class="cache-stat-value">${formatDate(cacheStats.newestEntry)}</span>
                </div>
            `;
        }
        
        if (cacheStats.oldestEntry) {
            const daysOfHistory = Math.floor((Date.now() - cacheStats.oldestEntry.getTime()) / (1000 * 60 * 60 * 24));
            html += `
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Días de historial:</span>
                    <span class="cache-stat-value">${daysOfHistory} días</span>
                </div>
            `;
        }
        
        // Storage API stats
        if (storageEstimate) {
            html += `
                <hr class="cache-divider">
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Almacenamiento usado:</span>
                    <span class="cache-stat-value">${formatBytes(storageEstimate.usage)}</span>
                </div>
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Cuota disponible:</span>
                    <span class="cache-stat-value">${formatBytes(storageEstimate.quota)}</span>
                </div>
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Uso:</span>
                    <span class="cache-stat-value">${storageEstimate.usagePercentage}%</span>
                </div>
            `;
        }
        
        html += '</div>';
        
        cacheInfoContainer.innerHTML = html;
    } catch (error) {
        logger.error('Error loading cache info:', error);
        cacheInfoContainer.innerHTML = '<p class="error-text">Error al cargar la información del caché.</p>';
    }
}

/**
 * Shows the settings modal
 */
export function showSettingsModal() {
    if (!settingsModal) {
        settingsModal = document.getElementById('settings-modal');
    }
    
    if (settingsModal) {
        settingsModal.style.display = 'block';
        loadCacheInfo();
    }
}

/**
 * Hides the settings modal
 */
export function hideSettingsModal() {
    if (!settingsModal) {
        settingsModal = document.getElementById('settings-modal');
    }
    
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }
}

/**
 * Clears the exercise cache after user confirmation
 */
export async function clearExerciseCache() {
    const confirmMessage = '⚠️ ¿Estás seguro de que quieres eliminar el caché local?\n\nEsto borrará los datos de sugerencias de ejercicios guardados localmente. Los datos de tus sesiones en la nube no se verán afectados.\n\nEl caché se reconstruirá automáticamente la próxima vez que inicies sesión.';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const { exerciseCache } = await import('../exercise-cache.js');
        exerciseCache.clearCache();
        
        // Reload cache info to show empty state
        await loadCacheInfo();
        
        toast.success('Caché eliminado correctamente');
    } catch (error) {
        logger.error('Error clearing cache:', error);
        toast.error('Error al eliminar el caché');
    }
}

/**
 * Initializes the settings modal functionality
 * Sets up event listeners for opening/closing the modal and cache operations
 */
export function initSettings() {
    if (isInitialized) {
        logger.debug('Settings already initialized');
        return;
    }

    // Get DOM elements
    settingsBtn = document.getElementById('settings-btn');
    settingsModal = document.getElementById('settings-modal');
    settingsModalCloseBtn = document.querySelector('.settings-modal-close');
    clearCacheBtn = document.getElementById('clear-cache-btn');
    cacheInfoContainer = document.getElementById('cache-info-container');

    // Settings button event listener
    if (settingsBtn) {
        settingsBtn.addEventListener('click', showSettingsModal);
    } else {
        logger.warn('Settings button not found');
    }

    // Settings modal close button event listener
    if (settingsModalCloseBtn) {
        settingsModalCloseBtn.addEventListener('click', hideSettingsModal);
    }

    // Close settings modal when clicking outside
    if (settingsModal) {
        window.addEventListener('click', (event) => {
            if (event.target === settingsModal) {
                hideSettingsModal();
            }
        });
    }

    // Clear cache button event listener
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', clearExerciseCache);
    }

    isInitialized = true;
    logger.debug('Settings module initialized');
}

/**
 * Cleans up settings functionality
 */
export function destroySettings() {
    if (!isInitialized) return;

    // Remove event listeners would go here if we stored references
    // For now, just reset state
    settingsBtn = null;
    settingsModal = null;
    settingsModalCloseBtn = null;
    clearCacheBtn = null;
    cacheInfoContainer = null;
    isInitialized = false;

    logger.debug('Settings module destroyed');
}

export default {
    init: initSettings,
    destroy: destroySettings,
    show: showSettingsModal,
    hide: hideSettingsModal,
    loadCacheInfo,
    clearCache: clearExerciseCache,
    formatBytes
};
