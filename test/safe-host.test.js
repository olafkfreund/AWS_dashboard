'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { safeHost } = require('../lib/safe-host');

test('accepts a plain hostname', () => {
  assert.strictEqual(safeHost('dashboard.example.com', 'fallback'), 'dashboard.example.com');
});

test('accepts host:port-free names with digits and hyphens', () => {
  assert.strictEqual(safeHost('aws-dash-01.internal', 'fb'), 'aws-dash-01.internal');
});

test('rejects CRLF header-injection and falls back', () => {
  assert.strictEqual(safeHost('evil.com\r\nSet-Cookie: x=1', 'fb'), 'fb');
});

test('rejects spaces / path chars and falls back', () => {
  assert.strictEqual(safeHost('evil.com/../admin', 'fb'), 'fb');
  assert.strictEqual(safeHost('has space', 'fb'), 'fb');
});

test('falls back on empty / undefined host', () => {
  assert.strictEqual(safeHost('', 'fb'), 'fb');
  assert.strictEqual(safeHost(undefined, 'fb'), 'fb');
});
