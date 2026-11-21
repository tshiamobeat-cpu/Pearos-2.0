const buckets = new Map();

/**
 * Small fixed-window limiter used to keep active testing rate-limited.
 * Keyed by client address + bucket name so one tool cannot exhaust another.
 */
export function rateLimit({ name, windowMs = 60_000, max = 10 }) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || now > entry.reset) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) {
      const retry = Math.ceil((entry.reset - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({
        error: 'rate_limited',
        message: `Rate limit reached for ${name}. Try again in ${retry}s. SHADOW X keeps all testing slow and safe.`
      });
      return;
    }
    next();
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
