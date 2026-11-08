import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffSeconds, grantedTokens } from '../src/policy.ts';

test('backoff: ceiling doubles every attempt', () => {
  const max = () => 1; // worst-case jitter
  assert.equal(backoffSeconds(1, 2, 900, max), 2);
  assert.equal(backoffSeconds(2, 2, 900, max), 4);
  assert.equal(backoffSeconds(3, 2, 900, max), 8);
  assert.equal(backoffSeconds(5, 2, 900, max), 32);
});

test('backoff: never exceeds the cap', () => {
  assert.equal(backoffSeconds(30, 2, 900, () => 1), 900);
});

test('backoff: full jitter spans [0, ceiling]', () => {
  assert.equal(backoffSeconds(4, 2, 900, () => 0), 0);
  assert.equal(backoffSeconds(4, 2, 900, () => 0.5), 8);
});

test('backoff: attempt 0 or negative is treated as the first attempt', () => {
  assert.equal(backoffSeconds(0, 2, 900, () => 1), 2);
});

test('rate limit: grants everything while under budget', () => {
  assert.equal(grantedTokens(3, 3, 5), 3); // window was empty, took 3 of 5
});

test('rate limit: grants only the remainder when budget runs out', () => {
  assert.equal(grantedTokens(7, 4, 5), 2); // 3 already used, 2 left
});

test('rate limit: grants nothing once the window is exhausted', () => {
  assert.equal(grantedTokens(9, 4, 5), 0);
});

test('rate limit: never returns a negative number', () => {
  assert.equal(grantedTokens(100, 1, 5), 0);
});
