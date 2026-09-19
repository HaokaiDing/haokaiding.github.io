import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  DELAY_THRESHOLD_MS,
  FETCH_TIMEOUT_MS,
  OWNER_TIME_ZONE,
  PAYLOAD_LIFETIME_MS,
  availabilityState,
  calendarStatusMessage,
  canNavigateWeek,
  clipSegmentsToHours,
  createRequestGenerationGuard,
  formatWeekRange,
  getAvailabilitySnapshot,
  getCurrentTimeMarker,
  getLocalDayBoundary,
  getWeekRange,
  isWeekCovered,
  scheduleFreshnessTransition,
  shiftWeek,
  splitBusyIntervals,
  validateAvailability,
} from '../assets/js/availability-calendar.mjs';

const root = process.cwd();
const read = relativePath => readFileSync(join(root, relativePath), 'utf8');
const fixture = JSON.parse(read('tests/fixtures/availability-ready.json'));

test('validates the single Busy-only availability contract', () => {
  const data = validateAvailability(fixture);

  assert.equal(data.version, 1);
  assert.equal(data.status, 'ready');
  assert.equal(data.ownerTimeZone, OWNER_TIME_ZONE);
  assert.equal(data.busy.length, 4);
  assert.deepEqual(Object.keys(data.busy[0]).sort(), ['end', 'start']);

  assert.throws(
    () => validateAvailability({ ...fixture, version: 2 }),
    /version/,
  );
  assert.throws(
    () => validateAvailability({
      ...fixture,
      busy: [{ start: '2026-09-11T09:00:00+04:00', end: '2026-09-11T10:00:00+04:00' }],
    }),
    /UTC ISO/,
  );
  assert.throws(
    () => validateAvailability({
      ...fixture,
      busy: [{ start: '2026-09-11T06:00:00Z', end: '2026-09-11T05:00:00Z' }],
    }),
    /after its start/,
  );
  assert.throws(
    () => validateAvailability({ ...fixture, debug: true }),
    /exactly.*generatedAt/i,
  );
  assert.throws(
    () => validateAvailability({
      ...fixture,
      busy: [{ ...fixture.busy[0], summary: 'private' }],
    }),
    /busy\[0\].*exactly.*end.*start/i,
  );
  assert.throws(
    () => validateAvailability({ ...fixture, generatedAt: '2026-02-30T10:00:00Z' }),
    /valid UTC ISO/,
  );
  assert.throws(
    () => validateAvailability({ ...fixture, expiresAt: fixture.generatedAt }),
    /expiresAt must be after generatedAt/,
  );
  assert.equal(Date.parse(fixture.expiresAt) - Date.parse(fixture.generatedAt), 6 * 60 * 60 * 1000);
  assert.throws(
    () => validateAvailability({ ...fixture, expiresAt: '2026-09-05T15:00:00Z' }),
    /exactly 6 hours after generatedAt/,
  );
});

test('requires Busy intervals to be covered, sorted, separated, and non-adjacent', () => {
  assert.throws(
    () => validateAvailability({
      ...fixture,
      busy: [{ start: '2026-08-30T19:30:00Z', end: '2026-08-30T20:30:00Z' }],
    }),
    /inside the published window/,
  );
  assert.throws(
    () => validateAvailability({
      ...fixture,
      busy: [fixture.busy[2], fixture.busy[1]],
    }),
    /sorted by start/,
  );
  assert.throws(
    () => validateAvailability({
      ...fixture,
      busy: [
        { start: '2026-09-11T05:00:00Z', end: '2026-09-11T06:00:00Z' },
        { start: '2026-09-11T06:00:00Z', end: '2026-09-11T07:00:00Z' },
      ],
    }),
    /must not overlap or touch/,
  );
  assert.throws(
    () => validateAvailability({
      ...fixture,
      busy: [
        { start: '2026-09-11T05:00:00Z', end: '2026-09-11T07:00:00Z' },
        { start: '2026-09-11T06:00:00Z', end: '2026-09-11T08:00:00Z' },
      ],
    }),
    /must not overlap or touch/,
  );
});

test('distinguishes ready, stale, and setup-required data', () => {
  assert.equal(FETCH_TIMEOUT_MS, 10_000);
  assert.equal(DELAY_THRESHOLD_MS, 2 * 60 * 60 * 1000);
  assert.equal(PAYLOAD_LIFETIME_MS, 6 * 60 * 60 * 1000);
  assert.equal(
    availabilityState(fixture, new Date(fixture.generatedAt)).kind,
    'ready',
  );
  assert.equal(
    availabilityState(fixture, new Date('2026-09-05T11:59:59.999Z')).kind,
    'ready',
  );
  assert.equal(
    availabilityState(fixture, new Date('2026-09-05T12:00:00.000Z')).kind,
    'delayed',
  );
  assert.equal(
    availabilityState(fixture, new Date('2026-09-05T15:59:59.999Z')).kind,
    'delayed',
  );
  assert.deepEqual(
    availabilityState(fixture, new Date('2026-09-05T09:59:59Z')),
    { kind: 'stale', reason: 'future', data: validateAvailability(fixture) },
  );
  assert.equal(
    availabilityState(fixture, new Date('2026-09-15T00:00:00Z')).kind,
    'stale',
  );

  const setupRequired = {
    version: 1,
    status: 'setup-required',
    generatedAt: null,
    expiresAt: null,
    ownerTimeZone: OWNER_TIME_ZONE,
    windowStart: null,
    windowEnd: null,
    busy: [],
  };
  assert.equal(availabilityState(setupRequired).kind, 'setup-required');
  assert.throws(
    () => validateAvailability({ ...setupRequired, busy: [{ start: 'x', end: 'y' }] }),
    /empty busy/,
  );
});

test('derives freshness and expiry delay from one fake-clock snapshot', () => {
  const oneMillisecondBeforeDelayed = getAvailabilitySnapshot(
    fixture,
    new Date('2026-09-05T11:59:59.999Z'),
  );
  assert.equal(oneMillisecondBeforeDelayed.kind, 'ready');
  assert.equal(oneMillisecondBeforeDelayed.nextTransitionDelayMs, 1);
  assert.equal(oneMillisecondBeforeDelayed.expiryDelayMs, 4 * 60 * 60 * 1000 + 1);

  const delayedBoundary = getAvailabilitySnapshot(
    fixture,
    new Date('2026-09-05T12:00:00.000Z'),
  );
  assert.equal(delayedBoundary.kind, 'delayed');
  assert.equal(delayedBoundary.nextTransitionDelayMs, 4 * 60 * 60 * 1000);
  assert.equal(delayedBoundary.expiryDelayMs, 4 * 60 * 60 * 1000);

  const oneMillisecondBeforeExpiry = new Date(Date.parse(fixture.expiresAt) - 1);
  const fresh = getAvailabilitySnapshot(fixture, oneMillisecondBeforeExpiry);
  assert.equal(fresh.kind, 'delayed');
  assert.equal(fresh.expiryDelayMs, 1);
  assert.equal(fresh.nextTransitionDelayMs, 1);

  const expired = getAvailabilitySnapshot(fixture, new Date(fixture.expiresAt));
  assert.equal(expired.kind, 'stale');
  assert.equal(expired.reason, 'expired');
  assert.equal(expired.expiryDelayMs, null);
  assert.equal(expired.nextTransitionDelayMs, null);
});

test('runtime scheduler transitions ready to delayed to stale at exact fake-clock boundaries', () => {
  let nowMs = Date.parse(fixture.generatedAt) + DELAY_THRESHOLD_MS - 1;
  const observedKinds = [];
  const pendingTimers = [];
  const scheduledDelays = [];
  const fakeSetTimer = (callback, delay) => {
    scheduledDelays.push(delay);
    pendingTimers.push(callback);
    return pendingTimers.length;
  };

  const render = () => {
    const snapshot = getAvailabilitySnapshot(fixture, nowMs);
    observedKinds.push(snapshot.kind);
    scheduleFreshnessTransition(snapshot, () => {
      nowMs += snapshot.nextTransitionDelayMs;
      render();
    }, fakeSetTimer);
  };

  render();
  pendingTimers.shift()();
  pendingTimers.shift()();

  assert.deepEqual(observedKinds, ['ready', 'delayed', 'stale']);
  assert.deepEqual(scheduledDelays, [1, 4 * 60 * 60 * 1000]);
  assert.equal(pendingTimers.length, 0);
});

test('marks only the latest request generation as current', () => {
  const guard = createRequestGenerationGuard();
  const first = guard.begin();
  assert.equal(guard.isCurrent(first), true);
  const second = guard.begin();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});

test('uses a Monday week boundary in the selected IANA time zone', () => {
  const range = getWeekRange(new Date('2026-09-09T10:00:00Z'), OWNER_TIME_ZONE);

  assert.equal(range.start.toISOString(), '2026-09-06T20:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-09-13T20:00:00.000Z');
  assert.equal(
    shiftWeek(range.start, 1, OWNER_TIME_ZONE).toISOString(),
    '2026-09-13T20:00:00.000Z',
  );
  assert.equal(
    shiftWeek(range.start, -1, OWNER_TIME_ZONE).toISOString(),
    '2026-08-30T20:00:00.000Z',
  );
});

test('places the current time in the Dubai workday using local wall time', () => {
  const week = getWeekRange('2026-09-09T09:30:00Z', OWNER_TIME_ZONE);

  assert.deepEqual(
    getCurrentTimeMarker(new Date('2026-09-09T09:30:00Z'), { weekStart: week.start }),
    { dayIndex: 2, topPercent: 50, label: 'Now 13:30' },
  );
});

test('hides the current-time marker when viewing a different week', () => {
  const now = new Date('2026-09-09T09:30:00Z');
  for (const anchor of ['2026-09-02T09:30:00Z', '2026-09-16T09:30:00Z']) {
    const week = getWeekRange(anchor, OWNER_TIME_ZONE);
    assert.equal(getCurrentTimeMarker(now, { weekStart: week.start }), null);
  }

  const selectedWeek = getWeekRange(now, OWNER_TIME_ZONE);
  assert.equal(
    getCurrentTimeMarker(new Date('2026-09-13T20:00:00Z'), {
      weekStart: selectedWeek.start,
      visibleStartHour: 0,
      visibleEndHour: 24,
    }),
    null,
    'Monday midnight belongs to the following week',
  );
});

test('includes 09:00 and excludes 18:00 from the work-hours marker', () => {
  const week = getWeekRange('2026-09-09T09:30:00Z', OWNER_TIME_ZONE);
  const options = { weekStart: week.start };

  assert.equal(getCurrentTimeMarker(new Date('2026-09-09T04:59:59Z'), options), null);
  assert.deepEqual(
    getCurrentTimeMarker(new Date('2026-09-09T05:00:00Z'), options),
    { dayIndex: 2, topPercent: 0, label: 'Now 09:00' },
  );
  const beforeEnd = getCurrentTimeMarker(new Date('2026-09-09T13:59:59Z'), options);
  assert.equal(beforeEnd.dayIndex, 2);
  assert.equal(beforeEnd.label, 'Now 17:59');
  assert.ok(beforeEnd.topPercent > 99 && beforeEnd.topPercent < 100);
  assert.equal(getCurrentTimeMarker(new Date('2026-09-09T14:00:00Z'), options), null);
});

test('moves the marker to the visitor local date when changing time zones', () => {
  const now = new Date('2026-09-09T02:30:00Z');
  const markers = [OWNER_TIME_ZONE, 'America/Los_Angeles'].map(timeZone => (
    getCurrentTimeMarker(now, {
      timeZone,
      weekStart: getWeekRange(now, timeZone).start,
      visibleStartHour: 0,
      visibleEndHour: 24,
    })
  ));

  assert.deepEqual(
    markers.map(({ dayIndex, label }) => ({ dayIndex, label })),
    [
      { dayIndex: 2, label: 'Now 06:30' },
      { dayIndex: 1, label: 'Now 19:30' },
    ],
  );
});

test('shows the nighttime marker after expanding to the full day', () => {
  const now = new Date('2026-09-09T18:30:00Z');
  const week = getWeekRange(now, OWNER_TIME_ZONE);

  assert.equal(getCurrentTimeMarker(now, { weekStart: week.start }), null);
  assert.deepEqual(
    getCurrentTimeMarker(now, {
      weekStart: week.start,
      visibleStartHour: 0,
      visibleEndHour: 24,
    }),
    { dayIndex: 2, topPercent: 93.75, label: 'Now 22:30' },
  );
});

test('splits UTC Busy instants at local day and week boundaries', () => {
  const week = getWeekRange(new Date('2026-09-09T10:00:00Z'), OWNER_TIME_ZONE);
  const segments = splitBusyIntervals(fixture.busy, week.start, OWNER_TIME_ZONE);

  assert.deepEqual(
    segments.map(({ dayIndex, startMinute, endMinute }) => ({
      dayIndex,
      startMinute,
      endMinute,
    })),
    [
      { dayIndex: 0, startMinute: 0, endMinute: 30 },
      { dayIndex: 1, startMinute: 1410, endMinute: 1440 },
      { dayIndex: 2, startMinute: 0, endMinute: 90 },
      { dayIndex: 4, startMinute: 540, endMinute: 650 },
      { dayIndex: 6, startMinute: 1410, endMinute: 1440 },
    ],
  );

  assert.deepEqual(
    clipSegmentsToHours(segments, 9, 18).map(({ dayIndex, startMinute, endMinute }) => ({
      dayIndex,
      startMinute,
      endMinute,
    })),
    [{ dayIndex: 4, startMinute: 540, endMinute: 650 }],
  );
});

test('finds real local-day boundaries when midnight is skipped or repeated', () => {
  assert.equal(
    getLocalDayBoundary({ year: 2024, month: 9, day: 8 }, 'America/Santiago').toISOString(),
    '2024-09-08T04:00:00.000Z',
  );
  assert.equal(
    getLocalDayBoundary({ year: 2024, month: 11, day: 3 }, 'America/Havana').toISOString(),
    '2024-11-03T04:00:00.000Z',
  );
});

test('never drops Busy time across DST gaps and folds', () => {
  const santiagoWeek = getWeekRange('2024-09-04T12:00:00Z', 'America/Santiago');
  const springSegments = splitBusyIntervals([
    { start: '2024-09-08T03:30:00Z', end: '2024-09-08T04:30:00Z' },
  ], santiagoWeek.start, 'America/Santiago');

  assert.deepEqual(
    springSegments.map(({ dayIndex, startMinute, endMinute }) => ({
      dayIndex,
      startMinute,
      endMinute,
    })),
    [
      { dayIndex: 5, startMinute: 1410, endMinute: 1440 },
      { dayIndex: 6, startMinute: 60, endMinute: 90 },
    ],
  );

  const havanaWeek = getWeekRange('2024-10-30T12:00:00Z', 'America/Havana');
  const fallSegments = splitBusyIntervals([
    { start: '2024-11-03T04:30:00Z', end: '2024-11-03T05:30:00Z' },
  ], havanaWeek.start, 'America/Havana');

  assert.equal(fallSegments.length, 1);
  assert.equal(fallSegments[0].dayIndex, 6);
  assert.equal(fallSegments[0].startMinute, 0);
  assert.equal(fallSegments[0].endMinute, 60);
  assert.equal(fallSegments[0].labelEndMinute, 30);
  assert.equal(fallSegments[0].clockChangeAmbiguity, true);
  assert.equal(fallSegments[0].end.getTime() - fallSegments[0].start.getTime(), 60 * 60 * 1000);
  assert.equal(clipSegmentsToHours(fallSegments, 0, 24).length, 1);
});

test('uses wall-clock end geometry for long Busy intervals spanning DST', () => {
  const sydneyWeek = getWeekRange('2024-10-02T12:00:00Z', 'Australia/Sydney');
  const [sydney] = splitBusyIntervals([
    { start: '2024-10-05T15:30:00Z', end: '2024-10-05T22:30:00Z' },
  ], sydneyWeek.start, 'Australia/Sydney');
  assert.deepEqual(
    { startMinute: sydney.startMinute, endMinute: sydney.endMinute },
    { startMinute: 90, endMinute: 570 },
  );
  assert.deepEqual(
    clipSegmentsToHours([sydney], 9, 18).map(({ startMinute, endMinute }) => ({
      startMinute,
      endMinute,
    })),
    [{ startMinute: 540, endMinute: 570 }],
  );

  const newYorkWeek = getWeekRange('2024-10-30T12:00:00Z', 'America/New_York');
  const [newYork] = splitBusyIntervals([
    { start: '2024-11-03T05:30:00Z', end: '2024-11-03T14:30:00Z' },
  ], newYorkWeek.start, 'America/New_York');
  assert.deepEqual(
    { startMinute: newYork.startMinute, endMinute: newYork.endMinute },
    { startMinute: 60, endMinute: 570 },
  );
  assert.equal(newYork.clockChangeAmbiguity, true);
});

test('covers both sides of an ordered wall-clock interval across a fall fold', () => {
  const havanaWeek = getWeekRange('2024-10-30T12:00:00Z', 'America/Havana');
  const [havana] = splitBusyIntervals([
    { start: '2024-11-03T04:10:00Z', end: '2024-11-03T05:50:00Z' },
  ], havanaWeek.start, 'America/Havana');
  assert.deepEqual(
    {
      startMinute: havana.startMinute,
      endMinute: havana.endMinute,
      labelStartMinute: havana.labelStartMinute,
      labelEndMinute: havana.labelEndMinute,
      clockChangeAmbiguity: havana.clockChangeAmbiguity,
    },
    {
      startMinute: 0,
      endMinute: 60,
      labelStartMinute: 10,
      labelEndMinute: 50,
      clockChangeAmbiguity: true,
    },
  );

  const newYorkWeek = getWeekRange('2024-10-30T12:00:00Z', 'America/New_York');
  const [newYork] = splitBusyIntervals([
    { start: '2024-11-03T05:10:00Z', end: '2024-11-03T06:50:00Z' },
  ], newYorkWeek.start, 'America/New_York');
  assert.deepEqual(
    {
      startMinute: newYork.startMinute,
      endMinute: newYork.endMinute,
      clockChangeAmbiguity: newYork.clockChangeAmbiguity,
    },
    { startMinute: 60, endMinute: 120, clockChangeAmbiguity: true },
  );
});

test('recognizes covered empty weeks independently of Busy count', () => {
  const covered = getWeekRange(new Date('2026-09-09T10:00:00Z'), OWNER_TIME_ZONE);
  const outside = getWeekRange(new Date('2026-09-23T10:00:00Z'), OWNER_TIME_ZONE);

  assert.equal(isWeekCovered(fixture, covered), true);
  assert.equal(isWeekCovered(fixture, outside), false);
  assert.deepEqual(splitBusyIntervals([], covered.start, OWNER_TIME_ZONE), []);
  assert.equal(formatWeekRange(covered, OWNER_TIME_ZONE), 'Sep 7–13, 2026');

  const firstWeek = getWeekRange('2026-09-02T00:00:00Z', OWNER_TIME_ZONE);
  const lastWeek = getWeekRange('2026-09-16T00:00:00Z', OWNER_TIME_ZONE);
  assert.equal(canNavigateWeek(fixture, firstWeek, -1, OWNER_TIME_ZONE), false);
  assert.equal(canNavigateWeek(fixture, firstWeek, 1, OWNER_TIME_ZONE), true);
  assert.equal(canNavigateWeek(fixture, lastWeek, -1, OWNER_TIME_ZONE), true);
  assert.equal(canNavigateWeek(fixture, lastWeek, 1, OWNER_TIME_ZONE), false);

  const farBefore = getWeekRange('2026-01-07T00:00:00Z', OWNER_TIME_ZONE);
  const farAfter = getWeekRange('2027-01-07T00:00:00Z', OWNER_TIME_ZONE);
  assert.equal(canNavigateWeek(fixture, farBefore, -1, OWNER_TIME_ZONE), false);
  assert.equal(canNavigateWeek(fixture, farBefore, 1, OWNER_TIME_ZONE), true);
  assert.equal(canNavigateWeek(fixture, farAfter, -1, OWNER_TIME_ZONE), true);
  assert.equal(canNavigateWeek(fixture, farAfter, 1, OWNER_TIME_ZONE), false);
});

test('does not describe a work-hours crop as an empty week', () => {
  const prefix = 'Sep 7–13, 2026 (Asia/Dubai)';
  assert.equal(
    calendarStatusMessage(prefix, false, 0),
    `${prefix}: No Busy blocks between 09:00–18:00. Expand calendar to check other times.`,
  );
  assert.equal(
    calendarStatusMessage(prefix, true, 0),
    `${prefix}: No Busy blocks are published for this covered week. Unmarked time is not a booking guarantee.`,
  );
});

test('homepage wires a collapsed, lazy-loaded, accessible calendar', () => {
  const html = read('index.html');
  const css = read('availability.css');
  const js = read('assets/js/availability-calendar.mjs');
  const calendarSection = html.match(/<section[^>]*id="availability"[\s\S]*?<\/section>/)?.[0];

  const awardsEnd = html.indexOf('</section>', html.indexOf('id="awards"'));
  const availabilityStart = html.indexOf('id="availability"');
  const footerStart = html.indexOf('<footer class="site-footer">');

  assert.ok(awardsEnd < availabilityStart && availabilityStart < footerStart);
  assert.match(html, /id="availability-panel"[\s\S]*?hidden/);
  assert.match(html, />View calendar<\/button>/);
  assert.match(html, /data-availability-url="\/automation\/availability\.json"/);
  assert.match(html, /availability\.css/);
  assert.match(html, /assets\/js\/availability-calendar\.mjs/);
  assert.match(html, /Use my time zone/);
  assert.match(html, /Expand calendar/);
  assert.match(html, /class="availability-controls" role="group"/);
  assert.match(html, /id="availability-retry"[\s\S]*?hidden/);
  assert.match(html, /id="availability-status"[^>]*tabindex="-1"/);
  assert.match(
    html,
    /class="availability-scroller" role="region"[^>]*aria-label="Scrollable weekly Busy calendar"/,
  );
  assert.ok(calendarSection, 'expected the availability section to exist');
  assert.doesNotMatch(calendarSection, /role="grid"|aria-pressed/);
  assert.match(
    css,
    /\.availability-scroller\s*\{[^}]*max-height:[^}]*overflow:\s*auto/,
  );
  assert.match(
    css,
    /@media\s*\(forced-colors:\s*active\)[\s\S]*?appearance:\s*auto/,
  );
  assert.match(css, /\.availability-status\[data-state="delayed"\]/);
  assert.match(css, /var\(--(?:bg|surface|text|line|accent)/);
  assert.match(css, /availability-busy-block--compact/);
  assert.match(css, /availability-busy-block--micro/);
  assert.match(css, /\.availability-sr-only/);
  assert.doesNotMatch(
    css.match(/\.availability-busy-block\s*\{[^}]*\}/)?.[0] ?? '',
    /min-height/,
  );
  assert.match(css, /border:\s*1px solid var\(--text-faint\)/);
  assert.match(
    css,
    /\.availability-button:not\(:disabled\):hover\s*\{[^}]*color:\s*var\(--text\)/,
  );
  assert.match(js, /fetch\(availabilityUrl/);
  assert.match(js, /AbortController/);
  assert.match(js, /scheduleExpiry/);
  assert.match(js, /snapshot\.kind === 'delayed'/);
  assert.match(
    js,
    /Update delayed — showing last verified Busy blocks\. Unmarked times may have changed\./,
  );
  assert.match(
    js,
    /Update delayed — no verified availability data covers this week; no free-time inference is shown\./,
  );
  assert.match(js, /setRetryHidden\(snapshot\.kind !== 'delayed'\)/);
  assert.match(js, /formatWeekRange\(weekRange/);
  assert.match(js, /busyTitle\.textContent\s*=\s*'Busy'/);
  assert.match(js, /dayColumn\.setAttribute\('role',\s*'group'\)/);
  assert.match(js, /block\.tabIndex\s*=\s*0/);
  assert.match(js, /block\.setAttribute\('role',\s*'group'\)/);
  assert.match(js, /clock change/);
  assert.match(js, /activeController/);
  assert.match(js, /requestGeneration/);
  assert.match(js, /if \(loadPromise\) return loadPromise/);
  assert.match(js, /requestAnimationFrame\(\(\) => status\.focus/);
  const unavailableHandler = js.slice(
    js.indexOf('const renderUnavailable'),
    js.indexOf('const scheduleExpiry'),
  );
  assert.match(unavailableHandler, /focusedElement === scroller/);
  assert.match(unavailableHandler, /scroller\.contains\(focusedElement\)/);
  assert.match(unavailableHandler, /controls\.includes\(focusedElement\)/);
  assert.match(unavailableHandler, /focusedElement === retry/);
  assert.ok(
    unavailableHandler.indexOf('requestAnimationFrame')
      < unavailableHandler.indexOf('grid.hidden = true'),
    'expected focus recovery to be scheduled before the focused UI is removed',
  );
  assert.match(js, /scroller\.hidden\s*=\s*!available/);
  assert.doesNotMatch(js, /setAttribute\('role',\s*'(?:grid|row|columnheader|gridcell)'/);
  assert.doesNotMatch(js, /source(?:Calendar|Metadata|Id)/);
});
