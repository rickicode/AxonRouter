/**
 * Rate Limit Semaphore
 * 
 * Semaphore-based concurrency control for round-robin combo strategy.
 */

const semaphores = new Map();

/**
 * Acquire a semaphore slot
 * @param {string} key - Semaphore key
 * @param {Object} options - { maxConcurrency, timeoutMs }
 * @returns {Promise<Function>} Release function
 */
export async function acquire(key, options: any = {}) {
  const { maxConcurrency = 3, timeoutMs = 30000 } = options;
  
  if (!semaphores.has(key)) {
    semaphores.set(key, {
      count: 0,
      max: maxConcurrency,
      queue: [],
      rateLimited: false,
      rateLimitedUntil: 0,
    });
  }
  
  const sem = semaphores.get(key);
  sem.max = maxConcurrency;
  
  // Check rate limiting
  if (sem.rateLimited && Date.now() < sem.rateLimitedUntil) {
    const error: any = new Error("Semaphore rate limited");
    error.code = "SEMAPHORE_RATE_LIMITED";
    throw error;
  }
  
  // Immediate slot available
  if (sem.count < sem.max) {
    sem.count++;
    return () => release(key);
  }
  
  // Queue with timeout
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = sem.queue.indexOf({ resolve, reject });
      if (idx !== -1) sem.queue.splice(idx, 1);
      reject(new Error("Semaphore timeout"));
    }, timeoutMs);
    
    sem.queue.push({
      resolve: (val) => {
        clearTimeout(timeout);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

function release(key) {
  const sem = semaphores.get(key);
  if (!sem) return;
  
  sem.count = Math.max(0, sem.count - 1);
  
  // Process queue
  if (sem.queue.length > 0 && sem.count < sem.max) {
    const next = sem.queue.shift();
    sem.count++;
    next.resolve();
  }
}

/**
 * Mark a semaphore as rate limited
 * @param {string} key - Semaphore key
 * @param {number} cooldownMs - Cooldown duration
 */
export function markRateLimited(key, cooldownMs) {
  const sem = semaphores.get(key);
  if (!sem) return;
  
  sem.rateLimited = true;
  sem.rateLimitedUntil = Date.now() + cooldownMs;
  
  // Auto-clear rate limiting
  setTimeout(() => {
    if (sem) {
      sem.rateLimited = false;
      sem.rateLimitedUntil = 0;
    }
  }, cooldownMs);
}
