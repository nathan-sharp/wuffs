// tests/chat_room.test.js - Unit tests adhering to IEEE 29119 Arrange-Act-Assert (AAA) pattern
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUsername,
  validateChatMessage,
  isRateLimited,
  appendBoundedHistory,
  MAX_USERNAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_HISTORY_CAPACITY,
  MIN_MESSAGE_INTERVAL_MS,
} from '../src/chat_core.js';

test('validateUsername accepts compliant display nicknames', () => {
  // Arrange
  const inputNickname = '  Nathan_Wuff-01  ';

  // Act
  const result = validateUsername(inputNickname);

  // Assert
  assert.equal(result.valid, true);
  assert.equal(result.value, 'Nathan_Wuff-01');
});

test('validateUsername rejects non-string values', () => {
  // Arrange
  const invalidInput = 12345;

  // Act
  const result = validateUsername(invalidInput);

  // Assert
  assert.equal(result.valid, false);
  assert.match(result.error, /string value/i);
});

test('validateUsername rejects empty or whitespace-only inputs', () => {
  // Arrange
  const emptyInput = '     ';

  // Act
  const result = validateUsername(emptyInput);

  // Assert
  assert.equal(result.valid, false);
  assert.match(result.error, /at least 1/i);
});

test('validateUsername rejects nicknames exceeding maximum character bound', () => {
  // Arrange
  const oversizedName = 'A'.repeat(MAX_USERNAME_LENGTH + 1);

  // Act
  const result = validateUsername(oversizedName);

  // Assert
  assert.equal(result.valid, false);
  assert.match(result.error, /exceed/i);
});

test('validateUsername rejects nicknames containing disallowed characters', () => {
  // Arrange
  const maliciousName = '<script>';

  // Act
  const result = validateUsername(maliciousName);

  // Assert
  assert.equal(result.valid, false);
  assert.match(result.error, /alphanumeric/i);
});

test('validateChatMessage accepts compliant text messages', () => {
  // Arrange
  const validMessage = '  Hello everyone in cyberspace!  ';

  // Act
  const result = validateChatMessage(validMessage);

  // Assert
  assert.equal(result.valid, true);
  assert.equal(result.value, 'Hello everyone in cyberspace!');
});

test('validateChatMessage rejects empty or whitespace-only messages', () => {
  // Arrange
  const emptyMessage = '\t  \n';

  // Act
  const result = validateChatMessage(emptyMessage);

  // Assert
  assert.equal(result.valid, false);
  assert.match(result.error, /cannot be empty/i);
});

test('validateChatMessage rejects messages exceeding 256 characters', () => {
  // Arrange
  const oversizedMessage = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);

  // Act
  const result = validateChatMessage(oversizedMessage);

  // Assert
  assert.equal(result.valid, false);
  assert.match(result.error, /exceed/i);
});

test('isRateLimited allows actions when no prior action timestamp exists', () => {
  // Arrange
  const lastTimestamp = undefined;
  const currentTimestamp = 10000;

  // Act
  const limited = isRateLimited(lastTimestamp, currentTimestamp, MIN_MESSAGE_INTERVAL_MS);

  // Assert
  assert.equal(limited, false);
});

test('isRateLimited blocks actions occurring before minimum interval elapses', () => {
  // Arrange
  const lastTimestamp = 10000;
  const currentTimestamp = 10500; // 500 ms elapsed, requires 1000 ms

  // Act
  const limited = isRateLimited(lastTimestamp, currentTimestamp, MIN_MESSAGE_INTERVAL_MS);

  // Assert
  assert.equal(limited, true);
});

test('isRateLimited allows actions after minimum interval elapses', () => {
  // Arrange
  const lastTimestamp = 10000;
  const currentTimestamp = 11000; // 1000 ms elapsed

  // Act
  const limited = isRateLimited(lastTimestamp, currentTimestamp, MIN_MESSAGE_INTERVAL_MS);

  // Assert
  assert.equal(limited, false);
});

test('appendBoundedHistory preserves FIFO order and enforces upper capacity bound', () => {
  // Arrange
  const initialHistory = [];
  for (let i = 0; i < MAX_HISTORY_CAPACITY; i++) {
    initialHistory.push({ id: `msg-${i}`, text: `Message ${i}` });
  }
  const overflowMessage = { id: 'overflow', text: '51st Message' };

  // Act
  const resultHistory = appendBoundedHistory(initialHistory, overflowMessage, MAX_HISTORY_CAPACITY);

  // Assert
  assert.equal(resultHistory.length, MAX_HISTORY_CAPACITY);
  assert.equal(resultHistory[0].id, 'msg-1'); // Oldest entry msg-0 was dropped
  assert.equal(resultHistory[MAX_HISTORY_CAPACITY - 1].id, 'overflow');
});
