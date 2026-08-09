import { connection } from "./whatsapp.queue.js";

const WINDOW_MS = 1000;
const RETRY_DELAY_MS = 200;
const RETRY_ATTEMPTS = 3;
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
  return 0
end

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, window * 2)
return 1
`;

export async function reserveWhatsAppSendSlot(scopeId, jobId) {
  const key = `wa:rate:${scopeId}`;
  const member = String(jobId);

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
    const reserved = await connection.eval(
      RESERVE_SLOT_SCRIPT,
      1,
      key,
      Date.now(),
      WINDOW_MS,
      MAX_SENDS_PER_WINDOW,
      member,
    );
    if (Number(reserved) === 1) return true;
    if (attempt < RETRY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return false;
}
