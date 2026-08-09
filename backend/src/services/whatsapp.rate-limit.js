import { connection } from "./whatsapp.queue.js";

const WINDOW_MS = 1000;
const configuredLimit = Number(process.env.WHATSAPP_SEND_RATE_PER_SECOND || 75);
const MAX_SENDS_PER_WINDOW = Number.isFinite(configuredLimit) && configuredLimit > 0
  ? Math.floor(configuredLimit)
  : 75;

const RESERVE_SLOT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
if redis.call("ZCARD", key) >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  if oldest[2] then
    return math.max(1, window - (now - tonumber(oldest[2])))
  end
  return window
end

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, window * 2)
return 0
`;

export async function reserveWhatsAppSendSlot(scopeId, jobId) {
  const key = `wa:rate:${scopeId}`;

  while (true) {
    const now = Date.now();
    const waitMs = Number(await connection.eval(
      RESERVE_SLOT_SCRIPT,
      1,
      key,
      now,
      WINDOW_MS,
      MAX_SENDS_PER_WINDOW,
      `${jobId}:${now}`,
    ));
    if (waitMs <= 0) return true;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
