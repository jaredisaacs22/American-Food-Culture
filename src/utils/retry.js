/**
 * Retry wrapper with exponential backoff.
 */
async function retry(fn, { attempts = 3, delayMs = 2000, label = 'operation' } = {}) {
  let lastError;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = i === attempts;
      const status = err.response?.status;

      // Don't retry on client errors (except rate limits)
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }

      if (!isLast) {
        const wait = delayMs * Math.pow(2, i - 1);
        console.warn(`  [Retry] ${label} failed (attempt ${i}/${attempts}): ${err.message}. Retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }

  throw lastError;
}

module.exports = { retry };
