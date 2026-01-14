import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { debounce, throttle, once, rateLimit } from '../../js/utils/debounce.js';

/**
 * Tests for debounce utility module
 * Provides rate limiting functions for performance optimization
 */
describe('Debounce utilities', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('debounce', () => {
        it('should delay function execution', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300);

            debouncedFunc();
            expect(func).not.toHaveBeenCalled();

            jest.advanceTimersByTime(300);
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should only execute once for multiple calls within wait time', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300);

            debouncedFunc();
            debouncedFunc();
            debouncedFunc();
            expect(func).not.toHaveBeenCalled();

            jest.advanceTimersByTime(300);
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should pass the latest arguments to the function', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300);

            debouncedFunc('first');
            debouncedFunc('second');
            debouncedFunc('third');

            jest.advanceTimersByTime(300);
            expect(func).toHaveBeenCalledWith('third');
        });

        it('should support leading edge execution', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300, { leading: true, trailing: false });

            debouncedFunc();
            expect(func).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(300);
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should support trailing edge execution (default)', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300);

            debouncedFunc();
            expect(func).not.toHaveBeenCalled();

            jest.advanceTimersByTime(300);
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should support both leading and trailing edge', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300, { leading: true, trailing: true });

            debouncedFunc();
            expect(func).toHaveBeenCalledTimes(1);

            // Call again before wait time expires
            jest.advanceTimersByTime(200);
            debouncedFunc();

            // After wait time, trailing edge should execute
            jest.advanceTimersByTime(300);
            expect(func).toHaveBeenCalledTimes(2);
        });

        it('should support maxWait option', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300, { maxWait: 500 });

            debouncedFunc();
            jest.advanceTimersByTime(200);
            debouncedFunc();
            jest.advanceTimersByTime(200);
            debouncedFunc();

            // Should invoke after maxWait time
            jest.advanceTimersByTime(100);
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should cancel pending invocation', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300);

            debouncedFunc();
            debouncedFunc.cancel();

            jest.advanceTimersByTime(300);
            expect(func).not.toHaveBeenCalled();
        });

        it('should flush pending invocation immediately', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300);

            debouncedFunc('test');
            debouncedFunc.flush();

            expect(func).toHaveBeenCalledWith('test');
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should report pending status', () => {
            const func = jest.fn();
            const debouncedFunc = debounce(func, 300);

            expect(debouncedFunc.pending()).toBe(false);

            debouncedFunc();
            expect(debouncedFunc.pending()).toBe(true);

            jest.advanceTimersByTime(300);
            expect(debouncedFunc.pending()).toBe(false);
        });
    });

    describe('throttle', () => {
        it('should limit function execution to once per wait time', () => {
            const func = jest.fn();
            const throttledFunc = throttle(func, 300);

            // First call should execute immediately (leading edge)
            throttledFunc();
            expect(func).toHaveBeenCalledTimes(1);

            // Subsequent calls within wait time should not execute
            throttledFunc();
            throttledFunc();
            expect(func).toHaveBeenCalledTimes(1);

            // After wait time, trailing edge should execute
            jest.advanceTimersByTime(300);
            expect(func).toHaveBeenCalledTimes(2);
        });

        it('should support leading edge (default)', () => {
            const func = jest.fn();
            const throttledFunc = throttle(func, 300);

            throttledFunc();
            expect(func).toHaveBeenCalledTimes(1);
        });

        it('should support trailing edge', () => {
            const func = jest.fn();
            const throttledFunc = throttle(func, 300);

            throttledFunc('first');
            throttledFunc('second');

            jest.advanceTimersByTime(300);
            expect(func).toHaveBeenCalledTimes(2);
            expect(func).toHaveBeenLastCalledWith('second');
        });

        it('should not execute more than once within wait time', () => {
            const func = jest.fn();
            const throttledFunc = throttle(func, 300);

            for (let i = 0; i < 10; i++) {
                throttledFunc();
                jest.advanceTimersByTime(50);
            }

            // Should have executed on leading edge and once after wait
            expect(func.mock.calls.length).toBeLessThanOrEqual(3);
        });
    });

    describe('once', () => {
        it('should execute function only once', () => {
            const func = jest.fn(() => 'result');
            const onceFunc = once(func);

            const result1 = onceFunc();
            const result2 = onceFunc();
            const result3 = onceFunc();

            expect(func).toHaveBeenCalledTimes(1);
            expect(result1).toBe('result');
            expect(result2).toBe('result');
            expect(result3).toBe('result');
        });

        it('should pass arguments to function', () => {
            const func = jest.fn((a, b) => a + b);
            const onceFunc = once(func);

            const result1 = onceFunc(1, 2);
            const result2 = onceFunc(3, 4);

            expect(func).toHaveBeenCalledTimes(1);
            expect(func).toHaveBeenCalledWith(1, 2);
            expect(result1).toBe(3);
            expect(result2).toBe(3);
        });

        it('should preserve this context', () => {
            const obj = {
                value: 42,
                getValue: null
            };
            obj.getValue = once(function() {
                return this.value;
            });

            const result = obj.getValue();
            expect(result).toBe(42);
        });
    });

    describe('rateLimit', () => {
        beforeEach(() => {
            jest.useRealTimers();
        });

        it('should execute functions with delay between each', async () => {
            const func = jest.fn(async (val) => val * 2);
            const rateLimitedFunc = rateLimit(func, 100);

            const promise1 = rateLimitedFunc(1);
            const promise2 = rateLimitedFunc(2);
            const promise3 = rateLimitedFunc(3);

            const results = await Promise.all([promise1, promise2, promise3]);

            expect(results).toEqual([2, 4, 6]);
            expect(func).toHaveBeenCalledTimes(3);
        });

        it('should queue and process calls in order', async () => {
            const executionOrder = [];
            const func = jest.fn(async (val) => {
                executionOrder.push(val);
                return val;
            });
            const rateLimitedFunc = rateLimit(func, 50);

            await Promise.all([
                rateLimitedFunc(1),
                rateLimitedFunc(2),
                rateLimitedFunc(3)
            ]);

            expect(executionOrder).toEqual([1, 2, 3]);
        });

        it('should handle errors in queued functions', async () => {
            const func = jest.fn(async (val) => {
                if (val === 2) throw new Error('Test error');
                return val;
            });
            const rateLimitedFunc = rateLimit(func, 50);

            const promise1 = rateLimitedFunc(1);
            const promise2 = rateLimitedFunc(2);
            const promise3 = rateLimitedFunc(3);

            const result1 = await promise1;
            expect(result1).toBe(1);

            await expect(promise2).rejects.toThrow('Test error');

            const result3 = await promise3;
            expect(result3).toBe(3);
        });

        it('should return promises for all queued calls', async () => {
            const func = jest.fn(async (val) => val);
            const rateLimitedFunc = rateLimit(func, 50);

            const promise1 = rateLimitedFunc(1);
            const promise2 = rateLimitedFunc(2);

            expect(promise1).toBeInstanceOf(Promise);
            expect(promise2).toBeInstanceOf(Promise);

            await Promise.all([promise1, promise2]);
        });
    });
});
