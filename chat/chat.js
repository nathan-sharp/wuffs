// chat/chat.js - Client-Side WebSocket Realtime Chat Engine
// Adheres to OWASP ASVS V5 (context-aware DOM construction, strict XSS prevention)

(function () {
  'use strict';

  const STORAGE_KEY_NICKNAME = 'wuffs_chat_nickname';
  const PING_INTERVAL_MS = 30000;
  const MAX_RECONNECT_ATTEMPTS = 5;

  let socket = null;
  let pingTimer = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let currentNickname = loadOrCreateNickname();

  // DOM Elements
  const statusEl = document.getElementById('chat-status');
  const userCountEl = document.getElementById('chat-user-count');
  const chatLogEl = document.getElementById('chat-log');
  const usersUlEl = document.getElementById('users-ul');
  const inputNicknameEl = document.getElementById('input-nickname');
  const btnSetNicknameEl = document.getElementById('btn-set-nickname');
  const nicknameFeedbackEl = document.getElementById('nickname-feedback');
  const inputMessageEl = document.getElementById('input-message');
  const btnSendMessageEl = document.getElementById('btn-send-message');
  const charCountEl = document.getElementById('char-count');

  // Initialize UI state
  if (inputNicknameEl) {
    inputNicknameEl.value = currentNickname;
  }

  // Bind UI Events
  if (btnSetNicknameEl && inputNicknameEl) {
    btnSetNicknameEl.addEventListener('click', handleNicknameUpdate);
    inputNicknameEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        handleNicknameUpdate();
      }
    });
  }

  if (btnSendMessageEl && inputMessageEl) {
    btnSendMessageEl.addEventListener('click', handleSendMessage);
    inputMessageEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        handleSendMessage();
      }
    });
    inputMessageEl.addEventListener('input', function () {
      if (charCountEl) {
        charCountEl.textContent = `${inputMessageEl.value.length} / 256`;
      }
    });
  }

  // Connect to WebSocket server
  connectWebSocket();

  /**
   * Retrieves nickname from localStorage or generates an initial handle.
   * @returns {string}
   */
  function loadOrCreateNickname() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_NICKNAME);
      if (stored && stored.trim().length > 0) {
        return stored.trim().slice(0, 24);
      }
    } catch {
      // Storage unavailable in restricted sandbox
    }
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `Guest_${randomSuffix}`;
  }

  /**
   * Persists nickname to localStorage.
   * @param {string} name
   */
  function saveNickname(name) {
    try {
      localStorage.setItem(STORAGE_KEY_NICKNAME, name);
    } catch {
      // Storage unavailable
    }
  }

  /**
   * Builds the WebSocket URL from the active location.
   * @returns {string}
   */
  function getWebSocketUrl() {
    const isHttps = window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/room/websocket`;
  }

  /**
   * Establishes a WebSocket connection with backoff recovery.
   */
  function connectWebSocket() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    updateConnectionStatus('connecting');

    try {
      socket = new WebSocket(getWebSocketUrl());
    } catch (err) {
      scheduleReconnect();
      return;
    }

    socket.onopen = function () {
      reconnectAttempts = 0;
      updateConnectionStatus('connected');
      startPingHeartbeat();
      // Transmit join handshake
      sendJsonPayload({ type: 'join', name: currentNickname });
    };

    socket.onmessage = function (event) {
      handleSocketMessage(event.data);
    };

    socket.onclose = function () {
      stopPingHeartbeat();
      updateConnectionStatus('disconnected');
      scheduleReconnect();
    };

    socket.onerror = function () {
      if (socket) {
        socket.close();
      }
    };
  }

  /**
   * Schedules a reconnection attempt with exponential backoff.
   */
  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      appendSystemMessage('Unable to reconnect. Please refresh your browser.');
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 16000);
    reconnectAttempts++;

    reconnectTimer = setTimeout(function () {
      connectWebSocket();
    }, backoffMs);
  }

  /**
   * Periodically sends keepalive ping frames to the server.
   */
  function startPingHeartbeat() {
    stopPingHeartbeat();
    pingTimer = setInterval(function () {
      if (socket && socket.readyState === WebSocket.OPEN) {
        sendJsonPayload({ type: 'ping' });
      }
    }, PING_INTERVAL_MS);
  }

  /**
   * Clears active ping timer.
   */
  function stopPingHeartbeat() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  /**
   * Serializes and dispatches a JSON payload over the WebSocket.
   * @param {object} payload
   */
  function sendJsonPayload(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(payload));
      } catch {
        // Socket send failure
      }
    }
  }

  /**
   * Dispatches incoming WebSocket message data to handlers.
   * @param {string} rawData
   */
  function handleSocketMessage(rawData) {
    let payload;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }

    if (!payload || typeof payload !== 'object') {
      return;
    }

    switch (payload.type) {
      case 'history':
        handleHistoryPayload(payload.messages);
        break;
      case 'chat':
        appendChatMessage(payload.message);
        break;
      case 'presence':
        updatePresence(payload.count, payload.users);
        break;
      case 'system':
        appendSystemMessage(payload.text, payload.timestamp);
        break;
      case 'error':
        appendErrorMessage(payload.message);
        break;
      case 'pong':
        break;
      default:
        break;
    }
  }

  /**
   * Renders initial backlog history list.
   * @param {Array<object>} messages
   */
  function handleHistoryPayload(messages) {
    if (!chatLogEl || !Array.isArray(messages)) return;
    chatLogEl.textContent = ''; // Clear prior entries safely

    const count = Math.min(messages.length, 50);
    for (let i = 0; i < count; i++) {
      appendChatMessage(messages[i]);
    }
    appendSystemMessage('--- Connected to Cyberspace Chat ---');
  }

  /**
   * Updates UI presence counter and active users list.
   * @param {number} count
   * @param {Array<string>} users
   */
  function updatePresence(count, users) {
    if (userCountEl) {
      userCountEl.textContent = String(count || 0);
    }
    if (!usersUlEl || !Array.isArray(users)) return;

    usersUlEl.textContent = '';
    const maxUsers = Math.min(users.length, 100);
    for (let i = 0; i < maxUsers; i++) {
      const li = document.createElement('li');
      li.textContent = users[i];
      usersUlEl.appendChild(li);
    }
  }

  /**
   * Formats millisecond epoch timestamp as [HH:MM:SS].
   * @param {number} timestamp
   * @returns {string}
   */
  function formatTimestamp(timestamp) {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `[${hours}:${minutes}:${seconds}]`;
  }

  /**
   * Appends a user chat message using safe DOM construction (OWASP ASVS V5).
   * @param {object} message
   */
  function appendChatMessage(message) {
    if (!chatLogEl || !message) return;

    const line = document.createElement('div');
    line.className = 'chat-entry';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = formatTimestamp(message.timestamp) + ' ';

    const userSpan = document.createElement('span');
    userSpan.className = 'chat-author';
    userSpan.textContent = `<${message.name}>: `;

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = message.text;

    line.appendChild(timeSpan);
    line.appendChild(userSpan);
    line.appendChild(textSpan);

    chatLogEl.appendChild(line);
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
  }

  /**
   * Appends an informational system notice.
   * @param {string} text
   * @param {number} [timestamp]
   */
  function appendSystemMessage(text, timestamp) {
    if (!chatLogEl) return;

    const line = document.createElement('div');
    line.className = 'chat-entry chat-system-line';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = formatTimestamp(timestamp || Date.now()) + ' ';

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-system-text';
    textSpan.textContent = `* ${text}`;

    line.appendChild(timeSpan);
    line.appendChild(textSpan);

    chatLogEl.appendChild(line);
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
  }

  /**
   * Appends a highlighted error message.
   * @param {string} text
   */
  function appendErrorMessage(text) {
    if (!chatLogEl) return;

    const line = document.createElement('div');
    line.className = 'chat-entry chat-error-line';

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-error-text';
    textSpan.textContent = `[Error] ${text}`;

    line.appendChild(textSpan);

    chatLogEl.appendChild(line);
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
  }

  /**
   * Updates the UI connection status badge.
   * @param {'connected'|'connecting'|'disconnected'} state
   */
  function updateConnectionStatus(state) {
    if (!statusEl) return;

    statusEl.className = 'status-badge';
    if (state === 'connected') {
      statusEl.classList.add('badge-connected');
      statusEl.textContent = '● Connected';
    } else if (state === 'connecting') {
      statusEl.classList.add('badge-connecting');
      statusEl.textContent = '○ Connecting...';
    } else {
      statusEl.classList.add('badge-disconnected');
      statusEl.textContent = '✕ Disconnected';
    }
  }

  /**
   * Handles user submission of a new chat message.
   */
  function handleSendMessage() {
    if (!inputMessageEl) return;

    const text = inputMessageEl.value.trim();
    if (text.length === 0) return;

    sendJsonPayload({ type: 'chat', text });

    inputMessageEl.value = '';
    if (charCountEl) {
      charCountEl.textContent = '0 / 256';
    }
    inputMessageEl.focus();
  }

  /**
   * Handles user update of their display nickname.
   */
  function handleNicknameUpdate() {
    if (!inputNicknameEl) return;

    const newNick = inputNicknameEl.value.trim();
    if (newNick.length === 0) {
      showNicknameFeedback('Nickname cannot be empty.', true);
      return;
    }

    if (!/^[a-zA-Z0-9_\- ]+$/.test(newNick)) {
      showNicknameFeedback('Letters, numbers, spaces, _ and - only.', true);
      return;
    }

    currentNickname = newNick;
    saveNickname(newNick);
    sendJsonPayload({ type: 'join', name: currentNickname });
    showNicknameFeedback('Handle updated!', false);
  }

  /**
   * Shows feedback indicator for nickname updates.
   * @param {string} message
   * @param {boolean} isError
   */
  function showNicknameFeedback(message, isError) {
    if (!nicknameFeedbackEl) return;

    nicknameFeedbackEl.textContent = message;
    nicknameFeedbackEl.style.color = isError ? '#FF6B6B' : '#75FF75';

    setTimeout(function () {
      nicknameFeedbackEl.textContent = '';
    }, 3000);
  }
})();
