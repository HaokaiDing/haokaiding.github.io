export const OWNER_TIME_ZONE = 'Asia/Dubai';
export const WORK_HOURS = Object.freeze({ start: 9, end: 18 });
export const FETCH_TIMEOUT_MS = 10_000;
export const DELAY_THRESHOLD_MS = 2 * 60 * 60 * 1000;
export const PAYLOAD_LIFETIME_MS = 6 * 60 * 60 * 1000;

const UTC_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
const ROOT_KEYS = [
  'busy',
  'expiresAt',
  'generatedAt',
  'ownerTimeZone',
  'status',
  'version',
  'windowEnd',
  'windowStart',
];
const INTERVAL_KEYS = ['end', 'start'];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const zonedPartsFormatters = new Map();
const dayBoundaryCache = new Map();

const fail = message => {
  throw new TypeError(`Invalid availability data: ${message}`);
};

const assertExactKeys = (value, expectedKeys, fieldName) => {
  const keys = Object.keys(value).sort();
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(`${fieldName} must contain exactly these keys: ${expectedKeys.join(', ')}`);
  }
};

const parseUtcInstant = (value, fieldName) => {
  const match = typeof value === 'string' ? value.match(UTC_ISO_PATTERN) : null;
  if (!match) {
    fail(`${fieldName} must be a UTC ISO timestamp ending in Z`);
  }

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    fail(`${fieldName} must be a valid UTC ISO timestamp`);
  }

  const date = new Date(milliseconds);
  const [, year, month, day, hour, minute, second, fraction = '0'] = match;
  const calendarFieldsMatch = (
    date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day)
    && date.getUTCHours() === Number(hour)
    && date.getUTCMinutes() === Number(minute)
    && date.getUTCSeconds() === Number(second)
    && date.getUTCMilliseconds() === Number(fraction.padEnd(3, '0'))
  );
  if (!calendarFieldsMatch) {
    fail(`${fieldName} must be a valid UTC ISO calendar timestamp`);
  }

  return milliseconds;
};

const assertTimeZone = timeZone => {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
  } catch {
    throw new RangeError(`Invalid IANA time zone: ${timeZone}`);
  }
};

const getPartsFormatter = timeZone => {
  if (!zonedPartsFormatters.has(timeZone)) {
    assertTimeZone(timeZone);
    zonedPartsFormatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }));
  }

  return zonedPartsFormatters.get(timeZone);
};

const getZonedParts = (instant, timeZone) => {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('Expected a valid date');
  }

  const values = {};
  for (const part of getPartsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
};

const getTimeZoneOffsetMs = (milliseconds, timeZone) => {
  const parts = getZonedParts(new Date(milliseconds), timeZone);
  const wallTimeAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wallTimeAsUtc - Math.floor(milliseconds / 1000) * 1000;
};

const findOffsetDecrease = (start, end, timeZone) => {
  const startOffset = getTimeZoneOffsetMs(start, timeZone);
  const lastIncludedInstant = end - 1;
  const endOffset = getTimeZoneOffsetMs(lastIncludedInstant, timeZone);
  if (endOffset >= startOffset) return null;

  let lower = start;
  let upper = lastIncludedInstant;
  while (upper - lower > 1) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (getTimeZoneOffsetMs(middle, timeZone) === startOffset) lower = middle;
    else upper = middle;
  }

  return {
    transition: upper,
    offsetDecreaseMinutes: (startOffset - endOffset) / (60 * 1000),
  };
};

const addCalendarDays = ({ year, month, day }, dayCount) => {
  const shifted = new Date(Date.UTC(year, month - 1, day + dayCount));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const calendarDateOrdinal = ({ year, month, day }) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) {
    throw new RangeError('Expected a valid calendar date');
  }
  return Math.floor(date.getTime() / DAY_MS);
};

const localDateOrdinalAt = (milliseconds, timeZone) => (
  calendarDateOrdinal(getZonedParts(new Date(milliseconds), timeZone))
);

export function getLocalDayBoundary(localDate, timeZone = OWNER_TIME_ZONE) {
  assertTimeZone(timeZone);
  const targetOrdinal = calendarDateOrdinal(localDate);
  const cacheKey = `${timeZone}|${localDate.year}-${localDate.month}-${localDate.day}`;
  const cached = dayBoundaryCache.get(cacheKey);
  if (cached !== undefined) return new Date(cached);

  const nominalUtc = targetOrdinal * DAY_MS;
  let lower = nominalUtc - 2 * DAY_MS;
  let upper = nominalUtc + 2 * DAY_MS;

  while (localDateOrdinalAt(lower, timeZone) >= targetOrdinal) lower -= DAY_MS;
  while (localDateOrdinalAt(upper, timeZone) < targetOrdinal) upper += DAY_MS;

  while (upper - lower > 1) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (localDateOrdinalAt(middle, timeZone) >= targetOrdinal) upper = middle;
    else lower = middle;
  }

  dayBoundaryCache.set(cacheKey, upper);
  return new Date(upper);
};

export function validateAvailability(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('root must be an object');
  }
  assertExactKeys(payload, ROOT_KEYS, 'root');
  if (payload.version !== 1) fail('version must be 1');
  if (!['ready', 'setup-required'].includes(payload.status)) {
    fail('status must be ready or setup-required');
  }
  if (payload.ownerTimeZone !== OWNER_TIME_ZONE) {
    fail(`ownerTimeZone must be ${OWNER_TIME_ZONE}`);
  }
  if (!Array.isArray(payload.busy)) fail('busy must be an array');

  const timeFields = ['generatedAt', 'expiresAt', 'windowStart', 'windowEnd'];
  if (payload.status === 'setup-required') {
    for (const field of timeFields) {
      if (payload[field] !== null) fail(`${field} must be null while setup is required`);
    }
    if (payload.busy.length !== 0) fail('setup-required data must have an empty busy array');
    return {
      version: 1,
      status: 'setup-required',
      generatedAt: null,
      expiresAt: null,
      ownerTimeZone: OWNER_TIME_ZONE,
      windowStart: null,
      windowEnd: null,
      busy: [],
    };
  }

  const parsedTimes = Object.fromEntries(
    timeFields.map(field => [field, parseUtcInstant(payload[field], field)]),
  );
  if (parsedTimes.expiresAt <= parsedTimes.generatedAt) {
    fail('expiresAt must be after generatedAt');
  }
  if (parsedTimes.expiresAt - parsedTimes.generatedAt !== PAYLOAD_LIFETIME_MS) {
    fail('expiresAt must be exactly 6 hours after generatedAt');
  }
  if (parsedTimes.windowEnd <= parsedTimes.windowStart) {
    fail('windowEnd must be after windowStart');
  }

  const busy = payload.busy.map((interval, index) => {
    if (!interval || typeof interval !== 'object' || Array.isArray(interval)) {
      fail(`busy[${index}] must be an object`);
    }
    assertExactKeys(interval, INTERVAL_KEYS, `busy[${index}]`);
    const start = parseUtcInstant(interval.start, `busy[${index}].start`);
    const end = parseUtcInstant(interval.end, `busy[${index}].end`);
    if (end <= start) fail(`busy[${index}].end must be after its start`);
    if (start < parsedTimes.windowStart || end > parsedTimes.windowEnd) {
      fail(`busy[${index}] must be completely inside the published window`);
    }
    if (index > 0) {
      const previousStart = parseUtcInstant(payload.busy[index - 1].start, `busy[${index - 1}].start`);
      const previousEnd = parseUtcInstant(payload.busy[index - 1].end, `busy[${index - 1}].end`);
      if (start < previousStart) fail('busy must be sorted by start');
      if (start <= previousEnd) fail('busy intervals must not overlap or touch');
    }
    return { start: interval.start, end: interval.end };
  });

  return {
    version: 1,
    status: 'ready',
    generatedAt: payload.generatedAt,
    expiresAt: payload.expiresAt,
    ownerTimeZone: OWNER_TIME_ZONE,
    windowStart: payload.windowStart,
    windowEnd: payload.windowEnd,
    busy,
  };
}

export function availabilityState(payload, now = new Date()) {
  const data = validateAvailability(payload);
  if (data.status === 'setup-required') return { kind: 'setup-required', data };

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new RangeError('Expected a valid current time');
  if (nowMs < Date.parse(data.generatedAt)) {
    return { kind: 'stale', reason: 'future', data };
  }
  if (nowMs >= Date.parse(data.expiresAt)) {
    return { kind: 'stale', reason: 'expired', data };
  }
  if (nowMs - Date.parse(data.generatedAt) >= DELAY_THRESHOLD_MS) {
    return { kind: 'delayed', data };
  }
  return { kind: 'ready', data };
}

export function getAvailabilitySnapshot(payload, now = new Date()) {
  const capturedAtMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(capturedAtMs)) throw new RangeError('Expected a valid current time');
  const state = availabilityState(payload, capturedAtMs);
  const expiryDelayMs = ['ready', 'delayed'].includes(state.kind)
    ? Date.parse(state.data.expiresAt) - capturedAtMs
    : null;
  const nextTransitionDelayMs = state.kind === 'ready'
    ? Date.parse(state.data.generatedAt) + DELAY_THRESHOLD_MS - capturedAtMs
    : (state.kind === 'delayed' ? expiryDelayMs : null);
  return {
    ...state,
    capturedAtMs,
    expiryDelayMs,
    nextTransitionDelayMs,
  };
}

export function scheduleFreshnessTransition(snapshot, onTransition, setTimer = setTimeout) {
  const delay = snapshot?.nextTransitionDelayMs;
  if (!Number.isFinite(delay) || delay <= 0) return null;
  return setTimer(onTransition, Math.min(delay, MAX_TIMER_DELAY_MS));
}

export function createRequestGenerationGuard() {
  let currentGeneration = 0;
  return {
    begin() {
      currentGeneration += 1;
      return currentGeneration;
    },
    isCurrent(generation) {
      return generation === currentGeneration;
    },
  };
}

export function getWeekRange(anchor, timeZone = OWNER_TIME_ZONE) {
  const anchorDate = anchor instanceof Date ? anchor : new Date(anchor);
  const local = getZonedParts(anchorDate, timeZone);
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = addCalendarDays(local, -daysSinceMonday);
  const followingMonday = addCalendarDays(monday, 7);

  return {
    start: getLocalDayBoundary(monday, timeZone),
    end: getLocalDayBoundary(followingMonday, timeZone),
  };
}

export function shiftWeek(anchor, weekCount, timeZone = OWNER_TIME_ZONE) {
  if (!Number.isInteger(weekCount)) throw new TypeError('weekCount must be an integer');
  const { start } = getWeekRange(anchor, timeZone);
  const localMonday = getZonedParts(start, timeZone);
  return getLocalDayBoundary(addCalendarDays(localMonday, weekCount * 7), timeZone);
}

export function getCurrentTimeMarker(now, {
  timeZone = OWNER_TIME_ZONE,
  weekStart,
  visibleStartHour = WORK_HOURS.start,
  visibleEndHour = WORK_HOURS.end,
}) {
  if (!(visibleStartHour >= 0 && visibleEndHour <= 24 && visibleEndHour > visibleStartHour)) {
    throw new RangeError('Expected an hour range within 0–24');
  }

  const current = getZonedParts(now, timeZone);
  const monday = getZonedParts(getWeekRange(weekStart, timeZone).start, timeZone);
  const dayIndex = calendarDateOrdinal(current) - calendarDateOrdinal(monday);
  const minute = current.hour * 60 + current.minute + current.second / 60;
  const startMinute = visibleStartHour * 60;
  const endMinute = visibleEndHour * 60;
  if (dayIndex < 0 || dayIndex > 6 || minute < startMinute || minute >= endMinute) return null;

  return {
    dayIndex,
    topPercent: ((minute - startMinute) / (endMinute - startMinute)) * 100,
    label: `Now ${String(current.hour).padStart(2, '0')}:${String(current.minute).padStart(2, '0')}`,
  };
}

const getDayBoundaries = (weekStart, timeZone) => {
  const { start } = getWeekRange(weekStart, timeZone);
  const monday = getZonedParts(start, timeZone);
  return Array.from({ length: 8 }, (_, index) => (
    getLocalDayBoundary(addCalendarDays(monday, index), timeZone)
  ));
};

export function splitBusyIntervals(busy, weekStart, timeZone = OWNER_TIME_ZONE) {
  if (!Array.isArray(busy)) throw new TypeError('busy must be an array');
  const boundaries = getDayBoundaries(weekStart, timeZone);
  const weekStartMs = boundaries[0].getTime();
  const weekEndMs = boundaries[7].getTime();
  const segments = [];

  for (const [index, interval] of busy.entries()) {
    const intervalStart = parseUtcInstant(interval?.start, `busy[${index}].start`);
    const intervalEnd = parseUtcInstant(interval?.end, `busy[${index}].end`);
    if (intervalEnd <= intervalStart) fail(`busy[${index}].end must be after its start`);
    if (intervalEnd <= weekStartMs || intervalStart >= weekEndMs) continue;

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const dayStart = boundaries[dayIndex].getTime();
      const dayEnd = boundaries[dayIndex + 1].getTime();
      const start = Math.max(intervalStart, dayStart);
      const end = Math.min(intervalEnd, dayEnd);
      if (end <= start) continue;

      const startParts = getZonedParts(new Date(start), timeZone);
      const endParts = getZonedParts(new Date(end), timeZone);
      const labelStartMinute = startParts.hour * 60 + startParts.minute + startParts.second / 60;
      const labelEndMinute = end === dayEnd
        ? 1440
        : endParts.hour * 60 + endParts.minute + endParts.second / 60;
      const offsetDecrease = findOffsetDecrease(start, end, timeZone);
      const repeatedStartMinute = offsetDecrease
        ? (() => {
          const transitionParts = getZonedParts(new Date(offsetDecrease.transition), timeZone);
          return transitionParts.hour * 60 + transitionParts.minute + transitionParts.second / 60;
        })()
        : null;
      const clockChangeAmbiguity = offsetDecrease !== null || labelEndMinute <= labelStartMinute;
      const durationMinutes = (end - start) / (60 * 1000);
      const startMinute = offsetDecrease
        ? Math.min(labelStartMinute, repeatedStartMinute)
        : labelStartMinute;
      const endMinute = offsetDecrease
        ? Math.max(
          labelEndMinute,
          repeatedStartMinute + offsetDecrease.offsetDecreaseMinutes,
        )
        : (clockChangeAmbiguity
          ? Math.min(1440, startMinute + durationMinutes)
          : labelEndMinute);

      segments.push({
        dayIndex,
        startMinute,
        endMinute,
        labelStartMinute,
        labelEndMinute,
        clockChangeAmbiguity,
        start: new Date(start),
        end: new Date(end),
      });
    }
  }

  return segments.sort((left, right) => (
    left.dayIndex - right.dayIndex || left.startMinute - right.startMinute
  ));
}

export function clipSegmentsToHours(segments, startHour, endHour) {
  if (!(startHour >= 0 && endHour <= 24 && endHour > startHour)) {
    throw new RangeError('Expected an hour range within 0–24');
  }

  const lower = startHour * 60;
  const upper = endHour * 60;
  return segments.flatMap(segment => {
    const startMinute = Math.max(segment.startMinute, lower);
    const endMinute = Math.min(segment.endMinute, upper);
    return endMinute > startMinute ? [{
      ...segment,
      startMinute,
      endMinute,
    }] : [];
  });
}

export function isWeekCovered(data, weekRange) {
  if (data?.status !== 'ready' || !data.windowStart || !data.windowEnd) return false;
  const start = weekRange.start instanceof Date
    ? weekRange.start.getTime()
    : new Date(weekRange.start).getTime();
  const end = weekRange.end instanceof Date
    ? weekRange.end.getTime()
    : new Date(weekRange.end).getTime();
  return Date.parse(data.windowStart) <= start && Date.parse(data.windowEnd) >= end;
}

export function canNavigateWeek(data, weekRange, direction, timeZone = OWNER_TIME_ZONE) {
  if (![1, -1].includes(direction) || data?.status !== 'ready') return false;
  const currentStart = weekRange.start instanceof Date
    ? weekRange.start.getTime()
    : new Date(weekRange.start).getTime();
  const currentEnd = weekRange.end instanceof Date
    ? weekRange.end.getTime()
    : new Date(weekRange.end).getTime();
  const windowStart = Date.parse(data.windowStart);
  const windowEnd = Date.parse(data.windowEnd);
  if (currentEnd <= windowStart) return direction === 1;
  if (currentStart >= windowEnd) return direction === -1;
  const candidateStart = shiftWeek(weekRange.start, direction, timeZone);
  const candidateRange = getWeekRange(candidateStart, timeZone);
  return isWeekCovered(data, candidateRange);
}

export function formatWeekRange(weekRange, timeZone = OWNER_TIME_ZONE) {
  const start = weekRange.start instanceof Date ? weekRange.start : new Date(weekRange.start);
  const endExclusive = weekRange.end instanceof Date ? weekRange.end : new Date(weekRange.end);
  const end = new Date(endExclusive.getTime() - 1);
  const startParts = getZonedParts(start, timeZone);
  const endParts = getZonedParts(end, timeZone);
  const monthFormatter = new Intl.DateTimeFormat('en', { timeZone, month: 'short' });
  const sameMonth = startParts.year === endParts.year && startParts.month === endParts.month;
  const sameYear = startParts.year === endParts.year;
  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(end);

  if (sameMonth) return `${startMonth} ${startParts.day}–${endParts.day}, ${startParts.year}`;
  if (sameYear) {
    return `${startMonth} ${startParts.day}–${endMonth} ${endParts.day}, ${startParts.year}`;
  }
  return `${startMonth} ${startParts.day}, ${startParts.year}–${endMonth} ${endParts.day}, ${endParts.year}`;
}

export function calendarStatusMessage(prefix, allDay, visibleBusyCount) {
  if (visibleBusyCount > 0) {
    return `${prefix}: Showing Busy blocks only. Unmarked time is not a booking guarantee.`;
  }
  if (!allDay) {
    return `${prefix}: No Busy blocks between 09:00–18:00. Expand calendar to check other times.`;
  }
  return `${prefix}: No Busy blocks are published for this covered week. Unmarked time is not a booking guarantee.`;
}

const el = (tagName, className, text) => {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const minutesToLabel = minutes => {
  if (minutes === 1440) return '24:00';
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const initializeAvailabilityCalendar = () => {
  const section = document.querySelector('#availability');
  if (!section) return;

  const availabilityUrl = section.dataset.availabilityUrl;
  const toggle = section.querySelector('#availability-toggle');
  const panel = section.querySelector('#availability-panel');
  const status = section.querySelector('#availability-status');
  const grid = section.querySelector('#availability-grid');
  const scroller = section.querySelector('.availability-scroller');
  const previous = section.querySelector('#availability-previous');
  const next = section.querySelector('#availability-next');
  const localTimeZone = section.querySelector('#availability-local-time-zone');
  const expand = section.querySelector('#availability-expand');
  const retry = section.querySelector('#availability-retry');
  const timeZoneLabel = section.querySelector('#availability-time-zone-label');
  const currentTime = section.querySelector('#availability-current-time');

  if (
    !availabilityUrl
    || !toggle
    || !panel
    || !status
    || !grid
    || !scroller
    || !previous
    || !next
    || !localTimeZone
    || !expand
    || !retry
    || !timeZoneLabel
    || !currentTime
  ) return;

  let anchor = new Date();
  let activeTimeZone = OWNER_TIME_ZONE;
  let useLocalTimeZone = false;
  let allDay = false;
  let availability = null;
  let loadPromise = null;
  let expiryTimer = null;
  let currentTimeTimer = null;
  let activeController = null;
  const requestGeneration = createRequestGenerationGuard();

  const controls = [previous, next, localTimeZone, expand];

  const setStatus = (message, kind) => {
    status.textContent = message;
    status.dataset.state = kind;
  };

  const setControlsDisabled = disabled => {
    controls.forEach(control => {
      control.disabled = disabled;
    });
  };

  const clearExpiryTimer = () => {
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    expiryTimer = null;
  };

  const setRetryHidden = hidden => {
    if (hidden && !retry.hidden && document.activeElement === retry) {
      status.focus({ preventScroll: true });
    }
    retry.hidden = hidden;
  };

  const setScrollerAvailable = available => {
    scroller.hidden = !available;
    if (available) scroller.tabIndex = 0;
    else scroller.removeAttribute('tabindex');
  };

  const renderUnavailable = (message, kind, allowRetry = true) => {
    const focusedElement = document.activeElement;
    const focusNeedsRecovery = (
      focusedElement === scroller
      || scroller.contains(focusedElement)
      || controls.includes(focusedElement)
      || focusedElement === retry
    );
    if (focusNeedsRecovery) {
      requestAnimationFrame(() => status.focus({ preventScroll: true }));
    }
    grid.hidden = true;
    grid.replaceChildren();
    setScrollerAvailable(false);
    setControlsDisabled(true);
    setStatus(message, kind);
    setRetryHidden(!allowRetry);
  };

  const scheduleExpiry = snapshot => {
    clearExpiryTimer();
    expiryTimer = scheduleFreshnessTransition(snapshot, () => {
      expiryTimer = null;
      renderCalendar();
    });
    return expiryTimer !== null;
  };

  const syncReadyControls = (data, weekRange) => {
    const focusedControl = document.activeElement;
    localTimeZone.disabled = false;
    expand.disabled = false;
    previous.disabled = !canNavigateWeek(data, weekRange, -1, activeTimeZone);
    next.disabled = !canNavigateWeek(data, weekRange, 1, activeTimeZone);
    if (focusedControl instanceof HTMLButtonElement && focusedControl.disabled) {
      requestAnimationFrame(() => status.focus({ preventScroll: true }));
    }
  };

  const syncTimeZoneDisplay = () => {
    localTimeZone.checked = useLocalTimeZone;
    timeZoneLabel.textContent = `(${activeTimeZone} time)`;
  };

  const updateCurrentTime = () => {
    const now = new Date();
    const current = getZonedParts(now, activeTimeZone);
    const clock = [current.hour, current.minute, current.second]
      .map(value => String(value).padStart(2, '0'))
      .join(':');
    currentTime.textContent = `${clock} ${activeTimeZone}`;
    currentTime.dateTime = now.toISOString();
    if (grid.hidden) return;

    const monday = getZonedParts(getWeekRange(anchor, activeTimeZone).start, activeTimeZone);
    const todayIndex = calendarDateOrdinal(current) - calendarDateOrdinal(monday);
    const dayHeaders = grid.querySelectorAll('.availability-day-header');
    const dayColumns = grid.querySelectorAll('.availability-day-column');
    dayHeaders.forEach((header, index) => header.classList.toggle('is-today', index === todayIndex));
    dayColumns.forEach((column, index) => column.classList.toggle('is-today', index === todayIndex));

    const marker = getCurrentTimeMarker(now, {
      timeZone: activeTimeZone,
      weekStart: anchor,
      visibleStartHour: allDay ? 0 : WORK_HOURS.start,
      visibleEndHour: allDay ? 24 : WORK_HOURS.end,
    });
    let line = grid.querySelector('.availability-now-line');
    if (!marker) {
      line?.remove();
      return;
    }

    const column = dayColumns[marker.dayIndex];
    if (!line || line.parentElement !== column) {
      line?.remove();
      line = el('div', 'availability-now-line');
      line.setAttribute('aria-hidden', 'true');
      line.append(el('span', 'availability-now-label'));
      column.append(line);
    }
    line.style.top = `${marker.topPercent}%`;
    const visibleStartMinute = (allDay ? 0 : WORK_HOURS.start) * 60;
    line.classList.toggle('is-near-start', current.hour * 60 + current.minute - visibleStartMinute < 25);
    line.firstElementChild.textContent = marker.label;
  };

  const syncCurrentTimeUpdates = () => {
    if (currentTimeTimer !== null) clearInterval(currentTimeTimer);
    currentTimeTimer = null;
    updateCurrentTime();
    if (!panel.hidden && !document.hidden) {
      currentTimeTimer = setInterval(updateCurrentTime, 1000);
    }
  };

  const makeDayHeader = (instant, timeZone) => {
    const header = el('div', 'availability-day-header');
    const weekday = new Intl.DateTimeFormat('en', {
      timeZone,
      weekday: 'short',
    }).format(instant);
    const date = new Intl.DateTimeFormat('en', {
      timeZone,
      month: 'numeric',
      day: 'numeric',
    }).format(instant);
    header.append(el('strong', '', weekday), el('span', '', date));
    return header;
  };

  const formatAccessibleDate = (instant, timeZone) => new Intl.DateTimeFormat('en', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(instant);

  const renderCalendar = () => {
    updateCurrentTime();
    if (!availability) return;
    const snapshot = getAvailabilitySnapshot(availability, Date.now());
    if (snapshot.kind === 'setup-required') {
      clearExpiryTimer();
      renderUnavailable(
        'Calendar setup is still in progress. Availability is not currently published.',
        snapshot.kind,
      );
      return;
    }
    if (snapshot.kind === 'stale') {
      clearExpiryTimer();
      renderUnavailable(
        snapshot.reason === 'future'
          ? 'Availability data is not valid yet, so no free-time inference is shown.'
          : 'Availability data is out of date, so no free-time inference is shown.',
        snapshot.kind,
      );
      return;
    }

    availability = snapshot.data;
    if (!scheduleExpiry(snapshot)) {
      renderUnavailable(
        'Availability data is out of date, so no free-time inference is shown.',
        'stale',
      );
      return;
    }
    syncTimeZoneDisplay();
    const weekRange = getWeekRange(anchor, activeTimeZone);
    const rangeLabel = formatWeekRange(weekRange, activeTimeZone);
    const statusPrefix = `${rangeLabel} (${activeTimeZone})`;
    syncReadyControls(availability, weekRange);
    setRetryHidden(snapshot.kind !== 'delayed');

    if (!isWeekCovered(availability, weekRange)) {
      grid.hidden = true;
      grid.replaceChildren();
      setScrollerAvailable(false);
      setStatus(
        snapshot.kind === 'delayed'
          ? `${statusPrefix}: Update delayed — no verified availability data covers this week; no free-time inference is shown.`
          : `${statusPrefix}: No verified availability data is published for this week.`,
        snapshot.kind === 'delayed' ? 'delayed' : 'out-of-range',
      );
      return;
    }

    const startHour = allDay ? 0 : WORK_HOURS.start;
    const endHour = allDay ? 24 : WORK_HOURS.end;
    const dayBoundaries = getDayBoundaries(weekRange.start, activeTimeZone);
    const segments = clipSegmentsToHours(
      splitBusyIntervals(availability.busy, weekRange.start, activeTimeZone),
      startHour,
      endHour,
    );

    grid.replaceChildren();
    grid.hidden = false;
    setScrollerAvailable(true);
    grid.style.setProperty('--calendar-hours', String(endHour - startHour));

    const calendarHeader = el('div', 'availability-calendar-header');
    const corner = el('div', 'availability-calendar-corner', 'time');
    calendarHeader.append(corner);
    dayBoundaries.slice(0, 7).forEach(day => calendarHeader.append(
      makeDayHeader(day, activeTimeZone),
    ));

    const calendarBody = el('div', 'availability-calendar-body');
    const timeAxis = el('div', 'availability-time-axis');
    timeAxis.setAttribute('aria-hidden', 'true');
    for (let hour = startHour; hour <= endHour; hour += 1) {
      const label = el('span', 'availability-hour-label', `${String(hour).padStart(2, '0')}:00`);
      label.style.top = `${((hour - startHour) / (endHour - startHour)) * 100}%`;
      timeAxis.append(label);
    }
    calendarBody.append(timeAxis);

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const dayColumn = el('div', 'availability-day-column');
      const dayLabel = formatAccessibleDate(dayBoundaries[dayIndex], activeTimeZone);
      dayColumn.setAttribute('role', 'group');
      dayColumn.setAttribute('aria-label', dayLabel);
      for (const segment of segments.filter(item => item.dayIndex === dayIndex)) {
        const block = el('div', 'availability-busy-block');
        const top = (segment.startMinute - startHour * 60) / ((endHour - startHour) * 60);
        const height = (segment.endMinute - segment.startMinute) / ((endHour - startHour) * 60);
        const visibleMinutes = segment.endMinute - segment.startMinute;
        const labelStartMinute = segment.labelStartMinute ?? segment.startMinute;
        const labelEndMinute = segment.labelEndMinute ?? segment.endMinute;
        const clockChangeHint = segment.clockChangeAmbiguity ? ', across a clock change' : '';
        const accessibleLabel = `${dayLabel}: Busy ${minutesToLabel(labelStartMinute)} to ${minutesToLabel(labelEndMinute)}${clockChangeHint}`;
        block.style.top = `${top * 100}%`;
        block.style.height = `${height * 100}%`;
        block.setAttribute('role', 'group');
        block.setAttribute('aria-label', accessibleLabel);
        block.title = accessibleLabel;
        block.tabIndex = 0;
        if (visibleMinutes <= 30) block.classList.add('availability-busy-block--compact');
        if (visibleMinutes < 18) block.classList.add('availability-busy-block--micro');
        const busyTitle = el('strong', 'availability-busy-title');
        busyTitle.textContent = 'Busy';
        busyTitle.setAttribute('aria-hidden', 'true');
        const busyTime = el(
          'span',
          'availability-busy-time',
          `${minutesToLabel(labelStartMinute)}–${minutesToLabel(labelEndMinute)}`,
        );
        busyTime.setAttribute('aria-hidden', 'true');
        block.append(busyTitle, busyTime);
        if (visibleMinutes < 18) {
          block.append(el('span', 'availability-sr-only', accessibleLabel));
        }
        dayColumn.append(block);
      }
      calendarBody.append(dayColumn);
    }

    grid.append(calendarHeader, calendarBody);
    updateCurrentTime();
    setStatus(
      snapshot.kind === 'delayed'
        ? `${statusPrefix}: Update delayed — showing last verified Busy blocks. Unmarked times may have changed.`
        : calendarStatusMessage(statusPrefix, allDay, segments.length),
      snapshot.kind,
    );
  };

  const loadAvailability = () => {
    if (loadPromise) return loadPromise;
    clearExpiryTimer();
    setControlsDisabled(true);
    setStatus('Loading verified availability…', 'loading');
    setRetryHidden(true);
    setScrollerAvailable(false);
    grid.hidden = true;

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const generation = requestGeneration.begin();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const request = (async () => {
      await Promise.resolve();
      try {
        const response = await fetch(availabilityUrl, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!requestGeneration.isCurrent(generation)) return;
        if (!response.ok) throw new Error(`Availability request failed (${response.status})`);
        const payload = await response.json();
        if (!requestGeneration.isCurrent(generation)) return;
        availability = validateAvailability(payload);
        renderCalendar();
      } catch {
        if (!requestGeneration.isCurrent(generation)) return;
        availability = null;
        clearExpiryTimer();
        renderUnavailable(
          'Availability could not be verified. Please try again later.',
          'error',
        );
      } finally {
        clearTimeout(timeout);
        if (requestGeneration.isCurrent(generation)) {
          activeController = null;
          loadPromise = null;
        }
      }
    })();

    loadPromise = request;
    return request;
  };

  toggle.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
    toggle.textContent = opening ? 'Hide calendar' : 'View calendar';
    syncCurrentTimeUpdates();
    if (opening) {
      const currentState = availability ? getAvailabilitySnapshot(availability, Date.now()) : null;
      if (['ready', 'delayed'].includes(currentState?.kind)) renderCalendar();
      else loadAvailability();
    }
  });

  previous.addEventListener('click', () => {
    anchor = shiftWeek(anchor, -1, activeTimeZone);
    renderCalendar();
  });

  next.addEventListener('click', () => {
    anchor = shiftWeek(anchor, 1, activeTimeZone);
    renderCalendar();
  });

  localTimeZone.addEventListener('change', () => {
    const previousRange = getWeekRange(anchor, activeTimeZone);
    anchor = new Date((previousRange.start.getTime() + previousRange.end.getTime()) / 2);
    useLocalTimeZone = localTimeZone.checked;
    activeTimeZone = useLocalTimeZone
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone || OWNER_TIME_ZONE)
      : OWNER_TIME_ZONE;
    syncTimeZoneDisplay();
    renderCalendar();
  });

  expand.addEventListener('click', () => {
    allDay = !allDay;
    expand.textContent = allDay ? 'Work hours only' : 'Expand calendar';
    renderCalendar();
  });

  retry.addEventListener('click', () => loadAvailability());
  document.addEventListener('visibilitychange', syncCurrentTimeUpdates);
  currentTime.setAttribute('aria-live', 'off');
  setControlsDisabled(true);
  setScrollerAvailable(false);
  syncCurrentTimeUpdates();
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAvailabilityCalendar, { once: true });
  } else {
    initializeAvailabilityCalendar();
  }
}
