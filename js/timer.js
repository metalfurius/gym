// timer.js - Handles set rest timer functionality

// Store active timers by ID to access them easily
const activeTimers = {};

// Store rest times data for each set
const restTimesData = {};

// Storage key for timer data in localStorage
const TIMERS_STORAGE_KEY = 'gym-tracker-timer-data';

// Flag to track if timer event listener has been initialized
let isTimerInitialized = false;

// The event handler function (stored so we can reference it)
function handleTimerClick(event) {
    // Check if the clicked element is a timer button
    if (event.target.classList.contains('timer-button')) {
        const timerId = event.target.dataset.timerId;
        
        if (event.target.classList.contains('running')) {
            pauseTimer(timerId);
        } else {
            // Pause all other timers before starting this one
            pauseAllTimers();
            startTimer(timerId);
        }
    }
}

// Initialize the timer functionality
export function initSetTimers() {
    const exerciseList = document.getElementById('exercise-list');
    
    if (!exerciseList) {
        console.warn('Exercise list not found, cannot initialize timers');
        return;
    }
    
    // Only add the event listener once
    if (!isTimerInitialized) {
        // Listen for timer events on the exercise list container (delegation)
        exerciseList.addEventListener('click', handleTimerClick);
        isTimerInitialized = true;
    }
    
    // Restore timer values from localStorage if available
    restoreTimerValues();
}

// Get all rest times data for saving with the session
export function getRestTimesData() {
    // Create a copy to avoid reference issues
    const restTimes = {};
    
    // Convert all timer displays to the data object
    document.querySelectorAll('.set-timer').forEach(timerElement => {
        const timerId = timerElement.dataset.timerId;
        const timerDisplay = document.getElementById(`timer-display-${timerId}`);
        if (timerDisplay) {
            // Parse timerId to get exerciseIndex and setIndex
            const [exerciseIndex, setIndex] = timerId.split('-').map(Number);
            
            // Initialize exercise object if it doesn't exist
            if (!restTimes[exerciseIndex]) {
                restTimes[exerciseIndex] = {};
            }
            
            // Store the rest time for this specific set
            restTimes[exerciseIndex][setIndex] = timerDisplay.textContent;
        }
    });
    
    return restTimes;
}

// Start a specific timer
function startTimer(timerId) {
    const timerDisplay = document.getElementById(`timer-display-${timerId}`);
    const timerButton = document.getElementById(`timer-button-${timerId}`);
    
    if (!timerDisplay || !timerButton) return;
    
    // If timer already exists, clear it
    if (activeTimers[timerId]) {
        clearInterval(activeTimers[timerId].interval);
    }
    
    // Calculate seconds from current display
    const currentDisplay = timerDisplay.textContent;
    const parts = currentDisplay.split(':');
    let seconds = 0;
    
    if (parts.length === 2) {
        seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    
    const startTime = Date.now() - (seconds * 1000);
    
    // Set up the interval
    const interval = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const secs = elapsedSeconds % 60;
        const timeDisplay = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        timerDisplay.textContent = timeDisplay;
        
        // Save the timer state to localStorage
        saveTimerValue(timerId, timeDisplay, true);
    }, 1000);
    
    // Store the timer information
    activeTimers[timerId] = {
        interval,
        startTime,
        isRunning: true
    };
    
    // Update the button
    timerButton.textContent = 'Pausar';
    timerButton.classList.add('running');
    
    // Save initial timer state
    saveTimerValue(timerId, timerDisplay.textContent, true);
}

// Pause a specific timer
function pauseTimer(timerId) {
    const timerButton = document.getElementById(`timer-button-${timerId}`);
    const timerDisplay = document.getElementById(`timer-display-${timerId}`);
    
    if (!timerButton || !timerDisplay) return;
    
    // If timer exists and is running
    if (activeTimers[timerId] && activeTimers[timerId].isRunning) {
        clearInterval(activeTimers[timerId].interval);
        activeTimers[timerId].isRunning = false;
        
        // Update the button
        timerButton.textContent = 'Iniciar';
        timerButton.classList.remove('running');
        
        // Save the timer state as paused
        saveTimerValue(timerId, timerDisplay.textContent, false);
    }
}

// Pause all active timers
function pauseAllTimers() {
    // Get all running timers
    document.querySelectorAll('.timer-button.running').forEach(button => {
        const timerId = button.dataset.timerId;
        if (timerId) {
            pauseTimer(timerId);
        }
    });
}

// Save timer value to localStorage
function saveTimerValue(timerId, timeValue, isRunning) {
    // Get existing timer data
    let timerData = JSON.parse(localStorage.getItem(TIMERS_STORAGE_KEY) || '{}');
    
    // Update with new value
    if (!timerData.timers) timerData.timers = {};
    timerData.timers[timerId] = {
        value: timeValue,
        running: isRunning,
        timestamp: Date.now()
    };
    
    // Save back to localStorage
    localStorage.setItem(TIMERS_STORAGE_KEY, JSON.stringify(timerData));
}

// Restore timer values from localStorage
function restoreTimerValues() {
    try {
        // Get timer data from localStorage
        const timerData = JSON.parse(localStorage.getItem(TIMERS_STORAGE_KEY) || '{}');
        if (!timerData.timers) return;
        
        // Loop through saved timers
        Object.entries(timerData.timers).forEach(([timerId, data]) => {
            const timerDisplay = document.getElementById(`timer-display-${timerId}`);
            const timerButton = document.getElementById(`timer-button-${timerId}`);
            
            if (timerDisplay && timerButton) {
                // Restore timer display value
                timerDisplay.textContent = data.value;
                
                // Restart timer if it was running
                if (data.running) {
                    // Wait a moment to ensure DOM is ready
                    setTimeout(() => startTimer(timerId), 100);
                }
            }
        });
    } catch (error) {
        console.error('Error restoring timer values:', error);
    }
}

// Clear all timer data from localStorage
export function clearTimerData() {
    localStorage.removeItem(TIMERS_STORAGE_KEY);
    // Also clear any active timer intervals
    Object.keys(activeTimers).forEach(timerId => {
        if (activeTimers[timerId]?.interval) {
            clearInterval(activeTimers[timerId].interval);
        }
    });
    // Clear the activeTimers object
    Object.keys(activeTimers).forEach(key => delete activeTimers[key]);
}

// Reset timer initialization (useful for cleanup/testing)
export function resetTimerInitialization() {
    const exerciseList = document.getElementById('exercise-list');
    if (exerciseList && isTimerInitialized) {
        exerciseList.removeEventListener('click', handleTimerClick);
        isTimerInitialized = false;
    }
}

// Create HTML for a timer to add to each set
export function createTimerHTML(exerciseIndex, setIndex) {
    const timerId = `${exerciseIndex}-${setIndex}`;
    
    return `
        <div class="set-timer" data-timer-id="${timerId}">
            <div id="timer-display-${timerId}" class="timer-display">00:00</div>
            <button id="timer-button-${timerId}" class="timer-button" type="button" data-timer-id="${timerId}">Iniciar</button>
        </div>
    `;
}
