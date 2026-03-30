import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const read = relativePath => readFileSync(join(root, relativePath), 'utf8');

const indexHtml = read('index.html');
const scriptsJs = read('scripts.js');

const defaultProfileImage = indexHtml.match(/<img[\s\S]*?class="profile-image default"[\s\S]*?>/);

assert.ok(defaultProfileImage, 'expected a default profile image in the homepage hero');
assert.match(
  indexHtml,
  /<h1 class="hero-title">Haokai Ding<\/h1>/,
  'expected the homepage hero to expose a real h1 for document structure and SEO',
);
assert.match(
  defaultProfileImage[0],
  /fetchpriority="high"/,
  'expected the default hero image to be marked as a high-priority fetch',
);
assert.doesNotMatch(
  defaultProfileImage[0],
  /loading="lazy"/,
  'expected the default hero image to avoid lazy loading because it is above the fold',
);
assert.doesNotMatch(
  indexHtml,
  /<h2>visitors<\/h2>/i,
  'expected the visitor section to stop presenting itself like a main content heading',
);
assert.match(
  indexHtml,
  /class="footer-label"/,
  'expected the footer to use a lower-emphasis visitor label',
);
assert.doesNotMatch(
  indexHtml,
  /site\/1bh9v/,
  'expected old ClustrMaps fallback links to be removed',
);
assert.match(
  indexHtml,
  /site\/1c87l/,
  'expected ClustrMaps fallback links to use the live visitor page id',
);
assert.match(
  scriptsJs,
  /const explicitDate = target\.getAttribute\('datetime'\)\?\.trim\(\);/,
  'expected updateLastUpdated to respect an explicit content date before any fallback',
);

console.log('site-content checks passed');
