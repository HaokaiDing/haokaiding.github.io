import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = relativePath => readFileSync(join(root, relativePath), 'utf8');

const indexHtml = read('index.html');
const publicationsHtml = read('publications.html');
const contactHtml = read('contact.html');

assert.match(
  publicationsHtml,
  /<link rel="canonical" href="https:\/\/hkding0125\.github\.io\/publications\.html" \/>/,
  'expected publications page to define a canonical URL',
);
assert.match(
  publicationsHtml,
  /<meta property="og:title" content="Publications · Haokai Ding" \/>/,
  'expected publications page to define Open Graph metadata',
);
assert.match(
  publicationsHtml,
  /<meta name="twitter:card" content="summary" \/>/,
  'expected publications page to define a Twitter card',
);
assert.match(
  publicationsHtml,
  /<time id="lastUpdated" datetime="2026-03-30">2026-03-30<\/time>/,
  'expected publications page to expose an explicit content update date',
);
assert.match(
  publicationsHtml,
  /<h2>overview<\/h2>/,
  'expected publications page to include a compact overview section before the paper list',
);
assert.match(
  publicationsHtml,
  /2025 snapshot/i,
  'expected publications page to include a snapshot summary',
);
assert.match(
  publicationsHtml,
  /Google Scholar<\/a>[\s\S]*ORCID<\/a>[\s\S]*CV<\/a>/,
  'expected publications page to include quick links for scholar, ORCID, and CV',
);

assert.match(
  contactHtml,
  /<link rel="canonical" href="https:\/\/hkding0125\.github\.io\/contact\.html" \/>/,
  'expected contact page to define a canonical URL',
);
assert.match(
  contactHtml,
  /<meta property="og:title" content="Contact · Haokai Ding" \/>/,
  'expected contact page to define Open Graph metadata',
);
assert.match(
  contactHtml,
  /<meta name="twitter:card" content="summary" \/>/,
  'expected contact page to define a Twitter card',
);
assert.match(
  contactHtml,
  /<h1>contact<\/h1>/i,
  'expected contact page to expose a real h1 title',
);
assert.match(
  contactHtml,
  /<time id="lastUpdated" datetime="2026-03-30">2026-03-30<\/time>/,
  'expected contact page to expose an explicit content update date',
);
assert.match(
  contactHtml,
  /<h2>research contact<\/h2>/i,
  'expected contact page to include a research-contact guidance section',
);
assert.match(
  contactHtml,
  /When emailing:[\s\S]*include your affiliation/i,
  'expected contact page to explain what context to include in outreach emails',
);
assert.doesNotMatch(
  contactHtml,
  /Best for:/i,
  'expected the research-contact section to remove the extra collaboration guidance line',
);
assert.doesNotMatch(
  contactHtml,
  /primary inbox/i,
  'expected the research-contact section to remove the inbox preference line',
);
assert.match(
  contactHtml,
  /assets\/images\/ditang-wechat-qr\.jpg/,
  'expected contact page to include the WeChat QR image asset',
);
assert.match(
  contactHtml,
  /Open WeChat QR/i,
  'expected contact page to provide a click-to-open WeChat QR link',
);
assert.match(
  contactHtml,
  /href="assets\/images\/ditang-wechat-qr\.jpg"[\s\S]*>Open WeChat QR</i,
  'expected the WeChat QR link to point to the QR asset',
);
assert.match(
  contactHtml,
  /id="contact"[\s\S]*assets\/images\/ditang-wechat-qr\.jpg[\s\S]*id="research-contact"/,
  'expected the WeChat QR to appear in the main contact block before the research-contact section',
);
assert.doesNotMatch(
  contactHtml,
  /<img[\s\S]*ditang-wechat-qr\.jpg/i,
  'expected the WeChat QR image to stop rendering inline on the page',
);

assert.doesNotMatch(
  indexHtml,
  /http:\/\/www\.moe\.gov\.cn/,
  'expected the remaining Ministry of Education link to use https',
);

console.log('secondary-page checks passed');
