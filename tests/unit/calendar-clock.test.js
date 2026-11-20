import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { calendarNow, setCalendarClock } from '../../js/utils/calendar-clock.js';
import { LocalFirstCache } from '../../js/utils/local-first-cache.js';

describe('shared calendar reference and timezone matrix', () => {
    it.each(['UTC', 'Europe/Paris', 'America/Los_Angeles'])('keeps local weeks/months and DST arithmetic consistent in %s', zone => {
        const fixture = fileURLToPath(new URL('../fixtures/calendar-clock-matrix.mjs', import.meta.url));
        const output = execFileSync(process.execPath, [fixture], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
        expect(JSON.parse(output)).toMatchObject({ zone, fixtures: 8, weekCount: 2 });
    });

    it('uses the injected calendar instant without changing elapsed cache age', async () => {
        const cache = new LocalFirstCache(); cache.indexedDbEnabled = false;
        const saved = await cache.set('clock-test', 1);
        setCalendarClock(() => '2099-01-01T00:00:00Z');
        try {
            expect(calendarNow().toISOString()).toBe('2099-01-01T00:00:00.000Z');
            expect(cache.isFresh(saved, 60_000)).toBe(true);
            saved.updatedAt -= 120_000;
            expect(cache.isFresh(saved, 60_000)).toBe(false);
        } finally { setCalendarClock(); }
    });
});
