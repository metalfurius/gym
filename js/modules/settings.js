/**
 * Settings modal module
 * Manages the settings modal, cache information display, and cache clearing
 */

import { logger } from '../utils/logger.js';
import { toast } from '../utils/notifications.js';
import { storageManager } from '../storage-manager.js';
import { formatDate } from '../ui.js';
import { firebaseUsageTracker } from '../utils/firebase-usage-tracker.js';
import { t } from '../i18n.js';

// DOM Elements
let settingsBtn = null;
let settingsModal = null;
let settingsModalCloseBtn = null;
let clearCacheBtn = null;
let resetFirebaseUsageBtn = null;
let cacheInfoContainer = null;

let isInitialized = false;
let handleWindowClick = null;
let handleFirebaseUsageUpdated = null;

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

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
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
        const firebaseUsage = firebaseUsageTracker.getSummary();
        
        let html = '<div class="cache-stats">';
        
        // Exercise cache stats
        html += `
            <div class="cache-stat-item">
                <span class="cache-stat-label">${t('settings.cache_stat_exercise_count')}</span>
                <span class="cache-stat-value">${cacheStats.exerciseCount}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">${t('settings.cache_stat_total_entries')}</span>
                <span class="cache-stat-value">${cacheStats.totalEntries}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">${t('settings.cache_stat_size')}</span>
                <span class="cache-stat-value">${formatBytes(cacheStats.cacheSize)}</span>
            </div>
        `;
        
        if (cacheStats.newestEntry) {
            html += `
                <div class="cache-stat-item">
                    <span class="cache-stat-label">${t('settings.cache_stat_last_update')}</span>
                    <span class="cache-stat-value">${formatDate(cacheStats.newestEntry)}</span>
                </div>
            `;
        }
        
        if (cacheStats.oldestEntry) {
            const daysOfHistory = Math.floor((Date.now() - cacheStats.oldestEntry.getTime()) / (1000 * 60 * 60 * 24));
            html += `
                <div class="cache-stat-item">
                    <span class="cache-stat-label">${t('settings.cache_stat_history_days')}</span>
                    <span class="cache-stat-value">${daysOfHistory} ${t('common.days')}</span>
                </div>
            `;
        }
        
        // Storage API stats
        if (storageEstimate) {
            html += `
                <hr class="cache-divider">
                <div class="cache-stat-item">
                    <span class="cache-stat-label">${t('settings.cache_stat_storage_used')}</span>
                    <span class="cache-stat-value">${formatBytes(storageEstimate.usage)}</span>
                </div>
                <div class="cache-stat-item">
                    <span class="cache-stat-label">${t('settings.cache_stat_storage_quota')}</span>
                    <span class="cache-stat-value">${formatBytes(storageEstimate.quota)}</span>
                </div>
                <div class="cache-stat-item">
                    <span class="cache-stat-label">${t('settings.cache_stat_storage_usage')}</span>
                    <span class="cache-stat-value">${storageEstimate.usagePercentage}%</span>
                </div>
            `;
        }

        html += `
            <hr class="cache-divider">
            <div class="cache-stat-item">
                <span class="cache-stat-label">${t('settings.cache_stat_reads')}</span>
                <span class="cache-stat-value">${firebaseUsage.reads}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">${t('settings.cache_stat_writes')}</span>
                <span class="cache-stat-value">${firebaseUsage.writes}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">${t('settings.cache_stat_duration')}</span>
                <span class="cache-stat-value">${formatDuration(firebaseUsage.sessionDurationMs)}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">${t('settings.cache_stat_cost')}</span>
                <span class="cache-stat-value">$${firebaseUsage.estimatedCostUsd.toFixed(4)}</span>
            </div>
        `;

        if (firebaseUsage.topOperations.length > 0) {
            html += `<div class="firebase-usage-list"><strong>${t('settings.cache_stat_expensive_ops')}</strong><ul>`;
            firebaseUsage.topOperations.forEach((operation) => {
                html += `<li>${operation.type} - ${operation.operation}: ${operation.total}</li>`;
            });
            html += '</ul></div>';
        }
        
        html += '</div>';
        
        cacheInfoContainer.innerHTML = html;
    } catch (error) {
        logger.error('Error loading cache info:', error);
        if (cacheInfoContainer) {
            cacheInfoContainer.innerHTML = `<p class="error-text">${t('settings.cache_info_error')}</p>`;
        }
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
    const confirmMessage = t('settings.clear_cache_confirm');
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const { exerciseCache } = await import('../exercise-cache.js');
        exerciseCache.clearCache();
        
        // Reload cache info to show empty state
        await loadCacheInfo();
        
        toast.success(t('settings.cache_cleared'));
    } catch (error) {
        logger.error('Error clearing cache:', error);
        toast.error(t('settings.cache_clear_error'));
    }
}

export function resetFirebaseUsageMetrics() {
    firebaseUsageTracker.reset();
    loadCacheInfo();
    toast.success(t('settings.firebase_metrics_reset'));
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
    resetFirebaseUsageBtn = document.getElementById('reset-firebase-usage-btn');
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
        handleWindowClick = (event) => {
            if (event.target === settingsModal) {
                hideSettingsModal();
            }
        };
        window.addEventListener('click', handleWindowClick);
    }

    // Clear cache button event listener
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', clearExerciseCache);
    }

    if (resetFirebaseUsageBtn) {
        resetFirebaseUsageBtn.addEventListener('click', resetFirebaseUsageMetrics);
    }

    handleFirebaseUsageUpdated = () => {
        if (settingsModal && settingsModal.style.display === 'block') {
            loadCacheInfo();
        }
    };
    window.addEventListener('firebaseUsageUpdated', handleFirebaseUsageUpdated);

    isInitialized = true;
    logger.debug('Settings module initialized');
}

/**
 * Cleans up settings functionality
 */
export function destroySettings() {
    if (!isInitialized) {
        settingsBtn = null;
        settingsModal = null;
        settingsModalCloseBtn = null;
        clearCacheBtn = null;
        resetFirebaseUsageBtn = null;
        cacheInfoContainer = null;
        handleWindowClick = null;
        handleFirebaseUsageUpdated = null;
        return;
    }

    if (settingsBtn) {
        settingsBtn.removeEventListener('click', showSettingsModal);
    }
    if (settingsModalCloseBtn) {
        settingsModalCloseBtn.removeEventListener('click', hideSettingsModal);
    }
    if (clearCacheBtn) {
        clearCacheBtn.removeEventListener('click', clearExerciseCache);
    }
    if (resetFirebaseUsageBtn) {
        resetFirebaseUsageBtn.removeEventListener('click', resetFirebaseUsageMetrics);
    }
    if (handleWindowClick) {
        window.removeEventListener('click', handleWindowClick);
    }
    if (handleFirebaseUsageUpdated) {
        window.removeEventListener('firebaseUsageUpdated', handleFirebaseUsageUpdated);
    }

    settingsBtn = null;
    settingsModal = null;
    settingsModalCloseBtn = null;
    clearCacheBtn = null;
    resetFirebaseUsageBtn = null;
    cacheInfoContainer = null;
    handleWindowClick = null;
    handleFirebaseUsageUpdated = null;
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


