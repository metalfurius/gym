/**
 * Debounce and throttle utilities for rate limiting
 * Prevents excessive API calls and improves performance
 */

/**
 * Creates a debounced function that delays invoking the provided function
 * until after `wait` milliseconds have elapsed since the last invocation.
 * 
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay (default: 300)
 * @param {Object} options - Additional options
 * @param {boolean} options.leading - Invoke on the leading edge (default: false)
 * @param {boolean} options.trailing - Invoke on the trailing edge (default: true)
 * @returns {Function} The debounced function with a cancel() method
 * 
 * @example
 * const debouncedSearch = debounce((query) => {
 *     fetchSearchResults(query);
 * }, 300);
 * 
 * searchInput.addEventListener('input', (e) => {
 *     debouncedSearch(e.target.value);
 * });
 */
export function debounce(func, wait = 300, options = {}) {
    let timeoutId = null;
    let lastArgs = null;
    let lastThis = null;
    let result = null;
    let lastCallTime = null;
    let lastInvokeTime = 0;
    
    const leading = options.leading ?? false;
    const trailing = options.trailing ?? true;
    const maxWait = options.maxWait ?? null;

    function invokeFunc(time) {
        const args = lastArgs;
        const thisArg = lastThis;
        
        lastArgs = null;
        lastThis = null;
        lastInvokeTime = time;
        
        result = func.apply(thisArg, args);
        return result;
    }

    function shouldInvoke(time) {
        const timeSinceLastCall = time - (lastCallTime ?? 0);
        const timeSinceLastInvoke = time - lastInvokeTime;

        return (lastCallTime === null) ||
               (timeSinceLastCall >= wait) ||
               (timeSinceLastCall < 0) ||
               (maxWait !== null && timeSinceLastInvoke >= maxWait);
    }

    function timerExpired() {
        const time = Date.now();
        
        if (shouldInvoke(time)) {
            return trailingEdge(time);
        }
        
        // Restart the timer
        const timeSinceLastCall = time - (lastCallTime ?? 0);
        const timeSinceLastInvoke = time - lastInvokeTime;
        const timeWaiting = wait - timeSinceLastCall;
        const remainingWait = maxWait !== null 
            ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
            : timeWaiting;
        
        timeoutId = setTimeout(timerExpired, remainingWait);
    }

    function leadingEdge(time) {
        lastInvokeTime = time;
        timeoutId = setTimeout(timerExpired, wait);
        
        return leading ? invokeFunc(time) : result;
    }

    function trailingEdge(time) {
        timeoutId = null;

        if (trailing && lastArgs) {
            return invokeFunc(time);
        }
        
        lastArgs = null;
        lastThis = null;
        return result;
    }

    function cancel() {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        lastInvokeTime = 0;
        lastArgs = null;
        lastCallTime = null;
        lastThis = null;
        timeoutId = null;
    }

    function flush() {
        if (timeoutId === null) {
            return result;
        }
        return trailingEdge(Date.now());
    }

    function pending() {
        return timeoutId !== null;
    }

    function debounced(...args) {
        const time = Date.now();
        const isInvoking = shouldInvoke(time);

        lastArgs = args;
        lastThis = this;
        lastCallTime = time;

        if (isInvoking) {
            if (timeoutId === null) {
                return leadingEdge(time);
            }
            if (maxWait !== null) {
                timeoutId = setTimeout(timerExpired, wait);
                return invokeFunc(time);
            }
        }
        
        if (timeoutId === null) {
            timeoutId = setTimeout(timerExpired, wait);
        }
        
        return result;
    }

    debounced.cancel = cancel;
    debounced.flush = flush;
    debounced.pending = pending;

    return debounced;
}

/**
 * Creates a throttled function that only invokes the provided function
 * at most once per every `wait` milliseconds.
 * 
 * @param {Function} func - The function to throttle
 * @param {number} wait - The number of milliseconds to throttle (default: 300)
 * @param {Object} options - Additional options
 * @param {boolean} options.leading - Invoke on the leading edge (default: true)
 * @param {boolean} options.trailing - Invoke on the trailing edge (default: true)
 * @returns {Function} The throttled function with a cancel() method
 * 
 * @example
 * const throttledScroll = throttle(() => {
 *     updateScrollPosition();
 * }, 100);
 * 
 * window.addEventListener('scroll', throttledScroll);
 */
export function throttle(func, wait = 300, options = {}) {
    const leading = options.leading ?? true;
    const trailing = options.trailing ?? true;

    return debounce(func, wait, {
        leading,
        trailing,
        maxWait: wait
    });
}

/**
 * Creates a function that will only execute once, no matter how many times it's called.
 * 
 * @param {Function} func - The function to wrap
 * @returns {Function} A function that only executes once
 * 
 * @example
 * const initialize = once(() => {
 *     console.log('Initialized!');
 * });
 * 
 * initialize(); // Logs "Initialized!"
 * initialize(); // Does nothing
 */
export function once(func) {
    let called = false;
    let result = null;

    return function(...args) {
        if (!called) {
            called = true;
            result = func.apply(this, args);
        }
        return result;
    };
}

/**
 * Creates a function that queues calls and executes them with a delay between each.
 * Useful for rate-limited APIs.
 * 
 * @param {Function} func - The function to queue
 * @param {number} delay - The delay between executions in milliseconds (default: 1000)
 * @returns {Function} A function that queues its calls
 * 
 * @example
 * const queuedFetch = rateLimit(fetchData, 1000);
 * 
 * // These will execute with 1 second delay between each
 * queuedFetch(1);
 * queuedFetch(2);
 * queuedFetch(3);
 */
export function rateLimit(func, delay = 1000) {
    const queue = [];
    let isProcessing = false;

    async function processQueue() {
        if (isProcessing || queue.length === 0) return;
        
        isProcessing = true;
        
        while (queue.length > 0) {
            const { args, thisArg, resolve, reject } = queue.shift();
            
            try {
                const result = await func.apply(thisArg, args);
                resolve(result);
            } catch (error) {
                reject(error);
            }
            
            if (queue.length > 0) {
                await new Promise(r => setTimeout(r, delay));
            }
        }
        
        isProcessing = false;
    }

    return function(...args) {
        return new Promise((resolve, reject) => {
            queue.push({ args, thisArg: this, resolve, reject });
            processQueue();
        });
    };
}

export default {
    debounce,
    throttle,
    once,
    rateLimit
};
