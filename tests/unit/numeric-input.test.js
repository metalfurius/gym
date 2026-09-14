import { describe, it, expect } from '@jest/globals';
import {
    normalizeDecimalEditValue,
    normalizeIntegerEditValue,
    parseDecimalInput,
    parseIntegerInput,
} from '../../js/utils/numeric-input.js';

describe('numeric input contract', () => {
    describe('decimal editing', () => {
        it.each([
            ['', '', false],
            ['6', '6', true],
            ['62', '62', true],
            ['62.', '62.', false],
            ['62.5', '62.5', true],
            ['62,', '62.', false],
            ['62,5', '62.5', true],
            ['.5', '.5', true],
        ])('keeps incremental value %s as %s', (input, expected, isComplete) => {
            const result = normalizeDecimalEditValue(input);

            expect(result.isValid).toBe(true);
            expect(result.value).toBe(expected);
            expect(result.isComplete).toBe(isComplete);
        });

        it.each(['62..5', '62,5.5', 'abc', '1e2', '+8'])('does not reinterpret malformed weight text %s', input => {
            const result = normalizeDecimalEditValue(input);

            expect(result.isValid).toBe(false);
            expect(result.value).toBe(input);
        });

        it.each([
            ['-', '-', false],
            ['+12', '+12', true],
            ['-12,', '-12.', false],
            ['-12,5', '-12.5', true],
        ])('preserves signed bodyweight editing value %s', (input, expected, isComplete) => {
            const result = normalizeDecimalEditValue(input, { allowSign: true });

            expect(result.isValid).toBe(true);
            expect(result.value).toBe(expected);
            expect(result.isComplete).toBe(isComplete);
        });
    });

    describe('decimal commit', () => {
        it.each([
            ['62.5', 62.5],
            ['62,5', 62.5],
            ['62.55', 62.6],
            [62, 62],
        ])('normalizes valid weight %s to %s', (input, expected) => {
            const result = parseDecimalInput(input, { min: 0, max: 500, roundTo: 1 });

            expect(result.isValid).toBe(true);
            expect(result.value).toBe(expected);
        });

        it.each([
            ['62.', 'incomplete'],
            ['62,', 'incomplete'],
            ['62..5', 'format'],
            ['62,5.5', 'format'],
            ['501', 'max'],
            ['-1', 'format'],
        ])('rejects committed external weight %s', (input, errorCode) => {
            const result = parseDecimalInput(input, { min: 0, max: 500, roundTo: 1 });

            expect(result.isValid).toBe(false);
            expect(result.value).toBeNull();
            expect(result.errorCode).toBe(errorCode);
        });

        it('keeps signed bodyweight loads and decimal commas', () => {
            const result = parseDecimalInput('-12,5', {
                allowSign: true,
                min: -500,
                max: 500,
                roundTo: 1,
            });

            expect(result.isValid).toBe(true);
            expect(result.value).toBe(-12.5);
        });
    });

    describe('integer repetitions', () => {
        it.each([
            ['0', 0],
            ['8', 8],
            ['12', 12],
            [0, 0],
        ])('accepts whole repetition value %s', (input, expected) => {
            const result = parseIntegerInput(input, { min: 0, max: 1000 });

            expect(result.isValid).toBe(true);
            expect(result.value).toBe(expected);
        });

        it.each(['8.5', '8,5', '1e2', '+8', '-1', '8x', ' 8'])('rejects non-whole repetition value %s', input => {
            const result = parseIntegerInput(input, { min: 0, max: 1000 });

            expect(result.isValid).toBe(false);
            expect(result.value).toBeNull();
            expect(result.errorCode).toBe('format');
        });

        it('treats empty repetitions as optional until a set is committed', () => {
            const result = parseIntegerInput('', { min: 0, max: 1000 });

            expect(result.isValid).toBe(true);
            expect(result.value).toBeNull();
            expect(result.errorCode).toBe('empty');
        });

        it('keeps malformed repetition text unchanged during editing', () => {
            const result = normalizeIntegerEditValue('8.5');

            expect(result.isValid).toBe(false);
            expect(result.value).toBe('8.5');
        });
    });
});
