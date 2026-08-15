/**
 * Token Bucket Rate Limiter
 * Atomic Redis evaluation with Fail-Open resilience
 */

export const TOKEN_BUCKET_LUA_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local bucket_state = redis.call("HMGET", key, "tokens", "last_refill_time")
local tokens = tonumber(bucket_state[1])
local last_refill_time = tonumber(bucket_state[2])

if tokens == nil then
    tokens = capacity
    last_refill_time = now
else
    local time_passed = math.max(0, now - last_refill_time)
    local tokens_to_add = math.floor(time_passed * refill_rate)
    if tokens_to_add > 0 then
        tokens = math.min(capacity, tokens + tokens_to_add)
        last_refill_time = now
    end
end

local allowed = 0
if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "last_refill_time", last_refill_time)
local ttl = math.ceil(capacity / refill_rate) * 2
redis.call("EXPIRE", key, ttl)

return { allowed, tokens }
`;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
}

export interface RedisClientLike {
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export async function checkRateLimit(
  identifier: string,
  capacity: number = 20,
  refillPerMinute: number = 20,
  redis?: RedisClientLike
): Promise<RateLimitResult> {
  // If Redis is not supplied, fail open gracefully
  if (!redis) {
    return { success: true, limit: capacity, remaining: capacity };
  }

  try {
    const refillRate = refillPerMinute / 60; // tokens per second
    const now = Math.floor(Date.now() / 1000);
    const key = `ratelimit:upload:${identifier}`;

    const res = (await redis.eval(
      TOKEN_BUCKET_LUA_SCRIPT,
      1,
      key,
      capacity,
      refillRate,
      now,
      1
    )) as [number, number];

    const allowed = res[0] === 1;
    const remaining = res[1] ?? 0;

    return {
      success: allowed,
      limit: capacity,
      remaining,
    };
  } catch (error) {
    console.warn("Rate limit check failed, failing open:", error);
    return { success: true, limit: capacity, remaining: capacity };
  }
}
