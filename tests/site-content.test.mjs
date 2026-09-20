import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const read = relativePath => readFileSync(join(root, relativePath), 'utf8');

const indexHtml = read('index.html');
const scriptsJs = read('scripts.js');
const stylesCss = read('styles.css');

const consoleHero = indexHtml.match(
  /<header class="hero" id="top">[\s\S]*?<\/header>/,
);
const heroAcknowledgment = consoleHero?.[0].match(
  /<p class="hero-acknowledgment">[\s\S]*?<\/p>/,
);
const defaultProfileImage = indexHtml.match(/<img[\s\S]*?class="profile-image default"[\s\S]*?>/);
const selectedPublications = indexHtml.match(
  /<section class="content-section latest-publications" id="publications">[\s\S]*?<\/section>/,
);
const featuredPapers = selectedPublications?.[0].match(
  /<article class="paper-showcase"[\s\S]*?<\/article>/g,
) ?? [];
const irosPaper = featuredPapers.find(item => item.includes('id="paper-iros-2025"'));
const casePaper = featuredPapers.find(item => item.includes('id="paper-case-2025"'));
const xScholarItem = indexHtml.match(
  /<article class="detail-item">[\s\S]*?Tsinghua University Tsien Excellence in Engineering Program[\s\S]*?<\/article>/,
);
const experienceSection = indexHtml.match(
  /<section class="content-section" id="experience">[\s\S]*?<\/section>/,
);
const sjtuExperienceItem = experienceSection?.[0].match(
  /<article class="detail-item">[\s\S]*?Visiting Student ·[\s\S]*?<\/article>/,
);

assert.ok(consoleHero, 'expected the restored console hero on the homepage');
assert.ok(defaultProfileImage, 'expected a default profile image in the homepage hero');
assert.match(
  consoleHero[0],
  /<h1 class="hero-title">Haokai Ding<\/h1>/,
  'expected the homepage hero to expose a real h1 for document structure and SEO',
);
assert.match(
  consoleHero[0],
  /<p class="hero-status">[\s\S]*M\.Sc\. Student in Robotics @ [\s\S]*>MBZUAI<\/a>[\s\S]*<\/p>/,
  'expected the homepage hero to expose a compact identity line',
);
assert.doesNotMatch(consoleHero[0].match(/<p class="hero-status">[\s\S]*?<\/p>/)?.[0] ?? '', /B\.Eng\.|Shenzhen Technology University/);
for (const researchInterest of [
  /underactuated manipulation/,
  /aerial robotics/,
  /deployment-focused robot learning/,
]) {
  assert.match(consoleHero[0], researchInterest);
}
assert.ok(heroAcknowledgment, 'expected the homepage hero to retain its peer-advisor acknowledgment');
assert.match(heroAcknowledgment[0], /thanks|grateful/i);
assert.match(heroAcknowledgment[0], /peer advisor/);
assert.match(
  heroAcknowledgment[0],
  /<a href="https:\/\/yinsumirage\.github\.io\/" target="_blank" rel="noopener noreferrer">Wentao Guo<\/a>/,
  'expected the homepage hero to thank peer advisor Wentao Guo and link his homepage',
);
assert.match(heroAcknowledgment[0], /guidance|mentorship/);
assert.match(heroAcknowledgment[0], /research/);
assert.match(heroAcknowledgment[0], /graduate application/);
assert.match(consoleHero[0], /I am (?:also )?an X Scholar/);
assert.match(consoleHero[0], /X Scholar[\s\S]*through September 2026/);
assert.match(consoleHero[0], /Tsinghua University/);
assert.match(consoleHero[0], /Shenzhen X-Institute/);
assert.doesNotMatch(consoleHero[0], /class="intro-kicker"|# Robotics|I am an M\.Sc\. student in Robotics at/);
assert.match(
  consoleHero[0],
  /href="assets\/pdfs\/haokai-ding-cv\.pdf"[^>]*>CV<\/a>/,
  'expected the homepage to link to the current CV PDF',
);
assert.match(consoleHero[0], /href="mailto:ditang0125@gmail\.com">Email<\/a>/);
assert.match(consoleHero[0], /href="https:\/\/orcid\.org\/0009-0001-6158-9897"[^>]*>ORCID<\/a>/);
assert.match(
  indexHtml,
  /<span class="site-mark-prompt">:~#<\/span>/,
  'expected the restored console prompt in the site mark',
);
assert.match(
  indexHtml,
  /<button id="theme-switcher" type="button" aria-label="Toggle dark mode">/,
  'expected the restored console theme switcher',
);
assert.doesNotMatch(
  indexHtml,
  /<aside class="sidebar"|class="page-layout"|class="hero-statement"/,
  'expected the sidebar redesign to be absent from the restored homepage',
);
assert.match(
  indexHtml,
  /<link rel="canonical" href="https:\/\/haokaiding\.github\.io\/" \/>/,
  'expected the GitHub Pages canonical host to remain unchanged',
);
assert.match(
  indexHtml,
  /<link rel="icon" type="image\/png" href="assets\/images\/favicon-haokai-line\.png" \/>/,
  'expected the homepage favicon to use the local Haokai line-art asset',
);
assert.doesNotMatch(indexHtml, /data:image\/svg\+xml[\s\S]*%3EHD%3C/);
assert.match(
  indexHtml,
  /<meta property="og:url" content="https:\/\/haokaiding\.github\.io\/" \/>/,
  'expected Open Graph metadata to retain the GitHub Pages host',
);
assert.match(
  indexHtml,
  /"jobTitle": "M\.Sc\. Student in Robotics"/,
  'expected structured data to preserve the current degree status',
);
assert.ok(selectedPublications, 'expected a selected publications section');
assert.equal(featuredPapers.length, 2, 'expected exactly two featured homepage papers');
assert.ok(irosPaper, 'expected the IROS featured paper');
assert.ok(casePaper, 'expected the CASE featured paper');
assert.match(irosPaper, /<span class="paper-venue-tag">IROS 2025 · Oral<\/span>/);
assert.match(irosPaper, /<figure class="paper-media">[\s\S]*?<div class="paper-frame">/);
assert.match(irosPaper, /<img class="paper-preview" src="assets\/images\/pubs\/fig-iros-grasps\.webp" alt="Semi-Peaucellier gripper grasping six objects of different shapes and sizes" width="640" height="410" loading="lazy" decoding="async">/);
assert.match(irosPaper, /<a class="inline-link pdf-link" href="assets\/pdfs\/iros-2025-semi-peaucellier-gripper\.pdf" data-pdf="assets\/pdfs\/iros-2025-semi-peaucellier-gripper\.pdf"[^>]*aria-label="PDF: IROS 2025 Semi-Peaucellier gripper">/);
assert.match(irosPaper, /<a class="inline-link video-link" href="assets\/videos\/semi-peaucellier-gripper-demo-compressed\.mp4" data-video="assets\/videos\/semi-peaucellier-gripper-demo-compressed\.mp4"[^>]*aria-label="Demo video: IROS 2025 Semi-Peaucellier gripper">/);
assert.match(casePaper, /<span class="paper-venue-tag">CASE 2025 · Oral<\/span>/);
assert.match(casePaper, /<figure class="paper-media">[\s\S]*?<div class="paper-frame">/);
assert.match(casePaper, /<img class="paper-preview" src="assets\/images\/pubs\/fig-case-grasps\.webp" alt="SP-Diff gripper demonstrating six grasp configurations" width="640" height="346" loading="lazy" decoding="async">/);
assert.match(casePaper, /<a class="inline-link pdf-link" href="assets\/pdfs\/case-2025-semi-peaucellier-linkage\.pdf" data-pdf="assets\/pdfs\/case-2025-semi-peaucellier-linkage\.pdf"[^>]*aria-label="PDF: CASE 2025 SP-Diff gripper">/);
assert.doesNotMatch(selectedPublications[0], /<button[^>]*class="[^"]*(?:pdf-link|video-link)/);
assert.doesNotMatch(selectedPublications[0], /paper-venue-tag[^>]*aria-hidden="true"/);
assert.doesNotMatch(selectedPublications[0], /<figcaption|paper-takeaway/);
assert.ok(xScholarItem, 'expected the X Scholar education item');
assert.match(xScholarItem[0], /<div class="detail-side">2023\.09–2026\.09<\/div>/);
assert.doesNotMatch(xScholarItem[0], /2023\.09–present/);
assert.ok(sjtuExperienceItem, 'expected the SJTU visiting-student experience item');
assert.match(sjtuExperienceItem[0], /State Key Laboratory of Mechanical System and Vibration/);
assert.match(sjtuExperienceItem[0], /Shanghai(?:\s|&nbsp;)+Jiao(?:\s|&nbsp;)+Tong(?:\s|&nbsp;)+University/);
assert.match(sjtuExperienceItem[0], /Worked with Prof\. Wei Dong/);
assert.match(sjtuExperienceItem[0], /<div class="detail-side">2026\.02–2026\.08<\/div>/);
assert.doesNotMatch(sjtuExperienceItem[0], /present|developing/);
assert.doesNotMatch(indexHtml, /currently a visiting student|Ongoing visiting work/);
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
  /mapmyvisitors|clustrmaps/i,
  'expected the third-party visitor-map widget to be fully removed',
);
assert.match(
  indexHtml,
  /id="visitor-dots"/,
  'expected the inline world-map SVG with a dots group to be present',
);
assert.match(
  indexHtml,
  /assets\/js\/visitor-map\.js/,
  'expected the self-hosted visitor-map module to be loaded',
);
assert.match(
  indexHtml,
  /href="https:\/\/visitors\.haokaiding\.qzz\.io\/stats"/,
  'expected the footer map to link through to the public stats page',
);
assert.match(
  scriptsJs,
  /const explicitDate = target\.getAttribute\('datetime'\)\?\.trim\(\);/,
  'expected updateLastUpdated to respect an explicit content date before any fallback',
);
assert.match(
  scriptsJs,
  /trigger:\s*'\.image-link'/,
  'expected scripts.js to register image-link clicks in the shared modal registry',
);
assert.match(scriptsJs, /trigger:\s*'\.pdf-link'/);
assert.match(scriptsJs, /trigger:\s*'\.video-link'/);
assert.match(
  scriptsJs,
  /event\.target\.closest\(entry\.trigger\)/,
  'expected scripts.js to handle modal triggers via a single delegated handler (no double binding)',
);
assert.match(
  scriptsJs,
  /themeSwitcher\?\.addEventListener\('click'/,
  'expected the restored dark-mode control to remain functional',
);
assert.match(
  stylesCss,
  /\.image-panel\s*\{[^}]*width:\s*min\(92vw,\s*420px\)/,
  'expected the QR image modal to use a smaller width cap',
);
assert.match(
  stylesCss,
  /\.contact-block \.inline-link\s*\{[^}]*color:\s*inherit/,
  'expected the Wechat trigger in the contact list to inherit the same color as the other contact links',
);
assert.match(stylesCss, /\.selected-list > \.publication-item > \.paper-showcase\s*\{[^}]*display:\s*grid/);
assert.match(stylesCss, /\.paper-media\s*\{[^}]*position:\s*relative/);
assert.match(stylesCss, /\.paper-frame\s*\{[^}]*aspect-ratio:\s*5\s*\/\s*3/);
assert.match(stylesCss, /\.paper-preview\s*\{[^}]*height:\s*100%[^}]*object-fit:\s*contain/);
assert.match(stylesCss, /\.paper-venue-tag\s*\{[^}]*background:\s*var\(--accent\)/);
assert.match(stylesCss, /\.hero-intro \.hero-status\s*\{[^}]*font-weight:\s*600/);
assert.doesNotMatch(stylesCss, /\.intro-kicker(?:\s|:|\{)/);
assert.doesNotMatch(stylesCss, /\.paper-takeaway\s*\{/);

console.log('site-content checks passed');
