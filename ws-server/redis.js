import Redis from "ioredis";

// Two separate connections are required:
//   - subscriber: once a connection enters subscribe mode it can only
//     send subscribe/unsubscribe/psubscribe/punsubscribe commands.
//   - publisher: used by the results-consumer (and any future producer)
//     to call PUBLISH.
export const publisher = new Redis(process.env.REDIS_URL);
const subscriber = new Redis(process.env.REDIS_URL);

publisher.on("error", (err) =>
  console.error("[redis publisher] connection error:", err.message)
);
subscriber.on("error", (err) =>
  console.error("[redis subscriber] connection error:", err.message)
);

// channel → Set<callback>
// Multiple socket subscriptions to the same submissionId share a single
// Redis channel subscription so we don't open O(n) Redis subscriptions.
const handlers = new Map();

subscriber.on("message", (channel, message) => {
  const cbs = handlers.get(channel);
  if (!cbs) return;
  // Iterate over a snapshot so callbacks can safely call unsubscribe().
  for (const cb of [...cbs]) {
    cb(message);
  }
});

/**
 * Subscribe to a Redis pub/sub channel.
 *
 * @param {string}   channel - e.g. "submission:abc-123"
 * @param {Function} cb      - called with the raw message string on publish
 * @returns {Function} unsubscribe — call to detach this callback
 */
export function subscribe(channel, cb) {
  if (!handlers.has(channel)) {
    handlers.set(channel, new Set());
    subscriber.subscribe(channel);
  }
  handlers.get(channel).add(cb);

  return function unsubscribe() {
    const cbs = handlers.get(channel);
    if (!cbs) return;
    cbs.delete(cb);
    if (cbs.size === 0) {
      handlers.delete(channel);
      subscriber.unsubscribe(channel);
    }
  };
}
