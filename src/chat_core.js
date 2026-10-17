// src/chat_core.js - Deterministic Domain Logic for Chat Validation and State
// Follows Power of 10 safety-critical constraints: bounded loops, explicit validation, small modular functions.

export const MAX_USERNAME_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 256;
export const MAX_HISTORY_CAPACITY = 50;
export const MIN_MESSAGE_INTERVAL_MS = 1000;

const USERNAME_REGEX = /^[a-zA-Z0-9_\- ]+$/;

/**
 * Validates and normalizes user display nicknames.
 * @param {unknown} name Input display name
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
export function validateUsername(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Nickname must be a string value.' };
  }

  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return { valid: false, error: 'Nickname must contain at least 1 non-whitespace character.' };
  }

  if (trimmed.length > MAX_USERNAME_LENGTH) {
    return { valid: false, error: `Nickname must not exceed ${MAX_USERNAME_LENGTH} characters.` };
  }

  if (!USERNAME_REGEX.test(trimmed)) {
    return { valid: false, error: 'Nickname may only contain alphanumeric characters, spaces, underscores, and hyphens.' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validates and normalizes chat message payloads.
 * @param {unknown} text Input message text
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
export function validateChatMessage(text) {
  if (typeof text !== 'string') {
    return { valid: false, error: 'Message content must be a string value.' };
  }

  const trimmed = text.trim();
  if (trimmed.length < 1) {
    return { valid: false, error: 'Message content cannot be empty.' };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message content must not exceed ${MAX_MESSAGE_LENGTH} characters.` };
  }

  return { valid: true, value: trimmed };
}

/**
 * Evaluates whether a client action violates the rate limit interval.
 * @param {number|undefined} lastTimestampMs Milliseconds timestamp of prior action
 * @param {number} currentTimestampMs Milliseconds timestamp of current action
 * @param {number} minIntervalMs Minimum elapsed interval permitted in milliseconds
 * @returns {boolean} True if the action is rate limited, false otherwise.
 */
export function isRateLimited(lastTimestampMs, currentTimestampMs, minIntervalMs = MIN_MESSAGE_INTERVAL_MS) {
  if (typeof lastTimestampMs !== 'number') {
    return false;
  }
  return (currentTimestampMs - lastTimestampMs) < minIntervalMs;
}

/**
 * Appends a message to a history queue with a statically bounded upper limit.
 * @param {Array<object>} history Existing history array
 * @param {object} message New message object to append
 * @param {number} maxCapacity Maximum capacity limit
 * @returns {Array<object>} Bounded history array
 */
export function appendBoundedHistory(history, message, maxCapacity = MAX_HISTORY_CAPACITY) {
  const source = Array.isArray(history) ? history : [];
  const updated = [...source, message];

  if (updated.length > maxCapacity) {
    return updated.slice(updated.length - maxCapacity);
  }
  return updated;
}
