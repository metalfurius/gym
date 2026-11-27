/**
 * My Workout Tracker - Main Application
 * This is the main orchestrator that imports and initializes all modules
 */

import { db } from './firebase-config.js';
import { collection, addDoc, Timestamp, query, orderBy, where, limit, getDoc, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getCurrentUser, handleLogout } from './auth.js';
import {
    showView, formatDate, populateDaySelector,
    renderManageRoutinesView, renderRoutineEditor, renderSessionView, addExerciseToEditorForm,
    views, navButtons, dashboardElements, sessionElements, historyElements, sessionDetailModal,
    manageRoutinesElements, routineEditorElements, progressElements, showLoading, hideLoading,
    hideSessionDetail, registerViewInitializer
} from './ui.js';
import { storageManager } from './storage-manager.js';
import {
    initVersionControl,
    checkForBackupSession,
    forceAppUpdate,
    getCurrentVersion,
    registerServiceWorkerUpdates
} from './version-manager.js';
import ThemeManager from './theme-manager.js';
import { initializeProgressView, loadExerciseList, updateChart, resetProgressView, handleExerciseChange, invalidateProgressCache } from './progress.js';
import {
    initI18n,
    setLanguage,
    getLanguage,
    onLanguageChange,
    t
} from './i18n.js';

// Import new modules
import { exerciseCache } from './exercise-cache.js';
import { logger } from './utils/logger.js';
import { beginAccountSession, captureAccountScope, isAccountScopeCurrent } from './utils/account-scope.js';
import { calendarNow } from './utils/calendar-clock.js';
import { sessionRevisionRef, recoverSessionInvalidations } from './utils/session-store.js';
import { registerSessionMutationInvalidator } from './utils/session-mutations.js';
import { verifyAccountSyncProtocol } from './utils/sync-protocol.js';
import {
    normalizeWeeklyTargets as normalizeWeeklyTargetsByWeekState,
    normalizeWeeklyState, createWeeklyTargetOperation, applyOptimisticWeeklyTarget,
    persistWeeklyTargetOperation, persistWeeklyOutcomes, resolveWeeklyTargetForWeek,
} from './utils/weekly-preferences.js';
import { toast } from './utils/notifications.js';
import { offlineManager } from './utils/offline-manager.js';
import { addViewListener, cleanupViewListeners } from './utils/event-manager.js';
import { localFirstCache } from './utils/local-first-cache.js';
import { firebaseUsageTracker } from './utils/firebase-usage-tracker.js';
import { normalizeExecutionMode } from './utils/execution-mode.js';
import { normalizeLoadType } from './utils/load-type.js';
import { serializeRoutinesForCache, deserializeRoutinesFromCache, serializeSessionsForCache, deserializeSessionsFromCache } from './utils/firestore-serialization.js';
import {
    RoutineImportError,
    parseRoutineImport,
    prepareRoutineImport,
    commitNextRoutineImportBatch,
    pendingRoutineImportJson,
} from './utils/routine-import.js';
import {
    buildWeeklyConsistencyTimeline,
    computeDailyHubState,
    getWeekKeyForDate,
    getWeeklyConsistencyWindowStartDate,
    normalizeWeeklyTargetDays,
    normalizeWeeklyTargetSessions,
    WEEKLY_STREAK_LOOKBACK_WEEKS,
    WEEKLY_TARGET_DEFAULT,
    toDatetimeLocalValue
} from './utils/quick-log.js';
import { initScrollToTop } from './modules/scroll-to-top.js';
import { initSettings } from './modules/settings.js';
import { initCalendar, updateCalendarView, hideCalendar, invalidateCalendar } from './modules/calendar.js';
import {
    setCurrentRoutineForSession,
    saveSessionData,
    saveQuickLogEntry,
    registerSessionPersistenceListener,
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
const routineImportUi = {
    open: false,
    busy: false,
    awaitingWrite: false,
    userId: null,
    operation: null,
    statusKey: null,
    statusParams: {},
    statusKind: '',
};
const ROUTINES_CACHE_TTL_MS = 10 * 60 * 1000;
const DAILY_HUB_CACHE_TTL_MS = 30 * 1000;
const DAILY_HUB_WEEKLY_WINDOW_QUERY_LIMIT = 1500;
const USER_PREFERENCES_CACHE_TTL_MS = 10 * 60 * 1000;
let dailyHubSessionsCache = [];
let dailyHubLastFetchTimestamp = 0;
let dailyHubCacheUserId = null;
let weeklyTargetDays = WEEKLY_TARGET_DEFAULT;
let weeklyTargetsByWeek = {};
let weeklyOutcomesByWeek = {};
let weeklyTargetCacheUserId = null;
let weeklyTargetLastFetchTimestamp = 0;
let weeklyPreferenceState = {};
let weeklyPreferenceRequestId = 0;
let dailyHubRequestId = 0;
let dailyHubCompleteness = { complete: false };

registerSessionMutationInvalidator(({ userId }) => {
    if (dailyHubCacheUserId !== userId) return;
    ++dailyHubRequestId;
    dailyHubSessionsCache = []; dailyHubLastFetchTimestamp = 0; dailyHubCompleteness = { complete: false };
});

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

function weeklyState() {
    return { ...weeklyPreferenceState, weeklyTargetDays, weeklyTargetSessions: weeklyTargetDays,
        weeklyTargetsByWeek, weeklyOutcomesByWeek };
}

function applyWeeklyTargetState(state = {}) {
    const normalized = normalizeWeeklyState(state);
    weeklyPreferenceState = normalized;
    weeklyTargetsByWeek = normalized.weeklyTargetsByWeek;
    weeklyOutcomesByWeek = normalized.weeklyOutcomesByWeek;
    weeklyTargetDays = resolveWeeklyTargetForWeek(normalized, getCurrentWeekKey(calendarNow()));
    weeklyTargetLastFetchTimestamp = Date.now();
    applyWeeklyTargetControlValue(weeklyTargetDays);
    updateWeeklyConflictNotice();
}

function updateWeeklyConflictNotice() {
    const status = document.getElementById('weekly-target-conflict-status');
    if (!status) return;
    const count = offlineManager.getConflictCount?.() || 0;
    status.textContent = count ? t('settings.weekly_goal_conflict') : '';
    status.classList.toggle('hidden', count === 0);
}

function overlayQueuedWeeklyTargets(state, excludeOperationId = null) {
    let next = state;
    for (const entry of offlineManager.getOrderedPendingOperations()) {
        const payload = entry.descriptor?.payload;
        if (!['conflict', 'blocked', 'quarantined', 'unowned'].includes(entry.status) && entry.descriptor?.type === 'preferences.saveWeeklyTarget'
            && payload?.userId === getCurrentUser()?.uid && payload.weekKey && payload.weekRecord
            && payload.operationId !== excludeOperationId
            && (next.weeklyTargetsByWeek?.[payload.weekKey]?.revision || 0) <= (payload.baseRevision ?? -1)) {
            next = applyOptimisticWeeklyTarget(payload, next);
        }
    }
    return next;
}

function applyWeeklyTargetControlValue(value) {
    const element = getWeeklyTargetSelectElement();
    if (element) element.value = `${normalizeWeeklyTargetDays(value, WEEKLY_TARGET_DEFAULT)}`;
}

function getCurrentWeekKey(now = calendarNow()) { return getWeekKeyForDate(now); }

async function cacheWeeklyTargetState(userId, state = {}, updatedAtIso = state.updatedAtIso, ifCurrent = null) {
    await localFirstCache.set(getUserPreferencesCacheKey(userId), {
        ...normalizeWeeklyState(state), ownerId: userId,
        ...(updatedAtIso ? { updatedAtIso } : {}),
    }, { metadata: { source: 'preferences', ownerId: userId }, ...(ifCurrent ? { ifCurrent } : {}) });
}

async function readWeeklyTargetStateFromCache(userId) {
    try {
        const entry = await localFirstCache.getEntry(getUserPreferencesCacheKey(userId));
        const value = entry?.value;
        if (!value || (value.ownerId && value.ownerId !== userId)) return null;
        return normalizeWeeklyState(value);
    } catch (error) {
        logger.warn('Could not read cached weekly target:', error);
        return null;
    }
}

async function persistWeeklyTargetPreference(userId, payload) {
    const scope = captureAccountScope(userId, { mutations: false });
    const isCurrent = () => isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    try {
        const result = await persistWeeklyTargetOperation(db, payload);
        try {
            if (isCurrent() && (result.state.preferencesRevision || 0) >= (weeklyPreferenceState.preferencesRevision || 0)) {
                const next = overlayQueuedWeeklyTargets(result.state, payload.operationId);
                applyWeeklyTargetState(next); weeklyTargetCacheUserId = userId;
                await cacheWeeklyTargetState(userId, next, next.updatedAtIso, isCurrent);
            }
        } catch (error) { logger.warn('Weekly target accepted; presentation refresh deferred:', error); }
        return result;
    } catch (error) {
        if (error.code === 'sync/conflict' && isCurrent()) {
            if ((error.result.state.preferencesRevision || 0) >= (weeklyPreferenceState.preferencesRevision || 0)) {
                try { await cacheWeeklyTargetState(userId, error.result.state, error.result.state.updatedAtIso, isCurrent); }
                catch (cacheError) { logger.warn('Could not cache acknowledged conflict state:', cacheError); }
                if (isCurrent()) { applyWeeklyTargetState(error.result.state); weeklyTargetCacheUserId = userId; }
            }
            toast.warning(t('settings.weekly_goal_conflict'));
        }
        throw error;
    }
}

async function fetchWeeklyTargetPreference(user, options = {}) {
    const request = ++weeklyPreferenceRequestId;
    if (!user) {
        applyWeeklyTargetState({}); weeklyTargetCacheUserId = null; weeklyTargetLastFetchTimestamp = 0;
        return weeklyTargetDays;
    }
    const scope = captureAccountScope(user.uid);
    const isCurrent = () => request === weeklyPreferenceRequestId && isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    if (!isCurrent()) return WEEKLY_TARGET_DEFAULT;
    if (weeklyTargetCacheUserId !== user.uid) {
        applyWeeklyTargetState({}); weeklyTargetCacheUserId = user.uid; weeklyTargetLastFetchTimestamp = 0;
    }
    if (!options.forceRefresh && weeklyTargetLastFetchTimestamp > 0
        && Date.now() - weeklyTargetLastFetchTimestamp <= USER_PREFERENCES_CACHE_TTL_MS) return weeklyTargetDays;
    const cached = await readWeeklyTargetStateFromCache(user.uid);
    if (!isCurrent()) return WEEKLY_TARGET_DEFAULT;
    if (!offlineManager.checkOnline()) {
        if (cached) applyWeeklyTargetState(cached);
        return weeklyTargetDays;
    }
    try {
        const snapshot = await getDoc(getUserPreferencesDocRef(user.uid));
        if (!isCurrent()) return WEEKLY_TARGET_DEFAULT;
        firebaseUsageTracker.trackRead(snapshot.exists() ? 1 : 0, 'preferences.weeklyTarget.read');
        let next = normalizeWeeklyState(snapshot.exists() ? snapshot.data() : {});
        await offlineManager.restorePersistedQueue?.();
        if (!isCurrent()) return WEEKLY_TARGET_DEFAULT;
        next = overlayQueuedWeeklyTargets(next);
        await cacheWeeklyTargetState(user.uid, next, next.updatedAtIso, isCurrent);
        if (isCurrent()) applyWeeklyTargetState(next);
    } catch (error) {
        if (!isCurrent()) return WEEKLY_TARGET_DEFAULT;
        logger.warn('Could not load weekly target preference:', error);
        if (cached) applyWeeklyTargetState(cached);
    }
    return weeklyTargetDays;
}

async function saveWeeklyTargetPreference(targetDaysValue, options = {}) {
    const user = getCurrentUser();
    if (!user) { toast.error(t('settings.weekly_goal_requires_login')); return { ok: false, reason: 'unauthenticated' }; }
    const scope = captureAccountScope(user.uid, { mutations: false });
    const isCurrent = () => isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    ++weeklyPreferenceRequestId;
    ++dailyHubRequestId;
    const now = calendarNow();
    const weekKey = getCurrentWeekKey(now);
    const target = normalizeWeeklyTargetSessions(targetDaysValue, WEEKLY_TARGET_DEFAULT);
    const payload = createWeeklyTargetOperation(user.uid, weekKey, target, weeklyTargetsByWeek[weekKey], now.toISOString());
    const next = applyOptimisticWeeklyTarget(payload, weeklyState());
    const descriptor = { type: 'preferences.saveWeeklyTarget', payload };
    const triggerButton = options.triggerButton || null;
    let queueId = null; let intentCommitted = false; let accepted = false; let cancelled = false;
    showLoading(triggerButton, t('common.saving'));
    try {
        // Persist the immutable intent before acknowledging an offline save or
        // starting a network request. An ambiguous commit is safe to replay.
        queueId = offlineManager.queueOperation(null, t('settings.weekly_goal_save_offline'), { descriptor });
        offlineManager.executingIds.add(queueId);
        await offlineManager.persistQueue?.();
        intentCommitted = true;
        if (!isCurrent()) return { ok: true, queued: true };
        applyWeeklyTargetState(next); weeklyTargetCacheUserId = user.uid;
        await cacheWeeklyTargetState(user.uid, next, payload.updatedAtIso, isCurrent);
        if (!offlineManager.checkOnline() || !offlineManager.canExecuteOperation(queueId)) {
            await refreshDailyHub(user, { forceRefresh: true });
            if (isCurrent()) toast.info(t('settings.weekly_goal_saved_queued'));
            return { ok: true, queued: true };
        }
        try {
            await persistWeeklyTargetPreference(user.uid, payload);
            accepted = true;
            await offlineManager.acknowledgeOperation?.(queueId);
            await offlineManager.resolveConflicts?.(user.uid, weekKey);
            updateWeeklyConflictNotice();
        } catch (error) {
            if (error.code === 'sync/conflict') {
                await offlineManager.markConflict?.(queueId, error);
                updateWeeklyConflictNotice();
                if (isCurrent()) await refreshDailyHub(user, { forceRefresh: true });
                return { ok: false, reason: 'conflict' };
            }
            if (!offlineManager.isPermanentError(error)) return { ok: true, queued: true };
            try { await offlineManager.cancelOperation(queueId); cancelled = true; }
            catch (storageError) { logger.warn('Weekly target cancellation deferred:', storageError); return { ok: true, queued: true }; }
            if (isCurrent()) {
                await fetchWeeklyTargetPreference(user, { forceRefresh: true });
                await refreshDailyHub(user, { forceRefresh: true, skipOutcomeFinalization: true });
            }
            throw error;
        }
        if (isCurrent()) {
            await refreshDailyHub(user, { forceRefresh: true });
            if (isCurrent()) toast.success(t('settings.weekly_goal_saved'));
        }
        return { ok: true, queued: false };
    } catch (error) {
        if (accepted || (!cancelled && queueId && (intentCommitted || offlineManager.unknownIds.has(queueId)))) {
            if (isCurrent()) logger.warn('Weekly target retained; presentation/acknowledgement deferred:', error);
            return { ok: true, queued: !accepted };
        }
        if (isCurrent()) { logger.error('Error saving weekly target preference:', error); toast.error(t('settings.weekly_goal_save_error')); }
        return { ok: false, reason: 'error', error };
    } finally {
        if (queueId) offlineManager.executingIds.delete(queueId);
        if (isCurrent()) hideLoading(triggerButton);
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
        dashboardElements.quickLogDateTimeInput.value = toDatetimeLocalValue(calendarNow());
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
            sessions: state.weeklyProgressSessions ?? state.weeklyProgressDays ?? 0,
            target: state.weeklyTargetSessions ?? state.weeklyTargetDays ?? WEEKLY_TARGET_DEFAULT
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
    const incomplete = sessions => ({ sessions: Array.isArray(sessions) ? sessions : [], complete: false, source: 'local', weeklyWindowTruncated: true });
    if (!user) return incomplete([]);
    const scope = options.scope || captureAccountScope(user.uid);
    const isCurrent = options.isCurrent || (() => isAccountScopeCurrent(scope, getCurrentUser()?.uid));
    if (!isCurrent()) return incomplete([]);
    const referenceNow = options.now || calendarNow();
    const windowStart = getWeeklyConsistencyWindowStartDate(referenceNow, WEEKLY_STREAK_LOOKBACK_WEEKS);
    const cacheKey = `daily-hub:${user.uid}:weekly`;
    if (dailyHubCacheUserId !== user.uid) {
        dailyHubCacheUserId = user.uid; dailyHubSessionsCache = []; dailyHubLastFetchTimestamp = 0;
        dailyHubCompleteness = { complete: false };
    }
    const hasFreshCache = dailyHubLastFetchTimestamp > 0 && Date.now() - dailyHubLastFetchTimestamp <= DAILY_HUB_CACHE_TTL_MS
        && dailyHubCompleteness.windowStartIso === windowStart.toISOString();
    if (!options.forceRefresh && hasFreshCache) {
        return { sessions: dailyHubSessionsCache, ...dailyHubCompleteness, source: 'memory', canFinalize: false };
    }
    const fallback = async () => {
        const cached = await localFirstCache.getEntry(cacheKey);
        if (!isCurrent()) return incomplete([]);
        if (cached?.value?.ownerId === user.uid && Array.isArray(cached.value.sessions)) {
            return incomplete(deserializeSessionsFromCache(cached.value.sessions));
        }
        const sessions = dailyHubSessionsCache.length ? dailyHubSessionsCache : getSessionsCache();
        return incomplete(sessions);
    };
    if (!offlineManager.checkOnline()) return fallback();
    try {
        const protocolProof = await verifyAccountSyncProtocol(db, user.uid);
        if (!isCurrent()) return incomplete([]);
        const revisionBefore = await getDoc(sessionRevisionRef(db, user.uid));
        if (!isCurrent()) return incomplete([]);
        const sessionsRef = collection(db, 'users', user.uid, 'sesiones_entrenamiento');
        const snapshot = await getDocs(query(sessionsRef,
            where('fecha', '>=', Timestamp.fromDate(windowStart)), orderBy('fecha', 'desc'),
            limit(DAILY_HUB_WEEKLY_WINDOW_QUERY_LIMIT + 1)));
        if (!isCurrent()) return incomplete([]);
        firebaseUsageTracker.trackRead(snapshot.docs.length || 1, 'dashboard.dailyHub');
        const truncated = snapshot.docs.length > DAILY_HUB_WEEKLY_WINDOW_QUERY_LIMIT;
        let sessions = snapshot.docs.slice(0, DAILY_HUB_WEEKLY_WINDOW_QUERY_LIMIT).map(item => ({ ...item.data(), id: item.id }));
        let latestAuthoritative = true;
        if (!sessions.length) {
            const latest = await getDocs(query(sessionsRef, orderBy('fecha', 'desc'), limit(1)));
            if (!isCurrent()) return incomplete([]);
            firebaseUsageTracker.trackRead(latest.docs.length || 1, 'dashboard.dailyHubLatestWorkout');
            latestAuthoritative = latest.metadata?.fromCache !== true && latest.metadata?.hasPendingWrites !== true;
            sessions = latest.docs.map(item => ({ ...item.data(), id: item.id }));
        }
        const revisionAfter = await getDoc(sessionRevisionRef(db, user.uid));
        if (!isCurrent()) return incomplete([]);
        firebaseUsageTracker.trackRead(2, 'dashboard.dailyHubRevision');
        const revision = revisionAfter.data()?.revision || 0;
        const complete = !!protocolProof && !truncated && latestAuthoritative && revision === (revisionBefore.data()?.revision || 0)
            && snapshot.metadata?.fromCache !== true && snapshot.metadata?.hasPendingWrites !== true
            && revisionBefore.metadata?.fromCache !== true && revisionAfter.metadata?.fromCache !== true
            && revisionBefore.metadata?.hasPendingWrites !== true && revisionAfter.metadata?.hasPendingWrites !== true;
        const metadata = { complete, weeklyWindowTruncated: truncated, sessionRevision: revision, windowStartIso: windowStart.toISOString() };
        await localFirstCache.set(cacheKey, { ownerId: user.uid, sessions: serializeSessionsForCache(sessions), ...metadata },
            { metadata: { ownerId: user.uid, ...metadata }, ifCurrent: isCurrent });
        if (!isCurrent()) return incomplete([]);
        dailyHubSessionsCache = sessions; dailyHubLastFetchTimestamp = Date.now();
        dailyHubCompleteness = metadata;
        return { sessions, ...metadata, source: 'server', protocolProof, canFinalize: complete && !!protocolProof };
    } catch (error) {
        if (isCurrent()) logger.warn('Could not refresh daily hub sessions:', error);
        return fallback();
    }
}

async function finalizePastWeeklyOutcomes(user, fetchResult, now, isCurrent) {
    if (!user || !fetchResult.canFinalize || !fetchResult.sessions.length || !offlineManager.checkOnline() || !isCurrent()) return;
    const expectedTargets = normalizeWeeklyTargetsByWeekState(weeklyTargetsByWeek);
    const targetForReferenceWeek = resolveWeeklyTargetForWeek(weeklyPreferenceState, getCurrentWeekKey(now));
    const timelineResult = buildWeeklyConsistencyTimeline({ sessions: fetchResult.sessions, now,
        weeklyTargetDays: targetForReferenceWeek, weeklyTargetBaselineSessions: weeklyPreferenceState.weeklyTargetBaselineSessions,
        weeklyTargetsByWeek: expectedTargets, weeklyOutcomesByWeek, lookbackWeeks: WEEKLY_STREAK_LOOKBACK_WEEKS });
    const outcomes = {};
    timelineResult.timeline.forEach(entry => {
        if (!entry.isCurrentWeek && !entry.isFrozen) { outcomes[entry.weekKey] = {
            targetSessions: entry.targetSessions, targetDays: entry.targetSessions,
            sessionCount: entry.sessionCount, activeSessions: entry.sessionCount, activeDays: entry.activeDays,
            met: entry.met, lockedAtIso: now.toISOString(),
        }; }
    });
    if (!Object.keys(outcomes).length || !isCurrent()) return;
    const result = await persistWeeklyOutcomes(db, user.uid, outcomes, expectedTargets,
        { complete: true, nowIso: now.toISOString(), sessionRevision: fetchResult.sessionRevision, protocolProof: fetchResult.protocolProof });
    if (!isCurrent() || !result?.changed) return;
    const next = overlayQueuedWeeklyTargets(result.state);
    await cacheWeeklyTargetState(user.uid, next, next.updatedAtIso, isCurrent);
    if (isCurrent()) applyWeeklyTargetState(next);
}

async function refreshDailyHub(user, options = {}) {
    const request = ++dailyHubRequestId;
    const scope = user ? captureAccountScope(user.uid) : null;
    const isCurrent = () => request === dailyHubRequestId && (user
        ? isAccountScopeCurrent(scope, getCurrentUser()?.uid) : !getCurrentUser());
    if (!isCurrent()) return;
    if (!dashboardElements.dailyHubMonthCount) return;
    const now = options.now instanceof Date ? new Date(options.now) : calendarNow();
    const fetchResult = user ? await fetchRecentSessionsForDailyHub(user, { ...options, now, scope, isCurrent })
        : { sessions: [], complete: true };
    if (!isCurrent()) return;
    if (user && weeklyTargetCacheUserId === user.uid && weeklyTargetLastFetchTimestamp > 0 && !options.skipOutcomeFinalization) {
        try { await finalizePastWeeklyOutcomes(user, fetchResult, now, isCurrent); }
        catch (error) {
            if (error.code !== 'sync/retry-exhausted' || options.propagateRetryExhaustion || !isCurrent()) throw error;
            // Persist only a recompute intent; stale outcomes/completeness
            // snapshots must never be replayed as an accepted frozen result.
            const alreadyQueued = offlineManager.pendingOperations.some(entry => entry.descriptor?.type === 'preferences.syncWeeklyState'
                && entry.descriptor.payload?.userId === user.uid);
            if (!alreadyQueued) {
                offlineManager.queueOperation(null, t('offline.queued_when_online'), {
                    descriptor: { type: 'preferences.syncWeeklyState', payload: { userId: user.uid } },
                });
            }
            await offlineManager.persistQueue();
        }
        if (!isCurrent()) return;
    }
    const targetForReferenceWeek = resolveWeeklyTargetForWeek(weeklyPreferenceState, getCurrentWeekKey(now));
    weeklyTargetDays = targetForReferenceWeek;
    applyWeeklyTargetControlValue(targetForReferenceWeek);
    const state = computeDailyHubState({ sessions: fetchResult.sessions, routines: currentUserRoutines,
        selectedRoutineId: dashboardElements.daySelect?.value || '', now,
        weeklyTargetBaselineSessions: weeklyPreferenceState.weeklyTargetBaselineSessions,
        weeklyTargetSessions: weeklyTargetDays, weeklyTargetDays, weeklyTargetsByWeek, weeklyOutcomesByWeek,
        isOnline: offlineManager.checkOnline(), pendingCount: offlineManager.getPendingCount() });
    applyDailyHubState(state);
    const status = document.getElementById('daily-hub-data-status');
    if (status) {
        status.textContent = fetchResult.complete ? '' : t('dashboard.limited_data');
        status.classList.toggle('hidden', fetchResult.complete === true);
    }
}

async function refreshPersistedSessionSurfaces({ userId } = {}) {
    const user = getCurrentUser();
    if (!user || user.uid !== userId) return;
    const scope = captureAccountScope(userId);
    const isCurrent = () => isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    invalidateHistoryCache(); invalidateProgressCache(userId, { durable: false }); invalidateCalendar();
    hideSessionDetail();
    // Suggestions are derived from bounded persisted history for save, replay
    // and delete alike; never append a deleted or duplicate session locally.
    await exerciseCache.buildCacheFromHistory(userId, db);
    if (!isCurrent()) return;
    exerciseCache.syncWithFirebase(userId, db).catch(error => logger.warn('Could not sync rebuilt suggestions:', error));
    updateCalendarView();
    await refreshDailyHub(user, { forceRefresh: true, skipOutcomeFinalization: true });
    if (!isCurrent()) return;
    if (!views.history.classList.contains('hidden')) await fetchAndRenderHistory();
    if (!isCurrent()) return;
    if (!views.progress.classList.contains('hidden')) { await loadExerciseList(); if (isCurrent()) await updateChart(); }
}

registerSessionPersistenceListener(refreshPersistedSessionSurfaces);

// --- App Initialization triggered by Auth ---
export async function initializeAppAfterAuth(user) {
    beginAccountSession(user?.uid);
    offlineManager.setActiveUser?.(user?.uid);
    const initializationScope = user ? captureAccountScope(user.uid, { mutations: false }) : null;
    const isCurrent = () => user ? isAccountScopeCurrent(initializationScope, getCurrentUser()?.uid) : !getCurrentUser();
    ++weeklyPreferenceRequestId; ++dailyHubRequestId;
    invalidateHistoryCache(); resetProgressView(); invalidateCalendar({ resetMonth: true });
    exerciseCache.setUser(user?.uid);
    currentUserRoutines = [];
    dailyHubCacheUserId = null; dailyHubSessionsCache = []; dailyHubLastFetchTimestamp = 0;
    weeklyPreferenceState = {}; weeklyTargetCacheUserId = null; weeklyTargetLastFetchTimestamp = 0;
    weeklyTargetsByWeek = {}; weeklyOutcomesByWeek = {}; weeklyTargetDays = WEEKLY_TARGET_DEFAULT;
    setCurrentRoutineForSession(null);
    sessionElements.form.reset();
    sessionElements.exerciseList.replaceChildren();
    dashboardElements.quickLogForm?.reset();
    hideLoading(sessionElements.saveBtn); hideLoading(dashboardElements.quickLogSaveBtn); hideLoading(getWeeklyTargetSaveButtonElement());
    populateDaySelector([]);
    hideSessionDetail(); hideCalendar();
    historyElements.list.innerHTML = `<li>${t('common.loading')}</li>`;
    manageRoutinesElements.list.innerHTML = `<li>${t('common.loading')}</li>`;
    applyDailyHubState(computeDailyHubState({ sessions: [], routines: [], now: calendarNow(),
        weeklyTargetDays, weeklyTargetsByWeek, weeklyOutcomesByWeek, isOnline: offlineManager.checkOnline(),
        pendingCount: offlineManager.getPendingCount() }));
    if (routineImportUi.userId && routineImportUi.userId !== user?.uid) {
        closeRoutineImport({ force: true, restoreFocus: false });
    }
    if (user) {
        // A new online auth session must observe another client's mutations.
        // Keep durable Daily Hub snapshots for offline/fresh-cache consumers;
        // paged analytics/calendar data are refreshed before they can render.
        if (offlineManager.checkOnline()) {
            await recoverSessionInvalidations(db, user.uid);
            if (!isCurrent()) return;
            await Promise.all([
                localFirstCache.clearByPrefix(`history:${user.uid}:`),
                localFirstCache.clearByPrefix(`calendar:${user.uid}:`),
                localFirstCache.remove?.(`progress:sessions:${user.uid}`),
            ]);
            if (!isCurrent()) return;
        }
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

        dashboardElements.currentDate.textContent = formatDate(calendarNow());
        // Routine loading refreshes the hub and may persist completed weeks.
        // Load the saved target first so that refresh cannot overwrite it with defaults.
        await fetchWeeklyTargetPreference(user, { forceRefresh: true });
        if (!isCurrent()) return;
        await fetchUserRoutines(user);
        if (!isCurrent()) return;
        setQuickLogDateTimeToNow();
        await refreshDailyHub(user, { forceRefresh: true });
        if (!isCurrent()) return;

        // Initialize exercise cache
        await initializeExerciseCache(user);
        if (!isCurrent()) return;

        // Initialize progress view
        initializeProgressView();

        // Process any queued durable operations that were waiting for auth context.
        offlineManager.processPendingOperations().catch((error) => {
            logger.warn('Could not process pending offline operations after auth:', error);
        });

        checkForBackupSession();
        checkAndOfferResumeSession(currentUserRoutines);

        // Initialize calendar with current month - with small delay to ensure DOM ready
        setTimeout(() => {
            if (isCurrent()) updateCalendarView();
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
        weeklyTargetsByWeek = {};
        weeklyOutcomesByWeek = {};
        weeklyTargetCacheUserId = null;
        weeklyTargetLastFetchTimestamp = 0;
        applyWeeklyTargetControlValue(weeklyTargetDays);
        setQuickLogDateTimeToNow();
        applyDailyHubState(computeDailyHubState({
            sessions: [],
            routines: [],
            now: calendarNow(),
            weeklyTargetDays,
            weeklyTargetsByWeek,
            weeklyOutcomesByWeek,
            isOnline: offlineManager.checkOnline(),
            pendingCount: offlineManager.getPendingCount()
        }));
    }
}

// Initializes exercise cache for the user
async function initializeExerciseCache(user) {
    if (!user) return;
    const scope = captureAccountScope(user.uid);
    const isCurrent = () => isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    exerciseCache.cleanOldEntries();
    if (!offlineManager.checkOnline()) return;
    try {
        // A backup or an exercise-name-only integrity probe cannot establish
        // current suggestion values after another client saved/deleted a set.
        await exerciseCache.buildCacheFromHistory(user.uid, db);
        if (isCurrent()) exerciseCache.syncWithFirebase(user.uid, db).catch(error => logger.warn('Could not sync initial suggestions:', error));
    } catch (error) {
        if (isCurrent()) logger.error('Error initializing exercise cache:', error);
    }
}

async function refreshUserRoutinesFromFirestore(user) {
    const scope = captureAccountScope(user.uid, { mutations: false });
    const isCurrent = () => isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    const cacheKey = `routines:${user.uid}`;
    const routinesCollectionRef = collection(db, 'users', user.uid, 'routines');
    const q = query(routinesCollectionRef, orderBy('createdAt', 'asc'));

    const querySnapshot = await getDocs(q);
    if (!isCurrent()) return;
    firebaseUsageTracker.trackRead(querySnapshot.docs.length || 1, 'routines.fetch');
    currentUserRoutines = querySnapshot.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
    populateDaySelector(currentUserRoutines);

    await localFirstCache.set(cacheKey, serializeRoutinesForCache(currentUserRoutines), {
        metadata: { source: 'firestore' }, ifCurrent: isCurrent
    });
    if (!isCurrent()) return;

    if (!views.manageRoutines.classList.contains('hidden')) {
        renderManageRoutinesView(currentUserRoutines);
    }
}

async function fetchUserRoutines(user, options = {}) {
    const scope = user ? captureAccountScope(user.uid, { mutations: false }) : null;
    const isCurrent = () => isAccountScopeCurrent(scope, getCurrentUser()?.uid);
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
            if (!isCurrent()) return;
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
        if (!isCurrent()) return;
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

    if (!isCurrent()) return;
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
        const error = new Error('Routine fetch owner is not signed in'); error.code = 'sync/owner-changed'; throw error;
    }

    await refreshUserRoutinesFromFirestore(currentUser);
});

offlineManager.registerOperationHandler('preferences.saveWeeklyTarget', async payload => {
    if (!payload?.userId) throw new Error('Invalid queued weekly target payload');
    if (getCurrentUser()?.uid !== payload.userId) {
        const error = new Error('Weekly target owner is not signed in'); error.code = 'sync/owner-changed'; throw error;
    }
    // Old descriptors retain their original timestamp and get a stable receipt
    // ID; unknown bases conflict instead of trusting device wall clocks.
    const normalized = payload.weekKey && payload.weekRecord ? payload : {
        ...payload, weekKey: getCurrentWeekKey(new Date(payload.updatedAtIso)),
        weekRecord: { targetDays: payload.weeklyTargetDays, savesUsed: 1, updatedAtIso: payload.updatedAtIso },
    };
    await persistWeeklyTargetPreference(payload.userId, normalized);
    if (getCurrentUser()?.uid === payload.userId) await refreshDailyHub(getCurrentUser(), { forceRefresh: true });
});

offlineManager.registerOperationHandler('preferences.syncWeeklyState', async payload => {
    if (getCurrentUser()?.uid !== payload?.userId) {
        const error = new Error('Weekly state owner is not signed in'); error.code = 'sync/owner-changed'; throw error;
    }
    // Legacy derived snapshots have no completeness/revision proof. They are
    // intentionally recomputed from a fresh bounded query, never copied over a
    // newer target or frozen outcome. The original target timestamps survive.
    await fetchWeeklyTargetPreference(getCurrentUser(), { forceRefresh: true });
    await refreshDailyHub(getCurrentUser(), { forceRefresh: true, propagateRetryExhaustion: true });
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
            const ownerScope = captureAccountScope(getCurrentUser()?.uid, { mutations: false });

            const result = await saveQuickLogEntry(getQuickLogFormPayload(), undefined, {
                triggerButton: dashboardElements.quickLogSaveBtn
            });
            if (result.stale || !isAccountScopeCurrent(ownerScope, getCurrentUser()?.uid)) return;

            if (result.ok && !result.queued && dashboardElements.quickLogNotesInput) {
                dashboardElements.quickLogNotesInput.value = '';
                setQuickLogDateTimeToNow();
            }

            if (result.queued) {
                await refreshDailyHub(getCurrentUser(), { forceRefresh: true });
            }
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
            saveSessionData();
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

function setRoutineImportStatus(key, params = {}, kind = '') {
    routineImportUi.statusKey = key;
    routineImportUi.statusParams = params;
    routineImportUi.statusKind = kind;
    renderRoutineImportStatus();
}

function renderRoutineImportStatus() {
    const { importStatus, importInput } = manageRoutinesElements;
    if (importStatus) {
        importStatus.textContent = routineImportUi.statusKey
            ? t(routineImportUi.statusKey, routineImportUi.statusParams)
            : '';
        importStatus.dataset.kind = routineImportUi.statusKind;
    }
    if (importInput) {
        importInput.setAttribute(
            'aria-invalid',
            String(routineImportUi.statusKey?.startsWith('routines.import_invalid_') || false)
        );
    }
}

function renderRoutineImportControls() {
    const { importModal, importInput, importSubmitBtn, importCancelBtn, importCloseBtn } = manageRoutinesElements;
    if (importModal) importModal.setAttribute('aria-busy', String(routineImportUi.busy));
    if (importInput) importInput.readOnly = routineImportUi.busy;
    if (importCancelBtn) importCancelBtn.disabled = routineImportUi.busy;
    if (importCloseBtn) importCloseBtn.disabled = routineImportUi.busy;
    if (importSubmitBtn) {
        importSubmitBtn.disabled = routineImportUi.busy;
        let label = 'routines.import_submit';
        if (routineImportUi.busy) {
            label = 'routines.import_loading';
        } else if (routineImportUi.operation) {
            label = 'routines.import_retry';
        }
        importSubmitBtn.textContent = t(label);
    }
}

function openRoutineImport() {
    const user = getCurrentUser();
    if (!user) {
        toast.error(t('routines.action_requires_login'));
        return;
    }
    if (!manageRoutinesElements.importModal || !manageRoutinesElements.importInput) return;

    const resumePending = routineImportUi.userId === user.uid && routineImportUi.operation;
    routineImportUi.open = true;
    routineImportUi.userId = user.uid;
    if (!resumePending) {
        routineImportUi.operation = null;
        manageRoutinesElements.importInput.value = '';
        setRoutineImportStatus(null);
    }
    renderRoutineImportControls();
    manageRoutinesElements.importModal.style.display = 'block';
    manageRoutinesElements.importInput.focus();
}

function closeRoutineImport({ force = false, restoreFocus = true, completed = false } = {}) {
    if (routineImportUi.busy && !force) return;
    const operation = routineImportUi.operation;
    const keepPending =
        !force && !completed && operation?.nextIndex > 0 && operation.nextIndex < operation.entries.length;
    if (keepPending) {
        toast.info(
            t('routines.import_partial_cancelled', {
                count: operation.nextIndex,
                remaining: operation.entries.length - operation.nextIndex,
            })
        );
    }

    routineImportUi.open = false;
    routineImportUi.busy = false;
    routineImportUi.awaitingWrite = false;
    if (!keepPending) {
        routineImportUi.userId = null;
        routineImportUi.operation = null;
    }
    if (manageRoutinesElements.importModal) manageRoutinesElements.importModal.style.display = 'none';
    if (!keepPending) {
        if (manageRoutinesElements.importInput) manageRoutinesElements.importInput.value = '';
        setRoutineImportStatus(null);
    }
    renderRoutineImportControls();
    if (restoreFocus) manageRoutinesElements.importRoutinesBtn?.focus();
}

function handleRoutineImportKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        closeRoutineImport();
        return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
        manageRoutinesElements.importModal.querySelectorAll('button:not(:disabled), textarea:not(:disabled)')
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

async function reflectImportedRoutines(operation) {
    const user = getCurrentUser();
    if (!user || user.uid !== operation.userId || operation.reflectedCount === operation.nextIndex) return;

    const added = operation.entries.slice(operation.reflectedCount, operation.nextIndex).map(entry => ({
        id: entry.ref.id,
        ...entry.data,
    }));
    operation.reflectedCount = operation.nextIndex;
    const existingIds = new Set(currentUserRoutines.map(routine => routine.id));
    currentUserRoutines = currentUserRoutines
        .concat(added.filter(routine => !existingIds.has(routine.id)))
        .sort((a, b) => (a.createdAt?.toDate?.()?.getTime() || 0) - (b.createdAt?.toDate?.()?.getTime() || 0));

    const selectedRoutineId = dashboardElements.daySelect?.value;
    populateDaySelector(currentUserRoutines);
    if (selectedRoutineId && dashboardElements.daySelect) {
        dashboardElements.daySelect.value = selectedRoutineId;
        if (dashboardElements.startSessionBtn) dashboardElements.startSessionBtn.disabled = false;
    }
    if (!views.manageRoutines.classList.contains('hidden')) renderManageRoutinesView(currentUserRoutines);

    try {
        await localFirstCache.set(`routines:${user.uid}`, serializeRoutinesForCache(currentUserRoutines), {
            metadata: { source: 'firestore' },
        });
        if (getCurrentUser()?.uid === user.uid && offlineManager.checkOnline()) {
            await refreshUserRoutinesFromFirestore(user);
            if (getCurrentUser()?.uid === user.uid && selectedRoutineId && dashboardElements.daySelect) {
                const hasSelection = Array.from(dashboardElements.daySelect.options).some(
                    option => option.value === selectedRoutineId
                );
                if (hasSelection) {
                    dashboardElements.daySelect.value = selectedRoutineId;
                    if (dashboardElements.startSessionBtn) dashboardElements.startSessionBtn.disabled = false;
                }
            }
        }
    } catch (error) {
        logger.warn('Could not refresh the routines cache after import:', error);
    }
}

async function submitRoutineImport(event) {
    event.preventDefault();
    if (routineImportUi.busy) return;
    const user = getCurrentUser();
    if (!user || user.uid !== routineImportUi.userId) {
        setRoutineImportStatus('routines.action_requires_login', {}, 'error');
        return;
    }
    if (!offlineManager.checkOnline()) {
        setRoutineImportStatus('routines.import_offline', {}, 'error');
        return;
    }

    let operation = routineImportUi.operation;
    if (!operation) {
        try {
            const payload = parseRoutineImport(manageRoutinesElements.importInput.value);
            operation = prepareRoutineImport(db, user.uid, payload);
            routineImportUi.operation = operation;
        } catch (error) {
            if (error instanceof RoutineImportError) {
                setRoutineImportStatus(`routines.import_invalid_${error.code}`, error.details, 'error');
            } else {
                logger.error('Could not prepare routine import:', error);
                setRoutineImportStatus('routines.import_error', {}, 'error');
            }
            return;
        }
    }

    routineImportUi.busy = true;
    renderRoutineImportControls();
    setRoutineImportStatus('routines.import_progress', { count: operation.nextIndex, total: operation.entries.length });
    let failure = null;
    let interruptedOffline = false;
    try {
        while (operation.nextIndex < operation.entries.length) {
            if (!offlineManager.checkOnline()) {
                interruptedOffline = true;
                break;
            }
            routineImportUi.awaitingWrite = true;
            let count;
            try {
                count = await commitNextRoutineImportBatch(db, operation);
            } finally {
                if (routineImportUi.operation === operation) routineImportUi.awaitingWrite = false;
            }
            firebaseUsageTracker.trackWrite(count, 'routines.import');
            if (routineImportUi.operation !== operation || getCurrentUser()?.uid !== operation.userId) return;
            setRoutineImportStatus('routines.import_progress', {
                count: operation.nextIndex,
                total: operation.entries.length,
            });
        }
    } catch (error) {
        failure = error;
        logger.error('Error importing routines:', error);
    } finally {
        try {
            await reflectImportedRoutines(operation);
        } catch (error) {
            logger.warn('Could not update the routines view after import:', error);
        }
        if (routineImportUi.operation === operation) {
            routineImportUi.busy = false;
            renderRoutineImportControls();
        }
    }

    if (routineImportUi.operation !== operation || getCurrentUser()?.uid !== operation.userId) return;
    if (failure || interruptedOffline) {
        if (operation.nextIndex > 0) {
            manageRoutinesElements.importInput.value = pendingRoutineImportJson(operation);
        }
        const remaining = operation.entries.length - operation.nextIndex;
        let key = 'routines.import_error';
        if (interruptedOffline) {
            key = operation.nextIndex > 0 ? 'routines.import_offline_partial' : 'routines.import_offline';
        } else if (operation.nextIndex > 0) {
            key = 'routines.import_error_partial';
        }
        setRoutineImportStatus(key, { count: operation.nextIndex, remaining }, 'error');
        return;
    }

    const count = operation.entries.length;
    closeRoutineImport({ completed: true });
    toast.success(t('routines.import_success', { count }));
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

    if (manageRoutinesElements.importRoutinesBtn && manageRoutinesElements.importForm) {
        addViewListener('manageRoutines', manageRoutinesElements.importRoutinesBtn, 'click', openRoutineImport);
        addViewListener('manageRoutines', manageRoutinesElements.importForm, 'submit', submitRoutineImport);
        addViewListener('manageRoutines', manageRoutinesElements.importCancelBtn, 'click', () => closeRoutineImport());
        addViewListener('manageRoutines', manageRoutinesElements.importCloseBtn, 'click', () => closeRoutineImport());
        addViewListener('manageRoutines', manageRoutinesElements.importModal, 'keydown', handleRoutineImportKeydown);
        addViewListener('manageRoutines', manageRoutinesElements.importInput, 'input', () => {
            if (!routineImportUi.busy) {
                routineImportUi.operation = null;
                setRoutineImportStatus(null);
                renderRoutineImportControls();
            }
        });
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

offlineManager.addListener(async isOnline => {
    if (routineImportUi.open && routineImportUi.busy && routineImportUi.awaitingWrite) {
        const operation = routineImportUi.operation;
        setRoutineImportStatus(isOnline ? 'routines.import_progress' : 'routines.import_pending_connection', {
            count: operation?.nextIndex || 0,
            total: operation?.entries.length || 0,
        });
    }
    const user = getCurrentUser();
    const scope = user ? captureAccountScope(user.uid) : null;
    if (isOnline && user) {
        await recoverSessionInvalidations(db, user.uid);
        if (!isAccountScopeCurrent(scope, getCurrentUser()?.uid)) return;
        await fetchWeeklyTargetPreference(user, { forceRefresh: true });
        if (!isAccountScopeCurrent(scope, getCurrentUser()?.uid)) return;
        invalidateHistoryCache(); invalidateCalendar();
        await Promise.all([invalidateProgressCache(user.uid), localFirstCache.clearByPrefix(`calendar:${user.uid}:`)]);
        if (!isAccountScopeCurrent(scope, getCurrentUser()?.uid)) return;
        await initializeExerciseCache(user);
        if (!isAccountScopeCurrent(scope, getCurrentUser()?.uid)) return;
        updateCalendarView();
        if (!views.history.classList.contains('hidden')) await fetchAndRenderHistory();
        if (!isAccountScopeCurrent(scope, getCurrentUser()?.uid)) return;
        if (!views.progress.classList.contains('hidden')) { await loadExerciseList(); await updateChart(); }
    }
    updateWeeklyConflictNotice();
    await refreshDailyHub(getCurrentUser(), { forceRefresh: true }).catch((error) => {
        logger.warn('Could not refresh daily hub after connectivity change:', error);
    });
});

offlineManager.addQueueListener?.(() => {
    updateWeeklyConflictNotice();
    return refreshDailyHub(getCurrentUser(), { skipOutcomeFinalization: true });
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
        // Register before version detection so a waiting worker can be activated
        // through one coherent release transition.
        try {
            const swPath = new URL('sw.js', window.location.href).pathname;
            const existing = await navigator.serviceWorker.getRegistration?.(swPath);
            const registration = existing || await navigator.serviceWorker.register(swPath, { updateViaCache: 'none' });
            registerServiceWorkerUpdates(registration);
            logger.info('ServiceWorker registered.', registration);
        } catch (error) {
            logger.error('ServiceWorker registration failed:', error);
            if (error.name === 'TypeError' && error.message.includes('Failed to register') && error.message.includes('404')) {
                logger.warn('This may be due to a missing service worker file or an ad blocker.');
            }
        }

        // Initialize version control after registration so metadata is checked
        // against the same update lifecycle as the installed client.
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
        renderRoutineImportStatus();
        renderRoutineImportControls();

        const currentUser = getCurrentUser();
        if (currentUser && dashboardElements.currentDate) {
            dashboardElements.currentDate.textContent = formatDate(calendarNow());
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

