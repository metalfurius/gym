/**
 * My Workout Tracker - Main Application
 * This is the main orchestrator that imports and initializes all modules
 */

import { db } from './firebase-config.js';
import { collection, addDoc, Timestamp, query, orderBy, where, getDoc, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getCurrentUser, handleLogout } from './auth.js';
import {
    showView, formatDate, populateDaySelector,
    renderManageRoutinesView, renderRoutineEditor, renderSessionView, addExerciseToEditorForm,
    views, navButtons, dashboardElements, sessionElements, historyElements, sessionDetailModal,
    manageRoutinesElements, routineEditorElements, progressElements, showLoading, hideLoading,
    hideSessionDetail, registerViewInitializer
} from './ui.js';
import { storageManager } from './storage-manager.js';
import { initVersionControl, checkForBackupSession, forceAppUpdate, getCurrentVersion } from './version-manager.js';
import ThemeManager from './theme-manager.js';
import { initializeProgressView, loadExerciseList, updateChart, resetProgressView, handleExerciseChange } from './progress.js';
import {
    initI18n,
    setLanguage,
    getLanguage,
    onLanguageChange,
    t
} from './i18n.js';

// Import new modules
import { logger } from './utils/logger.js';
import { toast } from './utils/notifications.js';
import { offlineManager } from './utils/offline-manager.js';
import { addViewListener, cleanupViewListeners } from './utils/event-manager.js';
import { localFirstCache } from './utils/local-first-cache.js';
import { firebaseUsageTracker } from './utils/firebase-usage-tracker.js';
import { normalizeExecutionMode } from './utils/execution-mode.js';
import { normalizeLoadType } from './utils/load-type.js';
import { serializeRoutinesForCache, deserializeRoutinesFromCache } from './utils/firestore-serialization.js';
import {
    computeDailyHubState,
    getWeeklyConsistencyWindowStartDate,
    normalizeWeeklyTargetDays,
    WEEKLY_STREAK_LOOKBACK_WEEKS,
    WEEKLY_TARGET_DEFAULT,
    toDatetimeLocalValue
} from './utils/quick-log.js';
import { initScrollToTop } from './modules/scroll-to-top.js';
import { initSettings } from './modules/settings.js';
import { initCalendar, updateCalendarView, hideCalendar } from './modules/calendar.js';
import { 
    setCurrentRoutineForSession,
    saveSessionData,
    saveQuickLogEntry,
    checkAndOfferResumeSession,
    startSession,
    cancelSession,
    setupSessionAutoSave,
    getCurrentRoutineForSession,
    getSessionFormData
} from './modules/session-manager.js';
import {
    initHistoryManager,
    fetchAndRenderHistory,
    getSessionsCache,
    invalidateHistoryCache
} from './modules/history-manager.js';

// Conditional loading of firebase diagnostics
let diagnosticsLoaded = false;
export async function loadFirebaseDiagnostics() {
    if (diagnosticsLoaded) return;
    try {
        await import('./firebase-diagnostics.js');
        diagnosticsLoaded = true;
        logger.info('Firebase diagnostics loaded due to connection issues');
    } catch (error) {
        logger.warn('Could not load firebase diagnostics:', error);
    }
}

// Initialize theme manager
let themeManager = null;

// State
let currentUserRoutines = [];
const ROUTINES_CACHE_TTL_MS = 10 * 60 * 1000;
const DAILY_HUB_CACHE_TTL_MS = 30 * 1000;
const USER_PREFERENCES_CACHE_TTL_MS = 10 * 60 * 1000;
let dailyHubSessionsCache = [];
let dailyHubLastFetchTimestamp = 0;
let dailyHubCacheUserId = null;
let weeklyTargetDays = WEEKLY_TARGET_DEFAULT;
let weeklyTargetCacheUserId = null;
let weeklyTargetLastFetchTimestamp = 0;

function getWeeklyTargetSelectElement() {
    return document.getElementById('weekly-target-days-select');
}

function getWeeklyTargetSaveButtonElement() {
    return document.getElementById('weekly-target-save-btn');
}

function getUserPreferencesDocRef(userId) {
    return doc(db, 'users', userId, 'app_data', 'user_preferences');
}

function getUserPreferencesCacheKey(userId) {
    return `user-preferences:${userId}`;
}

function applyWeeklyTargetControlValue(value) {
    const weeklyTargetSelectElement = getWeeklyTargetSelectElement();
    if (!weeklyTargetSelectElement) return;

    weeklyTargetSelectElement.value = `${normalizeWeeklyTargetDays(value, WEEKLY_TARGET_DEFAULT)}`;
}

async function cacheWeeklyTargetDays(userId, targetDays, updatedAtIso = new Date().toISOString()) {
    await localFirstCache.set(getUserPreferencesCacheKey(userId), {
        weeklyTargetDays: normalizeWeeklyTargetDays(targetDays, WEEKLY_TARGET_DEFAULT),
        updatedAtIso
    }, {
        metadata: { source: 'preferences' }
    });
}

async function readWeeklyTargetFromCache(userId) {
    try {
        const cachedEntry = await localFirstCache.getEntry(getUserPreferencesCacheKey(userId));
        const cachedTarget = cachedEntry?.value?.weeklyTargetDays;
        if (cachedTarget === undefined || cachedTarget === null) {
            return null;
        }

        return normalizeWeeklyTargetDays(cachedTarget, WEEKLY_TARGET_DEFAULT);
    } catch (error) {
        logger.warn('Could not read cached weekly target:', error);
        return null;
    }
}

async function persistWeeklyTargetPreference(userId, targetDays, updatedAtIso = new Date().toISOString()) {
    const normalizedTargetDays = normalizeWeeklyTargetDays(targetDays, WEEKLY_TARGET_DEFAULT);
    const updatedAtDate = new Date(updatedAtIso);
    const safeUpdatedAtDate = Number.isNaN(updatedAtDate.getTime()) ? new Date() : updatedAtDate;

    await setDoc(getUserPreferencesDocRef(userId), {
        weeklyTargetDays: normalizedTargetDays,
        schemaVersion: 1,
        updatedAt: Timestamp.fromDate(safeUpdatedAtDate)
    }, { merge: true });
    firebaseUsageTracker.trackWrite(1, 'preferences.weeklyTarget.save');

    await cacheWeeklyTargetDays(userId, normalizedTargetDays, safeUpdatedAtDate.toISOString());

    weeklyTargetDays = normalizedTargetDays;
    weeklyTargetCacheUserId = userId;
    weeklyTargetLastFetchTimestamp = Date.now();
    applyWeeklyTargetControlValue(normalizedTargetDays);
}

async function fetchWeeklyTargetPreference(user, options = {}) {
    if (!user) {
        weeklyTargetDays = WEEKLY_TARGET_DEFAULT;
        weeklyTargetCacheUserId = null;
        weeklyTargetLastFetchTimestamp = 0;
        applyWeeklyTargetControlValue(weeklyTargetDays);
        return weeklyTargetDays;
    }

    if (weeklyTargetCacheUserId !== user.uid) {
        weeklyTargetCacheUserId = user.uid;
        weeklyTargetDays = WEEKLY_TARGET_DEFAULT;
        weeklyTargetLastFetchTimestamp = 0;
    }

    const forceRefresh = options.forceRefresh === true;
    const hasFreshMemoryValue = !forceRefresh
        && weeklyTargetCacheUserId === user.uid
        && (Date.now() - weeklyTargetLastFetchTimestamp) <= USER_PREFERENCES_CACHE_TTL_MS;

    if (hasFreshMemoryValue) {
        applyWeeklyTargetControlValue(weeklyTargetDays);
        return weeklyTargetDays;
    }

    if (!offlineManager.checkOnline()) {
        const cachedValue = await readWeeklyTargetFromCache(user.uid);
        if (cachedValue !== null) {
            weeklyTargetDays = cachedValue;
            weeklyTargetLastFetchTimestamp = Date.now();
            applyWeeklyTargetControlValue(weeklyTargetDays);
            return weeklyTargetDays;
        }

        applyWeeklyTargetControlValue(weeklyTargetDays);
        return weeklyTargetDays;
    }

    try {
        const docSnap = await getDoc(getUserPreferencesDocRef(user.uid));
        firebaseUsageTracker.trackRead(docSnap.exists() ? 1 : 0, 'preferences.weeklyTarget.read');

        const nextWeeklyTargetDays = docSnap.exists()
            ? normalizeWeeklyTargetDays(docSnap.data()?.weeklyTargetDays, WEEKLY_TARGET_DEFAULT)
            : (await readWeeklyTargetFromCache(user.uid)) ?? WEEKLY_TARGET_DEFAULT;

        weeklyTargetDays = nextWeeklyTargetDays;
        weeklyTargetLastFetchTimestamp = Date.now();
        applyWeeklyTargetControlValue(weeklyTargetDays);

        await cacheWeeklyTargetDays(user.uid, weeklyTargetDays);
        return weeklyTargetDays;
    } catch (error) {
        logger.warn('Could not load weekly target preference:', error);
        const cachedValue = await readWeeklyTargetFromCache(user.uid);
        if (cachedValue !== null) {
            weeklyTargetDays = cachedValue;
            weeklyTargetLastFetchTimestamp = Date.now();
        }

        applyWeeklyTargetControlValue(weeklyTargetDays);
        return weeklyTargetDays;
    }
}

function buildWeeklyTargetQueuePayload(userId, targetDays) {
    return {
        userId,
        weeklyTargetDays: normalizeWeeklyTargetDays(targetDays, WEEKLY_TARGET_DEFAULT),
        updatedAtIso: new Date().toISOString()
    };
}

async function saveWeeklyTargetPreference(targetDaysValue, options = {}) {
    const user = getCurrentUser();
    if (!user) {
        toast.error(t('settings.weekly_goal_requires_login'));
        return { ok: false, reason: 'unauthenticated' };
    }

    const normalizedTargetDays = normalizeWeeklyTargetDays(targetDaysValue, WEEKLY_TARGET_DEFAULT);
    const triggerButton = options.triggerButton || null;

    showLoading(triggerButton, t('common.saving'));

    try {
        await offlineManager.executeWithOfflineHandling(
            async () => {
                await persistWeeklyTargetPreference(user.uid, normalizedTargetDays);
            },
            t('settings.weekly_goal_save_offline'),
            true,
            {
                type: 'preferences.saveWeeklyTarget',
                payload: buildWeeklyTargetQueuePayload(user.uid, normalizedTargetDays)
            }
        );

        await refreshDailyHub(user, { forceRefresh: true });
        toast.success(t('settings.weekly_goal_saved'));
        return { ok: true, queued: false };
    } catch (error) {
        const wasQueued = error.message?.startsWith('Offline:') || offlineManager.isNetworkError(error);
        if (wasQueued) {
            weeklyTargetDays = normalizedTargetDays;
            weeklyTargetCacheUserId = user.uid;
            weeklyTargetLastFetchTimestamp = Date.now();
            applyWeeklyTargetControlValue(weeklyTargetDays);
            await cacheWeeklyTargetDays(user.uid, weeklyTargetDays);
            await refreshDailyHub(user, { forceRefresh: true });

            toast.info(t('settings.weekly_goal_saved_queued'));
            return { ok: true, queued: true };
        }

        logger.error('Error saving weekly target preference:', error);
        toast.error(t('settings.weekly_goal_save_error'));
        return { ok: false, reason: 'error', error };
    } finally {
        hideLoading(triggerButton);
    }
}

function setupWeeklyTargetSettingsControls() {
    const weeklyTargetSelectElement = getWeeklyTargetSelectElement();
    const weeklyTargetSaveButtonElement = getWeeklyTargetSaveButtonElement();

    if (!weeklyTargetSelectElement || !weeklyTargetSaveButtonElement) {
        return;
    }

    applyWeeklyTargetControlValue(weeklyTargetDays);

    weeklyTargetSaveButtonElement.addEventListener('click', async () => {
        await saveWeeklyTargetPreference(weeklyTargetSelectElement.value, {
            triggerButton: weeklyTargetSaveButtonElement
        });
    });
}

function getLanguageSelectElement() {
    return document.getElementById('language-select');
}

function setupLanguageSelector() {
    const languageSelectElement = getLanguageSelectElement();
    if (!languageSelectElement) return;

    languageSelectElement.value = getLanguage();
    languageSelectElement.addEventListener('change', (event) => {
        const selectedLanguage = event.target?.value || 'es';
        setLanguage(selectedLanguage);
    });
}

function getRoutineEditorDraftSnapshot() {
    const routineId = routineEditorElements.routineIdInput?.value || '';
    const routineName = routineEditorElements.routineNameInput?.value || '';
    const exerciseEditors = routineEditorElements.exercisesContainer?.querySelectorAll('.routine-exercise-editor') || [];

    const exercises = Array.from(exerciseEditors).map((editor) => {
        const type = editor.querySelector('select[name="ex-type"]')?.value || 'strength';
        const draft = {
            name: editor.querySelector('input[name="ex-name"]')?.value || '',
            type,
            notes: editor.querySelector('textarea[name="ex-notes"]')?.value || ''
        };

        if (type === 'strength') {
            draft.sets = editor.querySelector('input[name="ex-sets"]')?.value || '';
            draft.reps = editor.querySelector('input[name="ex-reps"]')?.value || '';
            draft.executionMode = normalizeExecutionMode(
                editor.querySelector('select[name="ex-execution-mode"]')?.value
            );
            draft.loadType = normalizeLoadType(
                editor.querySelector('select[name="ex-load-type"]')?.value
            );
        } else {
            draft.duration = editor.querySelector('input[name="ex-duration"]')?.value || '';
        }

        return draft;
    });

    return {
        routineId,
        routineName,
        exercises
    };
}

function refreshRoutineEditorForLanguage() {
    const draftSnapshot = getRoutineEditorDraftSnapshot();
    const isEditingExistingRoutine = Boolean(draftSnapshot.routineId);

    renderRoutineEditor({
        id: isEditingExistingRoutine ? draftSnapshot.routineId : '__draft__',
        name: draftSnapshot.routineName,
        exercises: draftSnapshot.exercises
    });

    if (!isEditingExistingRoutine) {
        routineEditorElements.title.textContent = t('routines.editor_create_title');
        routineEditorElements.routineIdInput.value = '';
        routineEditorElements.deleteRoutineBtn.classList.add('hidden');
        delete routineEditorElements.deleteRoutineBtn.dataset.routineId;
    }

    routineEditorElements.routineNameInput.value = draftSnapshot.routineName;
}

async function refreshVisibleViewForLanguage(user) {
    if (!views.dashboard.classList.contains('hidden')) {
        const selectedRoutineId = dashboardElements.daySelect?.value || '';
        populateDaySelector(currentUserRoutines);

        const hasSelectedRoutine = Boolean(selectedRoutineId)
            && Array.from(dashboardElements.daySelect?.options || [])
                .some((option) => option.value === selectedRoutineId);

        if (hasSelectedRoutine && dashboardElements.daySelect) {
            dashboardElements.daySelect.value = selectedRoutineId;
            if (dashboardElements.startSessionBtn) {
                dashboardElements.startSessionBtn.disabled = false;
            }
        }

        checkAndOfferResumeSession(currentUserRoutines);

        await refreshDailyHub(user).catch((error) => {
            logger.warn('Could not refresh daily hub after language change:', error);
        });
    }

    if (!views.manageRoutines.classList.contains('hidden')) {
        renderManageRoutinesView(currentUserRoutines);
    }

    if (!views.history.classList.contains('hidden')) {
        await fetchAndRenderHistory();
    }

    if (!views.progress.classList.contains('hidden')) {
        await loadExerciseList();
        await updateChart();
    }

    if (!views.session.classList.contains('hidden')) {
        const routine = getCurrentRoutineForSession();
        if (routine) {
            const snapshot = getSessionFormData({ includeEmptyExercises: true });
            await renderSessionView(routine, snapshot);
        }
    }

    if (!views.routineEditor.classList.contains('hidden')) {
        refreshRoutineEditorForLanguage();
    }
}

function setQuickLogDateTimeToNow() {
    if (dashboardElements.quickLogDateTimeInput) {
        dashboardElements.quickLogDateTimeInput.value = toDatetimeLocalValue(new Date());
    }
}

function getQuickLogFormPayload() {
    return {
        label: dashboardElements.quickLogLabelInput?.value || '',
        dateTime: dashboardElements.quickLogDateTimeInput?.value || '',
        notesText: dashboardElements.quickLogNotesInput?.value || ''
    };
}

function applyDailyHubState(state) {
    if (dashboardElements.dailyHubMonthCount) {
        const monthCount = Number.isFinite(state.logsMonthCount)
            ? state.logsMonthCount
            : (state.logsTodayCount || 0);
        dashboardElements.dailyHubMonthCount.textContent = `${monthCount}`;
    }

    if (dashboardElements.dailyHubLastWorkout) {
        dashboardElements.dailyHubLastWorkout.textContent = state.lastWorkoutLabel;
    }

    if (dashboardElements.dailyHubRoutineShortcut) {
        dashboardElements.dailyHubRoutineShortcut.textContent = state.routineShortcut;
    }

    if (dashboardElements.dailyHubSyncStatus) {
        dashboardElements.dailyHubSyncStatus.textContent = state.syncStatus;
        const syncClass = state.syncClass || 'sync-online';

        dashboardElements.dailyHubSyncStatus.classList.remove('sync-online', 'sync-offline', 'sync-queued');
        dashboardElements.dailyHubSyncStatus.classList.add(syncClass);
    }

    if (dashboardElements.dailyHubWeeklyProgress) {
        dashboardElements.dailyHubWeeklyProgress.textContent = t('dashboard.weekly_progress_value', {
            days: state.weeklyProgressDays ?? 0,
            target: state.weeklyTargetDays ?? WEEKLY_TARGET_DEFAULT
        });
        dashboardElements.dailyHubWeeklyProgress.classList.toggle('progress-met', state.weeklyProgressMet === true);
    }

    if (dashboardElements.dailyHubCurrentStreak) {
        dashboardElements.dailyHubCurrentStreak.textContent = `${state.currentWeeklyStreak ?? 0}`;
    }

    if (dashboardElements.dailyHubBestStreak) {
        dashboardElements.dailyHubBestStreak.textContent = `${state.bestWeeklyStreak ?? 0}`;
    }

    if (dashboardElements.dailyHubEmptyState) {
        dashboardElements.dailyHubEmptyState.classList.toggle('hidden', !state.isEmpty);
    }
}

async function fetchRecentSessionsForDailyHub(user, options = {}) {
    if (!user) {
        return [];
    }

    if (dailyHubCacheUserId !== user.uid) {
        dailyHubCacheUserId = user.uid;
        dailyHubSessionsCache = [];
        dailyHubLastFetchTimestamp = 0;
    }

    const forceRefresh = options.forceRefresh === true;
    const hasFreshCache = dailyHubSessionsCache.length > 0
        && (Date.now() - dailyHubLastFetchTimestamp) <= DAILY_HUB_CACHE_TTL_MS;

    if (!forceRefresh && hasFreshCache) {
        return dailyHubSessionsCache;
    }

    const historySessionsCache = getSessionsCache();
    if (!offlineManager.checkOnline()) {
        if (historySessionsCache.length > 0) {
            return historySessionsCache;
        }

        return dailyHubSessionsCache;
    }

    try {
        const sessionsCollectionRef = collection(db, 'users', user.uid, 'sesiones_entrenamiento');
        const now = new Date();
        const windowStart = getWeeklyConsistencyWindowStartDate(now, WEEKLY_STREAK_LOOKBACK_WEEKS);
        const dailyHubQuery = query(
            sessionsCollectionRef,
            where('fecha', '>=', Timestamp.fromDate(windowStart)),
            orderBy('fecha', 'desc')
        );
        const querySnapshot = await getDocs(dailyHubQuery);
        firebaseUsageTracker.trackRead(querySnapshot.docs.length || 1, 'dashboard.dailyHub');

        dailyHubSessionsCache = querySnapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }));
        dailyHubLastFetchTimestamp = Date.now();

        return dailyHubSessionsCache;
    } catch (error) {
        logger.warn('Could not refresh daily hub sessions:', error);
        if (historySessionsCache.length > 0) {
            return historySessionsCache;
        }

        return dailyHubSessionsCache;
    }
}

async function refreshDailyHub(user, options = {}) {
    const hasDailyHubElements =
        dashboardElements.dailyHubMonthCount
        && dashboardElements.dailyHubLastWorkout
        && dashboardElements.dailyHubRoutineShortcut
        && dashboardElements.dailyHubSyncStatus
        && dashboardElements.dailyHubWeeklyProgress
        && dashboardElements.dailyHubCurrentStreak
        && dashboardElements.dailyHubBestStreak;

    if (!hasDailyHubElements) {
        return;
    }

    const sessions = user
        ? await fetchRecentSessionsForDailyHub(user, options)
        : [];
    const state = computeDailyHubState({
        sessions,
        routines: currentUserRoutines,
        selectedRoutineId: dashboardElements.daySelect?.value || '',
        now: new Date(),
        weeklyTargetDays,
        isOnline: offlineManager.checkOnline(),
        pendingCount: offlineManager.getPendingCount()
    });

    applyDailyHubState(state);
}

// --- App Initialization triggered by Auth ---
export async function initializeAppAfterAuth(user) {
    if (user) {
        // ThemeManager should already be initialized by DOMContentLoaded listener.
        // This is a fallback in case auth resolves before DOM is ready (rare edge case).
        if (!themeManager) {
            try {
                themeManager = new ThemeManager();
                logger.info('Theme manager initialized (auth fallback)');
            } catch (error) {
                logger.error('Theme manager initialization failed:', error);
            }
        }
        
        dashboardElements.currentDate.textContent = formatDate(new Date());
        await fetchUserRoutines(user);
        await fetchWeeklyTargetPreference(user, { forceRefresh: true });
        setQuickLogDateTimeToNow();
        await refreshDailyHub(user, { forceRefresh: true });
        
        // Initialize exercise cache
        await initializeExerciseCache(user);
        
        // Initialize progress view
        initializeProgressView();

        // Process any queued durable operations that were waiting for auth context.
        offlineManager.processPendingOperations().catch((error) => {
            logger.warn('Could not process pending offline operations after auth:', error);
        });
        
        checkAndOfferResumeSession(currentUserRoutines);
        
        // Initialize calendar with current month - with small delay to ensure DOM ready
        setTimeout(() => {
            updateCalendarView();
        }, 100);
    } else {
        setCurrentRoutineForSession(null);
        currentUserRoutines = [];
        populateDaySelector([]);
        sessionElements.form.reset();
        historyElements.list.innerHTML = `<li id="history-loading">${t('history.loading', { default: t('common.loading') })}</li>`;
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
        manageRoutinesElements.list.innerHTML = `<li id="routines-loading">${t('routines.loading', { default: t('common.loading') })}</li>`;
        hideCalendar();
        dailyHubCacheUserId = null;
        dailyHubSessionsCache = [];
        dailyHubLastFetchTimestamp = 0;
        weeklyTargetDays = WEEKLY_TARGET_DEFAULT;
        weeklyTargetCacheUserId = null;
        weeklyTargetLastFetchTimestamp = 0;
        applyWeeklyTargetControlValue(weeklyTargetDays);
        setQuickLogDateTimeToNow();
        applyDailyHubState(computeDailyHubState({
            sessions: [],
            routines: [],
            now: new Date(),
            weeklyTargetDays,
            isOnline: offlineManager.checkOnline(),
            pendingCount: offlineManager.getPendingCount()
        }));
    }
}

// Initializes exercise cache for the user
async function initializeExerciseCache(user) {
    if (!user) return;
    
    try {
        const { exerciseCache } = await import('./exercise-cache.js');
        
        // Clean old entries
        exerciseCache.cleanOldEntries();
        
        // Verify and rebuild cache automatically if necessary
        const wasRebuilt = await exerciseCache.validateAndRebuildCache(user.uid, db);
        
        if (!wasRebuilt) {
            // If not rebuilt, try to restore from Firebase backup if local cache is empty
            const stats = exerciseCache.getCacheStats();
            
            if (stats.exerciseCount === 0) {
                const restored = await exerciseCache.restoreFromFirebase(user.uid, db);
                
                if (!restored) {
                    // If no Firebase backup, build cache from existing history
                    await exerciseCache.buildCacheFromHistory(user.uid, db);
                }
            }
        }
        
        // Sync with Firebase in background (without blocking)
        exerciseCache.syncWithFirebase(user.uid, db).catch(error => {
            logger.warn('Error in initial cache sync:', error);
        });
        
    } catch (error) {
        logger.error('Error initializing exercise cache:', error);
    }
}

async function refreshUserRoutinesFromFirestore(user) {
    const cacheKey = `routines:${user.uid}`;
    const routinesCollectionRef = collection(db, 'users', user.uid, 'routines');
    const q = query(routinesCollectionRef, orderBy('createdAt', 'asc'));

    const querySnapshot = await getDocs(q);
    firebaseUsageTracker.trackRead(querySnapshot.docs.length || 1, 'routines.fetch');
    currentUserRoutines = querySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    populateDaySelector(currentUserRoutines);

    await localFirstCache.set(cacheKey, serializeRoutinesForCache(currentUserRoutines), {
        metadata: { source: 'firestore' }
    });

    if (!views.manageRoutines.classList.contains('hidden')) {
        renderManageRoutinesView(currentUserRoutines);
    }
}

async function fetchUserRoutines(user, options = {}) {
    if (!user) {
        currentUserRoutines = [];
        populateDaySelector([]);
        return;
    }

    const forceRefresh = options.forceRefresh === true;
    const cacheKey = `routines:${user.uid}`;
    let hasRenderedFromCache = false;

    if (!forceRefresh) {
        try {
            const cachedEntry = await localFirstCache.getEntry(cacheKey);
            if (cachedEntry?.value && Array.isArray(cachedEntry.value)) {
                const cachedRoutines = deserializeRoutinesFromCache(cachedEntry.value);

                currentUserRoutines = cachedRoutines;
                populateDaySelector(currentUserRoutines);
                hasRenderedFromCache = true;

                if (!views.manageRoutines.classList.contains('hidden')) {
                    renderManageRoutinesView(currentUserRoutines);
                }

                if (localFirstCache.isFresh(cachedEntry, ROUTINES_CACHE_TTL_MS)) {
                    await refreshDailyHub(user).catch((refreshError) => {
                        logger.warn('Could not refresh daily hub from cached routines:', refreshError);
                    });
                    return;
                }
            }
        } catch (cacheError) {
            logger.warn('Could not read routines cache:', cacheError);
        }
    }

    try {
        await offlineManager.executeWithOfflineHandling(
            async () => refreshUserRoutinesFromFirestore(user),
            t('routines.fetch_offline'),
            true,
            {
                type: 'routines.fetch',
                payload: {
                    userId: user.uid
                }
            }
        );
    } catch (error) {
        logger.error('Error fetching user routines:', error);

        if (!hasRenderedFromCache) {
            currentUserRoutines = [];
            populateDaySelector([]);
        }

        if (!error.message?.startsWith('Offline:')
            && (error.message?.includes('Failed to fetch') || error.message?.includes('ERR_BLOCKED_BY_CLIENT'))) {
            loadFirebaseDiagnostics();
        }
    }

    await refreshDailyHub(user).catch((refreshError) => {
        logger.warn('Could not refresh daily hub after routines fetch:', refreshError);
    });
}

offlineManager.registerOperationHandler('routines.fetch', async (payload) => {
    if (!payload?.userId) {
        throw new Error('Invalid queued routines.fetch payload');
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
        throw new Error('User not ready for routines fetch replay');
    }

    if (currentUser.uid !== payload.userId) {
        logger.warn('Dropping queued routines.fetch for a different user');
        return;
    }

    await refreshUserRoutinesFromFirestore(currentUser);
});

offlineManager.registerOperationHandler('preferences.saveWeeklyTarget', async (payload) => {
    if (!payload?.userId) {
        throw new Error('Invalid queued preferences.saveWeeklyTarget payload');
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
        throw new Error('User not ready for weekly target replay');
    }

    if (currentUser.uid !== payload.userId) {
        logger.warn('Dropping queued weekly target update for a different user');
        return;
    }

    await persistWeeklyTargetPreference(
        payload.userId,
        payload.weeklyTargetDays,
        payload.updatedAtIso
    );
    await refreshDailyHub(currentUser, { forceRefresh: true });
});

// --- View-specific listener setup ---

function setupDashboardViewListeners() {
    cleanupViewListeners('dashboard');

    // Ensure calendar navigation handlers are attached for this view
    initCalendar();
    if (dashboardElements.quickLogDateTimeInput && !dashboardElements.quickLogDateTimeInput.value) {
        setQuickLogDateTimeToNow();
    }

    if (dashboardElements.daySelect) {
        addViewListener('dashboard', dashboardElements.daySelect, 'change', () => {
            if (dashboardElements.startSessionBtn) {
                dashboardElements.startSessionBtn.disabled = !dashboardElements.daySelect.value;
            }

            refreshDailyHub(getCurrentUser()).catch((error) => {
                logger.warn('Could not refresh daily hub after routine selection change:', error);
            });
        });
    } else {
        logger.error('Dashboard day select element not found');
    }

    if (dashboardElements.manageRoutinesLinkBtn) {
        addViewListener('dashboard', dashboardElements.manageRoutinesLinkBtn, 'click', () => {
            navButtons.manageRoutines?.click();
        });
    } else {
        logger.error('Manage routines link button not found');
    }

    if (dashboardElements.startSessionBtn) {
        addViewListener('dashboard', dashboardElements.startSessionBtn, 'click', () => {
            const selectedRoutineId = dashboardElements.daySelect?.value;
            if (selectedRoutineId) {
                startSession(selectedRoutineId, currentUserRoutines);
            }
        });
    } else {
        logger.error('Start session button not found');
    }

    if (dashboardElements.quickLogForm) {
        addViewListener('dashboard', dashboardElements.quickLogForm, 'submit', async (event) => {
            event.preventDefault();

            const result = await saveQuickLogEntry(
                getQuickLogFormPayload(),
                () => {
                    invalidateHistoryCache();
                    fetchAndRenderHistory();
                },
                {
                    triggerButton: dashboardElements.quickLogSaveBtn
                }
            );

            if (result.ok && !result.queued && dashboardElements.quickLogNotesInput) {
                dashboardElements.quickLogNotesInput.value = '';
                setQuickLogDateTimeToNow();
            }

            await refreshDailyHub(getCurrentUser(), { forceRefresh: true });
        });
    } else {
        logger.warn('Quick log form not found for dashboard listeners.');
    }

    refreshDailyHub(getCurrentUser()).catch((error) => {
        logger.warn('Could not refresh daily hub while entering dashboard view:', error);
    });
}

function setupSessionViewListeners() {
    cleanupViewListeners('session');

    if (sessionElements.saveBtn) {
        addViewListener('session', sessionElements.saveBtn, 'click', () => {
            saveSessionData(() => {
                invalidateHistoryCache();
                fetchAndRenderHistory();
                refreshDailyHub(getCurrentUser(), { forceRefresh: true }).catch((error) => {
                    logger.warn('Could not refresh daily hub after session save:', error);
                });
            });
        });
    } else {
        logger.error('Session save button not found');
    }

    if (sessionElements.cancelBtn) {
        addViewListener('session', sessionElements.cancelBtn, 'click', cancelSession);
    } else {
        logger.error('Session cancel button not found');
    }
}

function setupManageRoutinesViewListeners() {
    cleanupViewListeners('manageRoutines');

    if (manageRoutinesElements.addNewBtn) {
        addViewListener('manageRoutines', manageRoutinesElements.addNewBtn, 'click', () => {
            renderRoutineEditor(null);
        });
    } else {
        logger.error('Add new routine button not found');
    }

    if (manageRoutinesElements.exportRoutinesBtn) {
        addViewListener('manageRoutines', manageRoutinesElements.exportRoutinesBtn, 'click', async () => {
            const user = getCurrentUser();
            if (!user) {
                toast.error(t('routines.action_requires_login'));
                return;
            }

            if (!confirm(t('routines.export_confirm'))) {
                return;
            }

            showLoading(manageRoutinesElements.exportRoutinesBtn, t('routines.export_loading'));
            try {
                if (currentUserRoutines.length === 0) {
                    toast.warning(t('routines.export_empty'));
                    return;
                }

                const exportData = {
                    exportDate: new Date().toISOString(),
                    totalRoutines: currentUserRoutines.length,
                    routines: currentUserRoutines.map(routine => ({
                        id: routine.id,
                        name: routine.name,
                        exercises: routine.exercises,
                        createdAt: routine.createdAt?.toDate?.()?.toISOString() || null,
                        updatedAt: routine.updatedAt?.toDate?.()?.toISOString() || null
                    }))
                };

                const jsonString = JSON.stringify(exportData, null, 2);
                await navigator.clipboard.writeText(jsonString);
                toast.success(t('routines.export_success', { count: currentUserRoutines.length }));
                
            } catch (error) {
                logger.error('Error exporting routines:', error);
                if (error.name === 'NotAllowedError') {
                    toast.error(t('routines.export_error_clipboard'));
                } else {
                    toast.error(t('routines.export_error'));
                }
            } finally {
                hideLoading(manageRoutinesElements.exportRoutinesBtn);
            }
        });
    } else {
        logger.error('Export routines button not found for attaching event listener.');
    }

    if (manageRoutinesElements.deleteAllRoutinesBtn) {
        addViewListener('manageRoutines', manageRoutinesElements.deleteAllRoutinesBtn, 'click', async () => {
            const user = getCurrentUser();
            if (!user) {
                toast.error(t('routines.action_requires_login'));
                return;
            }

            if (currentUserRoutines.length === 0) {
                toast.warning(t('routines.delete_all_empty'));
                return;
            }

            const confirmMessage = t('routines.delete_all_confirm', { count: currentUserRoutines.length });
            
            if (!confirm(confirmMessage)) {
                return;
            }

            const expectedKeyword = t('routines.delete_all_prompt_keyword');
            const finalConfirm = prompt(t('routines.delete_all_prompt'));
            if (finalConfirm !== expectedKeyword) {
                toast.info(t('routines.delete_all_cancelled'));
                return;
            }

            showLoading(manageRoutinesElements.deleteAllRoutinesBtn, t('routines.delete_all_loading'));
            try {
                const batch = writeBatch(db);
                let routinesDeletedCount = 0;

                for (const routine of currentUserRoutines) {
                    const routineDocRef = doc(db, 'users', user.uid, 'routines', routine.id);
                    batch.delete(routineDocRef);
                    routinesDeletedCount++;
                }

                if (routinesDeletedCount > 0) {
                    await batch.commit();
                    firebaseUsageTracker.trackWrite(routinesDeletedCount, 'routines.deleteAll');
                    toast.success(t('routines.delete_all_success', { count: routinesDeletedCount }));
                    
                    await fetchUserRoutines(user, { forceRefresh: true });
                    if (!views.manageRoutines.classList.contains('hidden')) {
                        renderManageRoutinesView(currentUserRoutines);
                    }
                }
            } catch (error) {
                logger.error('Error deleting all routines:', error);
                toast.error(t('routines.delete_all_error'));
                if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                    loadFirebaseDiagnostics();
                }
            } finally {
                hideLoading(manageRoutinesElements.deleteAllRoutinesBtn);
            }
        });
    } else {
        logger.error('Delete all routines button not found for attaching event listener.');
    }
}

function setupRoutineEditorViewListeners() {
    cleanupViewListeners('routineEditor');

    if (routineEditorElements.addExerciseBtn) {
        addViewListener('routineEditor', routineEditorElements.addExerciseBtn, 'click', () => {
            addExerciseToEditorForm(null);
        });
    }

    if (routineEditorElements.form) {
        addViewListener('routineEditor', routineEditorElements.form, 'submit', async (event) => {
            event.preventDefault();
            const user = getCurrentUser();
            if (!user) {
                toast.error(t('routines.save_requires_login'));
                return;
            }

            const routineId = routineEditorElements.routineIdInput.value;
            const routineName = routineEditorElements.routineNameInput.value.trim();
            if (!routineName) {
                toast.warning(t('routines.name_required'));
                return;
            }

            const exercises = [];
            const exerciseEditors = routineEditorElements.exercisesContainer.querySelectorAll('.routine-exercise-editor');
            exerciseEditors.forEach(editor => {
                const name = editor.querySelector('input[name="ex-name"]').value.trim();
                const type = editor.querySelector('select[name="ex-type"]').value;
                const executionModeInput = editor.querySelector('select[name="ex-execution-mode"]');
                const loadTypeInput = editor.querySelector('select[name="ex-load-type"]');
                const notes = editor.querySelector('textarea[name="ex-notes"]').value.trim();
                let sets = '', reps = '', duration = '';
                let executionMode = null;
                let loadType = null;

                if (type === 'strength') {
                    sets = parseInt(editor.querySelector('input[name="ex-sets"]').value) || 0;
                    reps = editor.querySelector('input[name="ex-reps"]').value.trim();
                    executionMode = normalizeExecutionMode(executionModeInput?.value);
                    loadType = normalizeLoadType(loadTypeInput?.value);
                } else if (type === 'cardio') {
                    duration = editor.querySelector('input[name="ex-duration"]').value.trim();
                }
                if (name) {
                    const exerciseData = { name, type, sets, reps, duration, notes };
                    if (type === 'strength') {
                        exerciseData.executionMode = executionMode;
                        exerciseData.loadType = loadType;
                    }
                    exercises.push(exerciseData);
                }
            });

            if (exercises.length === 0) {
                toast.warning(t('routines.exercises_required'));
                return;
            }

            const routineData = {
                name: routineName,
                exercises: exercises,
                updatedAt: Timestamp.now()
            };

            showLoading(routineEditorElements.saveRoutineBtn, t('routines.save_loading'));
            try {
                if (routineId) {
                    await setDoc(doc(db, 'users', user.uid, 'routines', routineId), routineData, { merge: true });
                    firebaseUsageTracker.trackWrite(1, 'routines.update');
                } else {
                    routineData.createdAt = Timestamp.now();
                    await addDoc(collection(db, 'users', user.uid, 'routines'), routineData);
                    firebaseUsageTracker.trackWrite(1, 'routines.create');
                }
                toast.success(t('routines.save_success'));
                await fetchUserRoutines(user, { forceRefresh: true });
                showView('manageRoutines');
                renderManageRoutinesView(currentUserRoutines);
            } catch (error) {
                logger.error('Error saving routine:', error);
                toast.error(t('routines.save_error'));
                if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                    loadFirebaseDiagnostics();
                }
            } finally {
                hideLoading(routineEditorElements.saveRoutineBtn);
            }
        });
    }

    if (routineEditorElements.cancelEditRoutineBtn) {
        addViewListener('routineEditor', routineEditorElements.cancelEditRoutineBtn, 'click', () => {
            if (confirm(t('routines.cancel_edit_confirm'))) {
                showView('manageRoutines');
            }
        });
    }

    if (routineEditorElements.deleteRoutineBtn) {
        addViewListener('routineEditor', routineEditorElements.deleteRoutineBtn, 'click', async () => {
            const routineId = routineEditorElements.deleteRoutineBtn.dataset.routineId;
            const user = getCurrentUser();
            if (!routineId || !user) return;

            const routineToDelete = currentUserRoutines.find(r => r.id === routineId);
            if (!routineToDelete) {
                toast.error(t('routines.not_found'));
                return;
            }

            if (confirm(t('routines.delete_confirm', { name: routineToDelete.name }))) {
                showLoading(routineEditorElements.deleteRoutineBtn, t('routines.delete_loading'));
                try {
                    await deleteDoc(doc(db, 'users', user.uid, 'routines', routineId));
                    firebaseUsageTracker.trackWrite(1, 'routines.deleteOne');
                    toast.success(t('routines.delete_success'));
                    await fetchUserRoutines(user, { forceRefresh: true });
                    showView('manageRoutines');
                    renderManageRoutinesView(currentUserRoutines);
                } catch (error) {
                    logger.error('Error deleting routine:', error);
                    toast.error(t('routines.delete_error'));
                    if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                        loadFirebaseDiagnostics();
                    }
                } finally {
                    hideLoading(routineEditorElements.deleteRoutineBtn);
                }
            }
        });
    }
}

function setupHistoryViewListeners() {
    // Ensure clean slate for history listeners
    cleanupViewListeners('history');
    initHistoryManager();
}

function setupProgressViewListeners() {
    cleanupViewListeners('progress');
    
    // Add event listeners using the event manager
    if (progressElements.exerciseSelect) {
        addViewListener('progress', progressElements.exerciseSelect, 'change', handleExerciseChange);
    }
    
    if (progressElements.metricSelect) {
        addViewListener('progress', progressElements.metricSelect, 'change', updateChart);
    }
    
    if (progressElements.periodSelect) {
        addViewListener('progress', progressElements.periodSelect, 'change', updateChart);
    }
}

// Register view initializers so they run whenever a view is shown
registerViewInitializer('dashboard', setupDashboardViewListeners);
registerViewInitializer('session', setupSessionViewListeners);
registerViewInitializer('manageRoutines', setupManageRoutinesViewListeners);
registerViewInitializer('routineEditor', setupRoutineEditorViewListeners);
registerViewInitializer('history', setupHistoryViewListeners);
registerViewInitializer('progress', setupProgressViewListeners);

// --- Event Listeners ---

// Navigation
navButtons.dashboard.addEventListener('click', () => {
    showView('dashboard');
    const currentUser = getCurrentUser();
    fetchUserRoutines(currentUser);
    checkAndOfferResumeSession(currentUserRoutines);
    updateCalendarView();
    refreshDailyHub(currentUser, { forceRefresh: true }).catch((error) => {
        logger.warn('Could not refresh daily hub on dashboard navigation:', error);
    });
});
navButtons.manageRoutines.addEventListener('click', () => {
    showView('manageRoutines');
    renderManageRoutinesView(currentUserRoutines);
});
navButtons.history.addEventListener('click', () => {
    showView('history');
    fetchAndRenderHistory();
});
navButtons.progress.addEventListener('click', () => {
    showView('progress');
    loadProgressData();
});
navButtons.logout.addEventListener('click', handleLogout);

offlineManager.addListener(() => {
    refreshDailyHub(getCurrentUser(), { forceRefresh: true }).catch((error) => {
        logger.warn('Could not refresh daily hub after connectivity change:', error);
    });
});

// Set up auto-save for session form
setupSessionAutoSave();

// Session detail modal
if (sessionDetailModal.closeBtn) {
    sessionDetailModal.closeBtn.addEventListener('click', hideSessionDetail);
} else {
    logger.error('Session detail modal close button not found');
}

if (sessionDetailModal.modal) {
    window.addEventListener('click', (event) => {
        if (event.target === sessionDetailModal.modal) hideSessionDetail();
    });
} else {
    logger.error('Session detail modal not found');
}

// Event listener for edit clicks bubbled up from ui.js
document.addEventListener('editRoutineClicked', (event) => {
    const routineId = event.detail.routineId;
    const routineToEdit = currentUserRoutines.find(r => r.id === routineId);
    if (routineToEdit) {
        renderRoutineEditor(routineToEdit);
    } else {
        toast.error(t('routines.edit_not_found'));
    }
});

// Manage Routines - duplicate listener removed (already exists above)


// PWA Service Worker and Storage Manager Initialization
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        // Initialize version control first - this handles app updates and cache management
        try {
            const versionResult = await initVersionControl();
            logger.info('Version control initialized:', versionResult);
            
            // Check for backup session that might need restoration after update
            checkForBackupSession();
        } catch (error) {
            logger.error('Version control initialization failed:', error);
        }

        // Initialize modern storage management
        try {
            await storageManager.initialize();
        } catch (error) {
            logger.error('Storage manager initialization failed:', error);
        }

        // Use a relative path that works regardless of deployment location
        const swPath = new URL('sw.js', window.location.href).pathname;
        navigator.serviceWorker.register(swPath)
            .then(reg => logger.info('ServiceWorker registered.', reg))
            .catch(err => {
                logger.error('ServiceWorker registration failed:', err);
                if (err.name === 'TypeError' && err.message.includes('Failed to register') && err.message.includes('404')) {
                    logger.warn('This may be due to a missing service worker file or an ad blocker.');
                }
            });
    });
    
    // Add an error handler for Firestore connection errors
    window.addEventListener('error', function(event) {
        const errorText = event.message || '';
        if (errorText.includes('ERR_BLOCKED_BY_CLIENT') || 
            (event.filename && event.filename.includes('firestore.googleapis.com'))) {
            logger.warn('Detected possible content blocker interfering with Firebase connections. ' +
                        'This may affect app functionality.');
            loadFirebaseDiagnostics();
        }
    });
}

// --- Version Management UI ---
const versionInfoElement = document.getElementById('app-version-info');
const forceUpdateBtn = document.getElementById('force-update-btn');

if (versionInfoElement) {
    (async () => {
        try {
            const version = await getCurrentVersion();
            versionInfoElement.textContent = `v${version}`;
        } catch (error) {
            logger.error('Error getting version for UI:', error);
            versionInfoElement.textContent = 'v1.0.2';
        }
    })();
}

if (forceUpdateBtn) {
    forceUpdateBtn.addEventListener('click', async () => {
        if (confirm(t('version.force_update_confirm'))) {
            await forceAppUpdate();
        }
    });
}

// SINGLE POINT OF INITIALIZATION for ThemeManager
document.addEventListener('DOMContentLoaded', () => {
    initI18n({ persist: true, apply: true });
    setupLanguageSelector();

    onLanguageChange(() => {
        const languageSelectElement = getLanguageSelectElement();
        if (languageSelectElement) {
            languageSelectElement.value = getLanguage();
        }

        const currentUser = getCurrentUser();
        if (currentUser && dashboardElements.currentDate) {
            dashboardElements.currentDate.textContent = formatDate(new Date());
        }

        refreshVisibleViewForLanguage(currentUser).catch((error) => {
            logger.warn('Could not refresh visible views after language change:', error);
        });
    });

    if (!themeManager) {
        try {
            themeManager = new ThemeManager();
            logger.info('Theme manager initialized');
        } catch (error) {
            logger.error('Theme manager initialization failed:', error);
        }
    }
    
    // Initialize offline detection
    offlineManager.init();

    // Initialize local-first cache store in the background
    localFirstCache.initialize().catch((error) => {
        logger.warn('Local cache initialization failed:', error);
    });
    
    // Initialize modules
    initScrollToTop();
    initSettings();
    setupWeeklyTargetSettingsControls();
});

showView('auth');

// --- Progress Functions ---

/**
 * Loads data for the progress view
 */
async function loadProgressData() {
    try {
        await loadExerciseList();
    } catch (error) {
        logger.error('Error loading progress data:', error);
        resetProgressView();
    }
}

// Export for module compatibility
export { currentUserRoutines, fetchUserRoutines };

