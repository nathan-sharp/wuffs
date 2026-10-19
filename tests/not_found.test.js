// tests/not_found.test.js - Unit tests for 404 page and Worker fallback adhering to IEEE 29119
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import worker from '../src/worker.js';

test('404.html exists and adheres to structure and security specifications', () => {
  // Arrange
  const filePath = join(process.cwd(), '404.html');

  // Act
  const fileExists = existsSync(filePath);
  const content = readFileSync(filePath, 'utf8');

  // Assert
  assert.equal(fileExists, true, '404.html must exist at the workspace root');
  assert.match(content, /<!DOCTYPE html>/i, 'Must contain valid HTML5 doctype');
  assert.match(content, /<title>Problem loading page - 404 Not Found<\/title>/i, 'Must have descriptive title');
  assert.match(content, /\/media\/no-connection\.png/, 'Must reference user OC image');
  assert.match(content, /Looks like there’s a problem with this site/, 'Must include Firefox error heading');
  assert.match(content, /What can you do about it\?/, 'Must include Firefox error subheading');
  assert.match(content, /Check to make sure you’ve typed the web site address correctly\./, 'Must include address check bullet');
  assert.match(content, /The site could be temporarily unavailable or too busy\./, 'Must include busy site bullet');
  assert.match(content, /Try Again/, 'Must include Try Again button');
  assert.match(content, /<link rel="stylesheet" href="\/styles\.css">/i, 'Must link to main styles.css');
  assert.doesNotMatch(content, /<style[\s>]/i, 'Must not duplicate styles in inline style block');
  assert.match(content, /class="retro-button"/, 'Must use retro-button styling matching site');
  assert.match(content, /id="server-hostname"/, 'Must contain server-hostname target element');
  assert.match(content, /textContent\s*=\s*window\.location\.hostname/, 'Must safely escape hostname via textContent (OWASP ASVS V5)');
});

test('worker.fetch serves 404.html with status 404 when requested asset is not found', async () => {
  // Arrange
  const request = new Request('https://www.wuffs.xyz/non-existent-page');
  const mock404Html = '<html><body><h1>404 Page</h1></body></html>';

  const mockEnv = {
    ASSETS: {
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/404.html') {
          return new Response(mock404Html, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    },
  };

  // Act
  const response = await worker.fetch(request, mockEnv, {});

  // Assert
  assert.equal(response.status, 404, 'Response status must be 404');
  assert.equal(response.statusText, 'Not Found');
  const bodyText = await response.text();
  assert.equal(bodyText, mock404Html, 'Response body must be the 404.html content');
});

test('worker.fetch serves normal asset when asset exists', async () => {
  // Arrange
  const request = new Request('https://www.wuffs.xyz/styles.css');
  const mockCss = 'body { margin: 0; }';

  const mockEnv = {
    ASSETS: {
      async fetch() {
        return new Response(mockCss, {
          status: 200,
          headers: { 'Content-Type': 'text/css' },
        });
      },
    },
  };

  // Act
  const response = await worker.fetch(request, mockEnv, {});

  // Assert
  assert.equal(response.status, 200);
  const bodyText = await response.text();
  assert.equal(bodyText, mockCss);
});

test('worker.fetch returns 404 text response when ASSETS binding is missing', async () => {
  // Arrange
  const request = new Request('https://www.wuffs.xyz/unknown');
  const mockEnv = {};

  // Act
  const response = await worker.fetch(request, mockEnv, {});

  // Assert
  assert.equal(response.status, 404);
  const bodyText = await response.text();
  assert.equal(bodyText, 'Not Found');
});

test('worker.fetch follows 307 canonical redirect when ASSETS normalizes 404.html to /404', async () => {
  // Arrange
  const request = new Request('https://www.wuffs.xyz/missing-subpage');
  const mock404Html = '<html><body><h1>Custom 404 Error</h1></body></html>';
  const fetchCalls = [];

  const mockEnv = {
    ASSETS: {
      async fetch(req) {
        const url = new URL(req.url);
        fetchCalls.push(url.pathname);

        if (url.pathname === '/404.html') {
          return new Response(null, {
            status: 307,
            headers: { Location: '/404' },
          });
        }
        if (url.pathname === '/404') {
          return new Response(mock404Html, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('', { status: 404 });
      },
    },
  };

  // Act
  const response = await worker.fetch(request, mockEnv, {});

  // Assert
  assert.equal(response.status, 404, 'Response status must be 404');
  assert.equal(response.statusText, 'Not Found');
  const bodyText = await response.text();
  assert.equal(bodyText, mock404Html, 'Body must contain the 404 HTML retrieved after redirect');
  assert.deepEqual(fetchCalls, ['/missing-subpage', '/404.html', '/404']);
});

test('worker.fetch serves pre-populated 404 asset when not_found_handling is active', async () => {
  // Arrange
  const request = new Request('https://www.wuffs.xyz/missing-static');
  const mockNative404Html = '<html><body><h1>Native Edge 404</h1></body></html>';
  let secondaryFetchTriggered = false;

  const mockEnv = {
    ASSETS: {
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/missing-static') {
          return new Response(mockNative404Html, {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        secondaryFetchTriggered = true;
        return new Response('Not Found', { status: 404 });
      },
    },
  };

  // Act
  const response = await worker.fetch(request, mockEnv, {});

  // Assert
  assert.equal(response.status, 404);
  const bodyText = await response.text();
  assert.equal(bodyText, mockNative404Html);
  assert.equal(secondaryFetchTriggered, false, 'Should not trigger secondary asset fetches if 404 body is populated');
});

