import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    normalizeBodyweight,
    getLastKnownBodyweight,
    saveLastKnownBodyweight,
    computeBodyweightTotalLoad
} from '../../js/utils/bodyweight.js';

describe('bodyweight utils', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('normalizes positive bodyweight and rejects invalid values', () => {
        expect(normalizeBodyweight('77.34')).toBe(77.3);
        expect(normalizeBodyweight(80)).toBe(80);
        expect(normalizeBodyweight(0)).toBeNull();
        expect(normalizeBodyweight(-10)).toBeNull();
        expect(normalizeBodyweight('not-a-number')).toBeNull();
    });

    it('stores and restores last known bodyweight per user', () => {
        saveLastKnownBodyweight('u-1', 78.6);
        saveLastKnownBodyweight('u-2', 85.1);

        expect(getLastKnownBodyweight('u-1')).toBe(78.6);
        expect(getLastKnownBodyweight('u-2')).toBe(85.1);
    });

    it('computes total load from bodyweight plus external load', () => {
        expect(computeBodyweightTotalLoad(-10, 78)).toBe(68);
        expect(computeBodyweightTotalLoad(15.25, 78)).toBe(93.3);
        expect(computeBodyweightTotalLoad(0, 80)).toBe(80);
        expect(computeBodyweightTotalLoad(10, null)).toBeNull();
    });
});
