import assert from 'node:assert/strict';
import { calendarNow, localDateKey, setCalendarClock } from '../../js/utils/calendar-clock.js';
import { getWeekKeyForDate, getWeeklyConsistencyWindowStartDate, computeDailyHubState } from '../../js/utils/quick-log.js';

const zone = process.env.TZ;
const fixtures = {
    UTC: [
        ['2026-03-29T00:30:00Z', '2026-03-29', '2026-03-23'], ['2026-03-29T01:30:00Z', '2026-03-29', '2026-03-23'],
        ['2026-03-29T22:30:00Z', '2026-03-29', '2026-03-23'], ['2026-03-30T00:00:00Z', '2026-03-30', '2026-03-30'],
        ['2026-10-25T00:30:00Z', '2026-10-25', '2026-10-19'], ['2026-10-25T01:30:00Z', '2026-10-25', '2026-10-19'],
        ['2026-10-25T23:30:00Z', '2026-10-25', '2026-10-19'], ['2026-12-31T23:30:00Z', '2026-12-31', '2026-12-28'],
    ],
    'Europe/Paris': [
        ['2026-03-29T00:30:00Z', '2026-03-29', '2026-03-23'], ['2026-03-29T01:30:00Z', '2026-03-29', '2026-03-23'],
        ['2026-03-29T22:30:00Z', '2026-03-30', '2026-03-30'], ['2026-03-30T00:00:00Z', '2026-03-30', '2026-03-30'],
        ['2026-10-25T00:30:00Z', '2026-10-25', '2026-10-19'], ['2026-10-25T01:30:00Z', '2026-10-25', '2026-10-19'],
        ['2026-10-25T23:30:00Z', '2026-10-26', '2026-10-26'], ['2026-12-31T23:30:00Z', '2027-01-01', '2026-12-28'],
    ],
    'America/Los_Angeles': [
        ['2026-03-29T00:30:00Z', '2026-03-28', '2026-03-23'], ['2026-03-29T01:30:00Z', '2026-03-28', '2026-03-23'],
        ['2026-03-29T22:30:00Z', '2026-03-29', '2026-03-23'], ['2026-03-30T00:00:00Z', '2026-03-29', '2026-03-23'],
        ['2026-10-25T00:30:00Z', '2026-10-24', '2026-10-19'], ['2026-10-25T01:30:00Z', '2026-10-24', '2026-10-19'],
        ['2026-10-25T23:30:00Z', '2026-10-25', '2026-10-19'], ['2026-12-31T23:30:00Z', '2026-12-31', '2026-12-28'],
    ],
};
const windows = { '2026-03-23': '2025-03-31', '2026-03-30': '2025-04-07',
    '2026-10-19': '2025-10-27', '2026-10-26': '2025-11-03', '2026-12-28': '2026-01-05' };
for (const [instant, expectedDate, expectedWeek] of fixtures[zone]) {
    setCalendarClock(() => instant);
    const now = calendarNow();
    assert.equal(localDateKey(now), expectedDate, `${zone} local date at ${instant}`);
    assert.equal(getWeekKeyForDate(now), expectedWeek, `${zone} Monday week at ${instant}`);
    assert.equal(localDateKey(getWeeklyConsistencyWindowStartDate(now, 52)), windows[expectedWeek]);
}
setCalendarClock(() => '2027-01-01T00:30:00Z');
const session = (id, date) => ({ id, fecha: { toDate: () => new Date(date) } });
const sameDay = session('two', '2027-01-01T00:15:00Z');
const metrics = computeDailyHubState({ now: calendarNow(), weeklyTargetSessions: 2,
    sessions: [session('one', '2026-12-31T23:15:00Z'), sameDay, sameDay] });
assert.equal(metrics.logsMonthCount, zone === 'UTC' ? 1 : 2);
assert.equal(metrics.weeklyProgressSessions, 2);
assert.equal(metrics.currentWeeklyStreak, 1);
assert.equal(metrics.bestWeeklyStreak, 1);
if (zone === 'Europe/Paris') {
    assert.equal((new Date(2026, 2, 30) - new Date(2026, 2, 23)) / 3600000, 167);
    assert.equal((new Date(2026, 9, 26) - new Date(2026, 9, 19)) / 3600000, 169);
}
console.log(JSON.stringify({ zone, fixtures: fixtures[zone].length, monthCount: metrics.logsMonthCount, weekCount: metrics.weeklyProgressSessions }));
