/**
 * Toast notification system
 * Provides user-friendly notifications to replace alert() calls
 */

// Notification types
export const NOTIFICATION_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

// Default durations in milliseconds
const DEFAULT_DURATIONS = {
    [NOTIFICATION_TYPES.SUCCESS]: 3000,
    [NOTIFICATION_TYPES.ERROR]: 5000,
    [NOTIFICATION_TYPES.WARNING]: 4000,
    [NOTIFICATION_TYPES.INFO]: 3000
};

// Icons for each notification type
const NOTIFICATION_ICONS = {
    [NOTIFICATION_TYPES.SUCCESS]: '✅',
    [NOTIFICATION_TYPES.ERROR]: '❌',
    [NOTIFICATION_TYPES.WARNING]: '⚠️',
    [NOTIFICATION_TYPES.INFO]: 'ℹ️'
};

let notificationContainer = null;
let notificationQueue = [];

/**
 * Initialize the notification container
 */
function ensureContainer() {
    if (notificationContainer && document.body.contains(notificationContainer)) {
        return notificationContainer;
    }

    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.className = 'notification-container';
    notificationContainer.setAttribute('aria-live', 'polite');
    notificationContainer.setAttribute('aria-atomic', 'true');
    
    // Add styles if not already present
    if (!document.getElementById('notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
                pointer-events: none;
            }
            
            .notification {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 14px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                background: var(--card-bg, #ffffff);
                color: var(--text-color, #333);
                font-size: 14px;
                line-height: 1.4;
                pointer-events: auto;
                transform: translateX(120%);
                opacity: 0;
                transition: transform 0.3s ease, opacity 0.3s ease;
            }
            
            .notification.show {
                transform: translateX(0);
                opacity: 1;
            }
            
            .notification.hiding {
                transform: translateX(120%);
                opacity: 0;
            }
            
            .notification-icon {
                font-size: 18px;
                flex-shrink: 0;
            }
            
            .notification-content {
                flex: 1;
            }
            
            .notification-message {
                margin: 0;
                word-wrap: break-word;
            }
            
            .notification-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                margin: -4px -4px -4px 8px;
                opacity: 0.6;
                transition: opacity 0.2s;
                color: inherit;
            }
            
            .notification-close:hover {
                opacity: 1;
            }
            
            .notification.success {
                border-left: 4px solid #10b981;
                background: linear-gradient(90deg, rgba(16, 185, 129, 0.1) 0%, var(--card-bg, #ffffff) 100%);
            }
            
            .notification.error {
                border-left: 4px solid #ef4444;
                background: linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, var(--card-bg, #ffffff) 100%);
            }
            
            .notification.warning {
                border-left: 4px solid #f59e0b;
                background: linear-gradient(90deg, rgba(245, 158, 11, 0.1) 0%, var(--card-bg, #ffffff) 100%);
            }
            
            .notification.info {
                border-left: 4px solid #3b82f6;
                background: linear-gradient(90deg, rgba(59, 130, 246, 0.1) 0%, var(--card-bg, #ffffff) 100%);
            }
            
            @media (max-width: 480px) {
                .notification-container {
                    top: 10px;
                    right: 10px;
                    left: 10px;
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(notificationContainer);
    return notificationContainer;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The notification type (success, error, warning, info)
 * @param {Object} options - Additional options
 * @param {number} options.duration - Duration in ms (0 for persistent)
 * @param {boolean} options.closable - Whether to show close button (default true)
 * @returns {HTMLElement} The notification element
 */
export function showNotification(message, type = NOTIFICATION_TYPES.INFO, options = {}) {
    const container = ensureContainer();
    const duration = options.duration ?? DEFAULT_DURATIONS[type] ?? 3000;
    const closable = options.closable ?? true;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.setAttribute('role', 'alert');

    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.textContent = NOTIFICATION_ICONS[type] || 'ℹ️';
    notification.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'notification-content';
    
    const messageEl = document.createElement('p');
    messageEl.className = 'notification-message';
    messageEl.textContent = message;
    content.appendChild(messageEl);
    
    notification.appendChild(content);

    if (closable) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.innerHTML = '×';
        closeBtn.setAttribute('aria-label', 'Cerrar notificación');
        closeBtn.addEventListener('click', () => hideNotification(notification));
        notification.appendChild(closeBtn);
    }

    container.appendChild(notification);

    // Trigger animation
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    // Auto-hide after duration
    if (duration > 0) {
        setTimeout(() => hideNotification(notification), duration);
    }

    return notification;
}

/**
 * Hide a notification with animation
 * @param {HTMLElement} notification - The notification element to hide
 */
export function hideNotification(notification) {
    if (!notification || !notification.parentNode) return;

    notification.classList.remove('show');
    notification.classList.add('hiding');

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 300);
}

/**
 * Clear all notifications
 */
export function clearAllNotifications() {
    if (notificationContainer) {
        const notifications = notificationContainer.querySelectorAll('.notification');
        notifications.forEach(n => hideNotification(n));
    }
}

// Convenience methods
export const toast = {
    /**
     * Show a success notification
     * @param {string} message - The message to display
     * @param {Object} options - Additional options
     */
    success: (message, options = {}) => 
        showNotification(message, NOTIFICATION_TYPES.SUCCESS, options),

    /**
     * Show an error notification
     * @param {string} message - The message to display
     * @param {Object} options - Additional options
     */
    error: (message, options = {}) => 
        showNotification(message, NOTIFICATION_TYPES.ERROR, options),

    /**
     * Show a warning notification
     * @param {string} message - The message to display
     * @param {Object} options - Additional options
     */
    warning: (message, options = {}) => 
        showNotification(message, NOTIFICATION_TYPES.WARNING, options),

    /**
     * Show an info notification
     * @param {string} message - The message to display
     * @param {Object} options - Additional options
     */
    info: (message, options = {}) => 
        showNotification(message, NOTIFICATION_TYPES.INFO, options),

    /**
     * Clear all notifications
     */
    clear: clearAllNotifications
};

export default toast;
