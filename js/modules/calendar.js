/**
 * Calendar module
 * Manages the activity calendar display, navigation, and data fetching
 */

import { db } from '../firebase-config.js';
import { collection, query, where, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser } from '../auth.js';
import { logger } from '../utils/logger.js';
import { debounce } from '../utils/debounce.js';
import { addViewListener } from '../utils/event-manager.js';

// Constants
const MIN_CALENDAR_YEAR = 2025;

// State
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth(); // 0-11 (enero-diciembre)
let isInitialized = false;

// DOM element references
let calendarContainer = null;
let calendarView = null;
let currentMonthDisplay = null;
let prevMonthBtn = null;
let nextMonthBtn = null;
let loadingSpinner = null;

/**
 * Converts a Firebase Timestamp to a local date string in YYYY-MM-DD format
 * Uses local timezone (avoids issues with toISOString which uses UTC)
 * @param {Timestamp} timestamp - Firebase timestamp
 * @returns {string|null} Date string in YYYY-MM-DD format or null
 */
function timestampToLocalDateString(timestamp) {
    if (!timestamp || !timestamp.toDate) return null;
    const localDate = timestamp.toDate();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Analyzes the type of workout in a session
 * @param {Object} session - The session object
 * @returns {string} 'strength', 'cardio', 'mixed', or 'none'
 */
function analyzeSessionType(session) {
    if (!session.ejercicios || session.ejercicios.length === 0) {
        return 'none';
    }
    
    let hasStrength = false;
    let hasCardio = false;
    
    session.ejercicios.forEach(ejercicio => {
        if (ejercicio.tipoEjercicio === 'strength') {
            hasStrength = true;
        } else if (ejercicio.tipoEjercicio === 'cardio') {
            hasCardio = true;
        }
    });
    
    if (hasStrength && hasCardio) {
        return 'mixed';
    } else if (hasCardio) {
        return 'cardio';
    } else if (hasStrength) {
        return 'strength';
    } else {
        return 'none';
    }
}

/**
 * Combines workout types when there are multiple sessions in a day
 * @param {string} type1 - First workout type
 * @param {string} type2 - Second workout type
 * @returns {string} Combined workout type
 */
function combineWorkoutTypes(type1, type2) {
    if (type1 === 'none') return type2;
    if (type2 === 'none') return type1;
    if (type1 === type2) return type1;
    
    // If there's a combination of different types, it's mixed
    return 'mixed';
}

/**
 * Gets the number of days in a given month
 * @param {number} year - The year
 * @param {number} month - The month (0-11)
 * @returns {number} Number of days in the month
 */
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * Fetches monthly activity data from Firestore
 * @param {string} userId - The user's ID
 * @param {number} year - The year to fetch
 * @param {number} month - The month to fetch (0-11)
 * @returns {Map} Map of date strings to activity info
 */
async function getMonthlyActivity(userId, year, month) {
    if (loadingSpinner) loadingSpinner.classList.remove('hidden');
    
    const activityMap = new Map(); // 'YYYY-MM-DD' -> { count, type }
    const startDate = new Date(year, month, 1); // First day of month
    const endDate = new Date(year, month + 1, 0, 23, 59, 59); // Last day of month

    try {
        const sessionsRef = collection(db, "users", userId, "sesiones_entrenamiento");
        const q = query(sessionsRef,
            where("fecha", ">=", Timestamp.fromDate(startDate)),
            where("fecha", "<=", Timestamp.fromDate(endDate))
        );
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach(docSnap => {
            const session = docSnap.data();
            if (session.fecha && session.fecha.toDate) {
                const dateString = timestampToLocalDateString(session.fecha);
                if (dateString) {
                    // Analyze workout type for this session
                    const sessionType = analyzeSessionType(session);
                    
                    const currentData = activityMap.get(dateString) || { count: 0, type: 'none' };
                    const newCount = currentData.count + 1;
                    
                    // Determine combined type for the day
                    let combinedType = sessionType;
                    if (currentData.count > 0) {
                        combinedType = combineWorkoutTypes(currentData.type, sessionType);
                    }
                    
                    activityMap.set(dateString, { count: newCount, type: combinedType });
                }
            }
        });
    } catch (error) {
        logger.error("Error fetching monthly activity:", error);
        // Show user-friendly error message
        if (calendarView) {
            calendarView.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #666;">Error al cargar la actividad del mes</div>';
        }
    } finally {
        if (loadingSpinner) loadingSpinner.classList.add('hidden');
    }
    return activityMap;
}

/**
 * Renders the activity calendar for a given month
 * @param {number} year - The year
 * @param {number} month - The month (0-11)
 * @param {Map} activityData - Map of date strings to activity info
 */
function renderActivityCalendar(year, month, activityData) {
    // Re-query calendar elements in case they weren't loaded initially
    if (!calendarView) calendarView = document.getElementById('activity-calendar');
    if (!currentMonthDisplay) currentMonthDisplay = document.getElementById('current-month-display');
    
    // Check if calendar elements exist before proceeding
    if (!calendarView || !currentMonthDisplay) {
        logger.error('Calendar elements not found. DOM might not be fully loaded.', {
            calendarView: !!calendarView,
            currentMonthDisplay: !!currentMonthDisplay
        });
        return;
    }
    
    calendarView.innerHTML = ''; // Clear previous calendar
    
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                       "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    currentMonthDisplay.textContent = `${monthNames[month]} ${year}`;

    // Add day headers
    const dayHeaders = ["L", "M", "X", "J", "V", "S", "D"];
    dayHeaders.forEach(dayHeader => {
        const headerCell = document.createElement('div');
        headerCell.classList.add('day-header');
        headerCell.textContent = dayHeader;
        calendarView.appendChild(headerCell);
    });

    const daysInCurrentMonth = getDaysInMonth(year, month);
    let firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 (Sunday) - 6 (Saturday)
    // Make Monday the first day (0) and Sunday the last (6)
    firstDayOfMonth = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;

    // Add empty cells to align the first day of the week (Monday)
    for (let i = 0; i < firstDayOfMonth; i++) {
        const placeholderCell = document.createElement('div');
        placeholderCell.classList.add('day-cell', 'is-placeholder');
        calendarView.appendChild(placeholderCell);
    }

    // Check if there's activity in the month
    const hasActivity = Array.from(activityData.values()).some(info => info.count > 0);

    // Add days of the month
    for (let day = 1; day <= daysInCurrentMonth; day++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell');
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const activityInfo = activityData.get(dateString) || { count: 0, type: 'none' };
        let activityLevel = 0;
        let activityTypeText = 'Sin actividad';
        
        if (activityInfo.count > 0) {
            switch (activityInfo.type) {
                case 'strength':
                    activityLevel = 1;
                    activityTypeText = 'Entrenamiento de fuerza';
                    break;
                case 'cardio':
                    activityLevel = 3;
                    activityTypeText = 'Entrenamiento de cardio';
                    break;
                case 'mixed':
                    activityLevel = 2;
                    activityTypeText = 'Entrenamiento mixto (fuerza + cardio)';
                    break;
                default:
                    activityLevel = 1;
                    activityTypeText = 'Entrenamiento';
            }
        }

        cell.classList.add(`level-${activityLevel}`);
        
        // Create informative tooltip
        const tooltipText = activityInfo.count > 0 
            ? `${dateString}: ${activityTypeText}${activityInfo.count > 1 ? ` (${activityInfo.count} sesiones)` : ''}`
            : `${dateString}: ${activityTypeText}`;
        cell.title = tooltipText;
        
        // Show day number in each cell
        cell.textContent = day;

        // Highlight current day
        const today = new Date();
        if (year === today.getFullYear() && 
            month === today.getMonth() && 
            day === today.getDate()) {
            cell.classList.add('is-today');
        }

        // Make clickable to filter history (future feature)
        cell.addEventListener('click', () => {
            if (activityInfo.count > 0) {
                logger.debug(`Show activity for ${dateString} - Type: ${activityInfo.type}`);
                // Could implement navigation to filtered history here
            }
        });

        calendarView.appendChild(cell);
    }

    // Show motivational message if no activity in current month
    if (!hasActivity && year === new Date().getFullYear() && month === new Date().getMonth()) {
        const motivationalMessage = document.createElement('div');
        motivationalMessage.style.cssText = `
            grid-column: 1 / -1; 
            text-align: center; 
            padding: 15px; 
            color: #666; 
            font-style: italic; 
            background-color: rgba(67, 97, 238, 0.05); 
            border-radius: 6px; 
            margin-top: 10px;
        `;
        motivationalMessage.textContent = '¡Comienza tu primer entrenamiento este mes! 💪';
        calendarView.appendChild(motivationalMessage);
    }
}

/**
 * Updates the calendar navigation button states
 */
function updateCalendarNavigation() {
    // Re-query navigation buttons if needed
    if (!prevMonthBtn) prevMonthBtn = document.getElementById('prev-month-btn');
    if (!nextMonthBtn) nextMonthBtn = document.getElementById('next-month-btn');
    
    if (!prevMonthBtn || !nextMonthBtn) {
        logger.warn('Calendar navigation buttons not found.');
        return;
    }
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Disable "prev" button if at minimum month/year
    const isAtMinimum = (currentCalendarYear === MIN_CALENDAR_YEAR && currentCalendarMonth === 0) ||
                       currentCalendarYear < MIN_CALENDAR_YEAR;
    
    // Disable "next" button if at current month/year
    const isAtMaximum = (currentCalendarYear === currentYear && currentCalendarMonth >= currentMonth) ||
                       currentCalendarYear > currentYear;
    
    prevMonthBtn.disabled = isAtMinimum;
    nextMonthBtn.disabled = isAtMaximum;
}

/**
 * Updates the calendar view with current month's data
 * This is the main function to refresh the calendar
 */
async function updateCalendarViewInternal() {
    const user = getCurrentUser();
    if (!user) {
        if (calendarContainer) calendarContainer.classList.add('hidden');
        return;
    }
    
    // Re-query calendar elements in case they weren't loaded initially
    if (!calendarContainer) calendarContainer = document.getElementById('activity-calendar-container');
    if (!calendarView) calendarView = document.getElementById('activity-calendar');
    if (!currentMonthDisplay) currentMonthDisplay = document.getElementById('current-month-display');
    if (!loadingSpinner) loadingSpinner = document.getElementById('calendar-loading-spinner');
    
    // Check if calendar elements exist before proceeding
    if (!calendarContainer || !calendarView || !currentMonthDisplay) {
        logger.error('Calendar elements not found. DOM might not be fully loaded.', {
            container: !!calendarContainer,
            calendarView: !!calendarView,
            currentMonthDisplay: !!currentMonthDisplay
        });
        return;
    }
    
    // Ensure we don't go below minimum year
    if (currentCalendarYear < MIN_CALENDAR_YEAR) {
        currentCalendarYear = MIN_CALENDAR_YEAR;
        currentCalendarMonth = 0; // January of minimum year
    }
    
    // Validate that we don't go to a future month
    const today = new Date();
    if (currentCalendarYear === today.getFullYear() && currentCalendarMonth > today.getMonth()) {
        currentCalendarMonth = today.getMonth();
    }
    
    calendarContainer.classList.remove('hidden');
    
    // Show loading state while fetching data
    if (loadingSpinner) {
        loadingSpinner.classList.remove('hidden');
    }
    
    const activity = await getMonthlyActivity(user.uid, currentCalendarYear, currentCalendarMonth);
    renderActivityCalendar(currentCalendarYear, currentCalendarMonth, activity);

    // Update navigation button states
    updateCalendarNavigation();
}

// Create debounced version of updateCalendarView to prevent rapid Firebase calls
const updateCalendarView = debounce(updateCalendarViewInternal, 300);

/**
 * Navigates to the previous month
 */
function navigateToPreviousMonth() {
    currentCalendarMonth--;
    if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    
    // Check limits
    if (currentCalendarYear < MIN_CALENDAR_YEAR) {
        currentCalendarYear = MIN_CALENDAR_YEAR;
        currentCalendarMonth = 0;
    }
    
    updateCalendarView();
}

/**
 * Navigates to the next month
 */
function navigateToNextMonth() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Don't allow going beyond current month
    if (currentCalendarYear < currentYear || 
        (currentCalendarYear === currentYear && currentCalendarMonth < currentMonth)) {
        currentCalendarMonth++;
        if (currentCalendarMonth > 11) {
            currentCalendarMonth = 0;
            currentCalendarYear++;
        }
        updateCalendarView();
    }
}

/**
 * Handles calendar navigation click events
 * @param {Event} event - The click event
 */
function handleCalendarNavigationClick(event) {
    if (event.target.id === 'prev-month-btn') {
        navigateToPreviousMonth();
    } else if (event.target.id === 'next-month-btn') {
        navigateToNextMonth();
    }
}

/**
 * Initializes the calendar module
 * Sets up DOM references and event listeners
 */
export function initCalendar() {
    // Get DOM elements
    calendarContainer = document.getElementById('activity-calendar-container');
    calendarView = document.getElementById('activity-calendar');
    currentMonthDisplay = document.getElementById('current-month-display');
    prevMonthBtn = document.getElementById('prev-month-btn');
    nextMonthBtn = document.getElementById('next-month-btn');
    loadingSpinner = document.getElementById('calendar-loading-spinner');

    // Set up event delegation for navigation
    // Only attach if not already initialized to avoid duplicate listeners
    if (!isInitialized) {
        addViewListener('dashboard', document, 'click', handleCalendarNavigationClick);
        isInitialized = true;
        logger.debug('Calendar module initialized');
    } else {
        logger.debug('Calendar DOM references refreshed');
    }
}

/**
 * Resets calendar to current month and updates the view
 */
export function resetToCurrentMonth() {
    const today = new Date();
    currentCalendarYear = today.getFullYear();
    currentCalendarMonth = today.getMonth();
    
    // Ensure not below minimum year
    if (currentCalendarYear < MIN_CALENDAR_YEAR) {
        currentCalendarYear = MIN_CALENDAR_YEAR;
        currentCalendarMonth = 0;
    }
    
    updateCalendarView();
}

/**
 * Cleans up calendar module
 */
export function destroyCalendar() {
    if (!isInitialized) return;

    // Note: Calendar listeners are managed by the dashboard view and cleaned up
    // when setupDashboardViewListeners is called. We don't need to clean them here
    // to avoid removing other dashboard listeners.
    
    // Reset state
    calendarContainer = null;
    calendarView = null;
    currentMonthDisplay = null;
    prevMonthBtn = null;
    nextMonthBtn = null;
    loadingSpinner = null;
    isInitialized = false;

    logger.debug('Calendar module destroyed');
}

/**
 * Gets the current calendar state
 * @returns {Object} Current year and month
 */
export function getCalendarState() {
    return {
        year: currentCalendarYear,
        month: currentCalendarMonth
    };
}

/**
 * Hides the calendar container
 */
export function hideCalendar() {
    if (!calendarContainer) {
        calendarContainer = document.getElementById('activity-calendar-container');
    }
    if (calendarContainer) {
        calendarContainer.classList.add('hidden');
    }
}

export {
    updateCalendarView,
    MIN_CALENDAR_YEAR
};

export default {
    init: initCalendar,
    destroy: destroyCalendar,
    update: updateCalendarView,
    resetToCurrentMonth,
    getState: getCalendarState,
    hide: hideCalendar,
    MIN_CALENDAR_YEAR
};
