/**
 * NeoBridge status rules (PRD "Status rules engine", p.16–17).
 *
 * The mother's app runs these eight rules in order on every reading; the first
 * match sets the status. Pure functions: the caller keeps RulesState between
 * calls and persists it if it wants episodes to survive a restart.
 */

export type Status = 'green' | 'yellow' | 'red' | 'grey';

export type RedTrigger = 'dangerSign' | 'veryCold' | 'tooWarm' | 'stillCold';

export type GreyReason = 'noReading' | 'noContact' | 'sensorError' | 'lowBattery';

export type Reason = RedTrigger | GreyReason | 'gettingCold' | 'none';

export interface RuleReading {
  /** ms since epoch */
  at: number;
  /** raw skin temperature from the band, before the calibration offset */
  skinTempC: number | null;
  /** band reports it is not touching skin */
  noContact: boolean;
  sensorError: boolean;
  /** 0–100 */
  batteryPct: number;
}

export interface Episode {
  id: string;
  trigger: RedTrigger;
  startedAt: number;
  acknowledgedAt: number | null;
  closedAt: number | null;
  closedBy: string | null;
  /** why it was closed: visit, or a phone check with a written reason */
  closeReason: string | null;
}

export interface YellowEpisode {
  startedAt: number;
  recheckAt: number;
}

export interface RulesState {
  /** the open red episode, if any */
  episode: Episode | null;
  yellow: YellowEpisode | null;
  /** when the median first crossed each line, continuously since */
  coldSince: number | null;
  veryColdSince: number | null;
  hotSince: number | null;
  /** the danger-sign answer that already raised red, so closing it doesn't re-open it */
  dangerSignHandledAt: number | null;
}

export interface RulesConfig {
  /** skin, °C (placeholder lines until clinical sign-off) */
  coldC: number;
  veryColdC: number;
  hotC: number;
  /** how long a line must be crossed before it counts ("2 min") */
  sustainMs: number;
  /** yellow re-check ("1 h") */
  recheckMs: number;
  /** no reading for this long → grey */
  noReadingMs: number;
  /** battery below this → grey */
  lowBatteryPct: number;
  /** how many recent readings the median is taken over */
  medianOf: number;
}

export const defaultConfig: RulesConfig = {
  coldC: 35.5,
  veryColdC: 34.5,
  hotC: 37.8,
  sustainMs: 2 * 60_000,
  recheckMs: 60 * 60_000,
  noReadingMs: 90_000,
  lowBatteryPct: 10,
  medianOf: 4,
};

/** Demo mode: 2 minutes become 10 seconds and the 1-hour re-check 1 minute. */
export const demoConfig: RulesConfig = {
  ...defaultConfig,
  sustainMs: 10_000,
  recheckMs: 60_000,
};

export const initialState: RulesState = {
  episode: null,
  yellow: null,
  coldSince: null,
  veryColdSince: null,
  hotSince: null,
  dangerSignHandledAt: null,
};

export interface RulesInput {
  now: number;
  /** recent readings, oldest first; only the last few are used */
  readings: RuleReading[];
  /** °C added to the band's raw skin temperature */
  calibrationOffsetC: number;
  /** when a danger sign was last answered yes today, ms; null if none */
  dangerSignAt: number | null;
}

export type RulesEvent =
  | { type: 'redStarted'; episode: Episode }
  | { type: 'yellowStarted'; yellow: YellowEpisode }
  | { type: 'yellowClosed' };

export interface RulesResult {
  status: Status;
  reason: Reason;
  /** rule number 1–8 that matched */
  rule: number;
  /** adjusted median skin temperature, when there was one */
  skinC: number | null;
  state: RulesState;
  events: RulesEvent[];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

let episodeCounter = 0;
function newEpisodeId(now: number): string {
  episodeCounter = (episodeCounter + 1) % 1_000_000;
  return `ep-${now.toString(36)}-${episodeCounter.toString(36)}`;
}

/** Runs the eight rules once. */
export function evaluate(input: RulesInput, prev: RulesState, config: RulesConfig = defaultConfig): RulesResult {
  const { now } = input;
  let state: RulesState = { ...prev };
  const events: RulesEvent[] = [];

  const last = input.readings[input.readings.length - 1];
  const recent = input.readings
    .slice(-config.medianOf)
    .map((r) => r.skinTempC)
    .filter((t): t is number => t !== null);
  const raw = median(recent);
  const skinC = raw === null ? null : Math.round((raw + input.calibrationOffsetC) * 100) / 100;

  const grey = greyReason(last, now, config);

  // Track how long each line has been crossed. Without a good reading we can't
  // say a line stayed crossed, so the clocks restart.
  if (grey !== null || skinC === null) {
    state.coldSince = state.veryColdSince = state.hotSince = null;
  } else {
    state.coldSince = skinC < config.coldC ? (state.coldSince ?? now) : null;
    state.veryColdSince = skinC < config.veryColdC ? (state.veryColdSince ?? now) : null;
    state.hotSince = skinC > config.hotC ? (state.hotSince ?? now) : null;
  }
  const held = (since: number | null) => since !== null && now - since >= config.sustainMs;

  const result = (status: Status, reason: Reason, rule: number): RulesResult => ({
    status,
    reason,
    rule,
    skinC,
    state,
    events,
  });

  const startRed = (trigger: RedTrigger, rule: number): RulesResult => {
    const episode: Episode = {
      id: newEpisodeId(now),
      trigger,
      startedAt: now,
      acknowledgedAt: null,
      closedAt: null,
      closedBy: null,
      closeReason: null,
    };
    state = { ...state, episode, yellow: null };
    events.push({ type: 'redStarted', episode });
    return result('red', trigger, rule);
  };

  // 1 · an open red episode stays red until the ASHA or a doctor closes it
  if (state.episode && state.episode.closedAt === null) return result('red', state.episode.trigger, 1);

  // 2 · danger sign answered yes today
  if (input.dangerSignAt !== null && input.dangerSignAt !== state.dangerSignHandledAt) {
    state = { ...state, dangerSignHandledAt: input.dangerSignAt };
    return startRed('dangerSign', 2);
  }

  // 3 · the band can't be trusted right now
  if (grey !== null) return result('grey', grey, 3);

  // 4 · very cold for 2 min
  if (held(state.veryColdSince)) return startRed('veryCold', 4);

  // 5 · too warm for 2 min
  if (held(state.hotSince)) return startRed('tooWarm', 5);

  const yellow = state.yellow;
  const recheckDue = yellow !== null && now >= yellow.recheckAt;
  const cold = skinC !== null && skinC < config.coldC;

  // 6 · yellow re-check has come and the baby is still cold
  if (recheckDue && cold) return startRed('stillCold', 6);

  // 7 · getting cold, or yellow open and waiting for its re-check
  if (yellow !== null && !recheckDue) return result('yellow', 'gettingCold', 7);
  if (held(state.coldSince)) {
    const opened: YellowEpisode = { startedAt: now, recheckAt: now + config.recheckMs };
    state = { ...state, yellow: opened };
    events.push({ type: 'yellowStarted', yellow: opened });
    return result('yellow', 'gettingCold', 7);
  }

  // 8 · green. A yellow whose re-check found the baby warm again closes here.
  if (yellow !== null) {
    state = { ...state, yellow: null };
    events.push({ type: 'yellowClosed' });
  }
  return result('green', 'none', 8);
}

function greyReason(last: RuleReading | undefined, now: number, config: RulesConfig): GreyReason | null {
  if (!last || now - last.at > config.noReadingMs) return 'noReading';
  if (last.sensorError) return 'sensorError';
  if (last.noContact || last.skinTempC === null) return 'noContact';
  if (last.batteryPct < config.lowBatteryPct) return 'lowBattery';
  return null;
}

/** Mother or ASHA tapped "I've seen it": the band stops buzzing, the episode stays open. */
export function acknowledge(state: RulesState, now: number): RulesState {
  if (!state.episode || state.episode.acknowledgedAt !== null) return state;
  return { ...state, episode: { ...state.episode, acknowledgedAt: now } };
}

/**
 * The ASHA (after a visit) or a doctor closes the red episode. Returns the
 * closed episode for the record and a state with no open episode.
 */
export function closeEpisode(
  state: RulesState,
  now: number,
  closedBy: string,
  reason: string,
): { state: RulesState; closed: Episode | null } {
  if (!state.episode) return { state, closed: null };
  const closed: Episode = { ...state.episode, closedAt: now, closedBy, closeReason: reason };
  return {
    // the line clocks restart so the same cold spell doesn't re-open red at once
    state: { ...state, episode: null, yellow: null, coldSince: null, veryColdSince: null, hotSince: null },
    closed,
  };
}
