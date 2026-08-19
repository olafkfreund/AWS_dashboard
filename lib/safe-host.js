'use strict';

// Validate a Host header value before it is echoed back or used to build a
// redirect. A hostname is only letters, digits, dots and hyphens; anything
// else (CRLF, spaces, path chars) is a header-injection / open-redirect
// attempt, so fall back to a known-good value.
function safeHost(host, fallback) {
  return /^[a-zA-Z0-9.-]+$/.test(host || '') ? host : fallback;
}

module.exports = { safeHost };
