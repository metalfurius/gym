// Calendar decisions share a captured Date. Cache age continues to use Date.now().
let referenceClock = null;

export function setCalendarClock(clock = null) {
    referenceClock = clock;
}

export function calendarNow() {
    const value = referenceClock ? referenceClock() : globalThis.__GYM_WEEKLY_TARGET_NOW_ISO;
    const date = value === undefined ? new Date() : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid calendar reference clock');
    return date;
}

export function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
