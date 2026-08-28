import type { MissionDef } from "../types";

const beat = (
  id: string,
  title: string,
  body: string,
  choices: MissionDef["beats"][0]["choices"],
) => ({ id, title, body, choices });

export const ALL_MISSIONS: MissionDef[] = [
  // ── Weekend & start ───────────────────────────────────────────
  {
    id: "ws-sessions",
    chapterId: "weekend-start",
    title: "What is a race weekend?",
    learnLine: "Practice → qualifying → race. Grid from quali.",
    debriefPass: "Right — FP learns the track, quali sets the grid, Sunday is the points race.",
    debriefFail: "Remember: practice is free running; quali locks starting order; the race awards points.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["ws-sessions-q"],
    beats: [
      beat(
        "ws-sessions-q",
        "Weekend map",
        "Before the race, teams run practice (learn the car/track) then qualifying (fastest lap = better grid). The race is where championship points are scored.",
        [
          {
            id: "a",
            label: "Quali sets the grid; race scores points",
            correct: true,
            feedback: "Exactly. P1 on the grid earned that spot in quali.",
          },
          {
            id: "b",
            label: "Practice sets the grid",
            correct: false,
            feedback: "Practice does not set the grid — qualifying does.",
          },
          {
            id: "c",
            label: "Points only from practice",
            correct: false,
            feedback: "Championship points come from the race (and sprint, when held).",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "ws-sessions-q" } }],
  },
  {
    id: "ws-lights",
    chapterId: "weekend-start",
    title: "Five red lights",
    learnLine: "Watch the FIA start lights — random hold, then lights out.",
    debriefPass: "Five reds light one by one, then a random pause, then all off = race.",
    debriefFail: "The race starts when all five reds go out after a random hold — not when the fifth lights.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["ws-lights-q"],
    beats: [
      beat(
        "ws-lights-q",
        "Lights out",
        "You just saw five red lights and a random hold. The race does NOT start when the fifth light comes on — it starts when all five go out.",
        [
          {
            id: "a",
            label: "Race starts when all five go out",
            correct: true,
            feedback: "Lights out = go. The hold stops jump starts.",
            effect: { type: "none" },
          },
          {
            id: "b",
            label: "Race starts when the 5th light turns on",
            correct: false,
            feedback: "Wrong — fifth on means ‘armed’. Go is when they extinguish.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i1", trigger: { kind: "onLightsOut" }, action: { type: "coach", beatId: "ws-lights-q" } },
    ],
  },
  {
    id: "ws-aborted",
    chapterId: "weekend-start",
    title: "Aborted start",
    learnLine: "If something is wrong on the grid, lights abort — extra formation lap.",
    debriefPass: "Aborted start = extra formation lap; race distance can be shortened.",
    debriefFail: "An aborted start means cars do another formation lap — they do not race away under red lights.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["ws-aborted-q"],
    beats: [
      beat(
        "ws-aborted-q",
        "Abort!",
        "A car stalls on the grid. Race control aborts the start. What happens next?",
        [
          {
            id: "a",
            label: "Extra formation lap, then try again",
            correct: true,
            feedback: "Yes — abort, form up again, new start procedure.",
            effect: { type: "abortStart" },
          },
          {
            id: "b",
            label: "Race starts under yellow anyway",
            correct: false,
            feedback: "No — a stalled car on grid is unsafe; they abort.",
          },
          {
            id: "c",
            label: "Everyone pits immediately",
            correct: false,
            feedback: "Not the default — they usually do another formation lap.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "ws-aborted-q" } }],
  },

  // ── Flags ─────────────────────────────────────────────────────
  {
    id: "fl-yellow",
    chapterId: "flags",
    title: "Yellow flag",
    learnLine: "Yellow = danger ahead. No overtaking in that sector.",
    debriefPass: "Yellow means slow and no overtaking where the flag applies.",
    debriefFail: "Under yellow you must not overtake in the flagged sector — safety first.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["fl-yellow-q"],
    beats: [
      beat(
        "fl-yellow-q",
        "Yellow waved",
        "A car is in the runoff. Yellow flags are out in that sector. What should drivers do?",
        [
          {
            id: "a",
            label: "No overtaking; be prepared to slow",
            correct: true,
            feedback: "Correct — yellow protects marshals and the stranded car.",
            effect: { type: "setControl", flag: "yellow" },
          },
          {
            id: "b",
            label: "Full attack — free to pass",
            correct: false,
            feedback: "Overtaking under yellow is a penalty.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLap", lap: 1 }, action: { type: "setControl", flag: "yellow" } },
      { id: "i1", trigger: { kind: "onControl", flag: "yellow" }, action: { type: "coach", beatId: "fl-yellow-q" } },
    ],
  },
  {
    id: "fl-double",
    chapterId: "flags",
    title: "Double yellow",
    learnLine: "Double yellow = slow significantly; big danger on track.",
    debriefPass: "Double yellow demands a clear speed reduction — not just ‘no pass’.",
    debriefFail: "Double waved yellow means slow down a lot — marshals may be on track.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["fl-double-q"],
    beats: [
      beat(
        "fl-double-q",
        "Double yellow",
        "Debris and marshals on track. Double yellow. Compared to single yellow, you must…",
        [
          {
            id: "a",
            label: "Slow significantly — ready to stop",
            correct: true,
            feedback: "Yes — double yellow is more serious than single.",
            effect: { type: "setControl", flag: "doubleYellow" },
          },
          {
            id: "b",
            label: "Same as green",
            correct: false,
            feedback: "Never — double yellow is a major hazard warning.",
          },
        ],
      ),
    ],
    injects: [
      {
        id: "i0",
        trigger: { kind: "onLap", lap: 1 },
        action: { type: "setControl", flag: "doubleYellow" },
      },
      {
        id: "i1",
        trigger: { kind: "onControl", flag: "doubleYellow" },
        action: { type: "coach", beatId: "fl-double-q" },
      },
    ],
  },
  {
    id: "fl-blue",
    chapterId: "flags",
    title: "Blue flag",
    learnLine: "Blue = faster car lapping you — let them by cleanly.",
    debriefPass: "Blue flag means move off the racing line and let the leaders past.",
    debriefFail: "Ignoring blue flags blocks race leaders and earns penalties.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["fl-blue-q"],
    beats: [
      beat(
        "fl-blue-q",
        "Being lapped",
        "You are a lap down. Blue flags wave. What do you do?",
        [
          {
            id: "a",
            label: "Let the faster car past safely",
            correct: true,
            feedback: "Good — don’t race the leaders when you’re being lapped.",
            effect: { type: "setControl", flag: "blue" },
          },
          {
            id: "b",
            label: "Defend hard — it’s still your race",
            correct: false,
            feedback: "Defending against leaders under blue = penalty territory.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLap", lap: 1 }, action: { type: "blueFlagPlayer" } },
      { id: "i1", trigger: { kind: "onElapsed", ms: 8000 }, action: { type: "coach", beatId: "fl-blue-q" } },
    ],
  },
  {
    id: "fl-red",
    chapterId: "flags",
    title: "Red flag",
    learnLine: "Red = session/race stopped. Slow to pit or grid as directed.",
    debriefPass: "Red flag suspends the race — cars return to pit lane under control.",
    debriefFail: "Red means stop racing immediately — not ‘caution and continue’.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["fl-red-q"],
    beats: [
      beat(
        "fl-red-q",
        "Red flag",
        "A barrier is destroyed. Red flag. What happens?",
        [
          {
            id: "a",
            label: "Race suspended — cars go to pit lane",
            correct: true,
            feedback: "Correct. Race control may restart later or call the result.",
            effect: { type: "setControl", flag: "red" },
          },
          {
            id: "b",
            label: "Keep racing at full speed",
            correct: false,
            feedback: "Red flag ends racing until race control says otherwise.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLap", lap: 1 }, action: { type: "setControl", flag: "red" } },
      { id: "i1", trigger: { kind: "onControl", flag: "red" }, action: { type: "coach", beatId: "fl-red-q" } },
    ],
  },
  {
    id: "fl-misc",
    chapterId: "flags",
    title: "Other flags",
    learnLine: "White = slow car; black/orange = damage; black = disqualified; chequered = end.",
    debriefPass: "White warns of a slow car; black/orange means fix damage; chequered ends it.",
    debriefFail: "Chequered = finish. Black/orange = come in for damage. White = slow vehicle ahead.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["fl-misc-q"],
    beats: [
      beat(
        "fl-misc-q",
        "Flag quiz",
        "Which flag ends the race?",
        [
          {
            id: "a",
            label: "Chequered flag",
            correct: true,
            feedback: "Yes — black and white squares mean the race is over.",
            effect: { type: "setControl", flag: "chequered" },
          },
          {
            id: "b",
            label: "White flag",
            correct: false,
            feedback: "White means a slow car ahead, not the finish.",
          },
          {
            id: "c",
            label: "Black and orange",
            correct: false,
            feedback: "That means your car is damaged — pit for checks.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "fl-misc-q" } }],
  },

  // ── Safety ────────────────────────────────────────────────────
  {
    id: "sf-sc",
    chapterId: "safety",
    title: "Safety car",
    learnLine: "SC bunches the field at controlled speed — no racing until it in-laps.",
    debriefPass: "Under SC, pack up behind the safety car; overtaking is banned except allowed cases.",
    debriefFail: "Safety car ≠ yellow sector only — the whole field is neutralized.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["sf-sc-q"],
    beats: [
      beat(
        "sf-sc-q",
        "SC deployed",
        "Big crash. Safety car deployed. What changes?",
        [
          {
            id: "a",
            label: "Field bunches; no racing passes",
            correct: true,
            feedback: "Right — race resumes after SC in-lap and green.",
            effect: { type: "setControl", flag: "sc" },
          },
          {
            id: "b",
            label: "Only the crash sector slows",
            correct: false,
            feedback: "That’s more like a local yellow — SC controls the whole race.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLap", lap: 1 }, action: { type: "setControl", flag: "sc" } },
      { id: "i1", trigger: { kind: "onControl", flag: "sc" }, action: { type: "coach", beatId: "sf-sc-q" } },
    ],
  },
  {
    id: "sf-vsc",
    chapterId: "safety",
    title: "VSC vs safety car",
    learnLine: "VSC = delta time slowdown, no pace car on track.",
    debriefPass: "VSC forces a minimum time per sector — cars stay spaced, no SC vehicle.",
    debriefFail: "VSC is not a full bunch-up behind a pace car — it’s a timed slowdown.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["sf-vsc-q"],
    beats: [
      beat(
        "sf-vsc-q",
        "Virtual safety car",
        "VSC is declared. How is it different from a full safety car?",
        [
          {
            id: "a",
            label: "Drivers hit a time delta — no pace car bunches them",
            correct: true,
            feedback: "Yes — VSC keeps gaps roughly stable while slowing everyone.",
            effect: { type: "setControl", flag: "vsc" },
          },
          {
            id: "b",
            label: "Identical to SC — pack nose to tail",
            correct: false,
            feedback: "SC packs the field; VSC uses sector deltas instead.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLap", lap: 1 }, action: { type: "setControl", flag: "vsc" } },
      { id: "i1", trigger: { kind: "onControl", flag: "vsc" }, action: { type: "coach", beatId: "sf-vsc-q" } },
    ],
  },
  {
    id: "sf-red-restart",
    chapterId: "safety",
    title: "Red-flag restart",
    learnLine: "After red, race may restart from pit lane or standing grid.",
    debriefPass: "Red-flag restarts follow race control — often a standing start or rolling restart.",
    debriefFail: "A red flag does not always end the race — it can restart with remaining laps.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["sf-red-restart-q"],
    beats: [
      beat(
        "sf-red-restart-q",
        "Can we restart?",
        "Red flag cleared the debris. Race control wants to continue. What can happen?",
        [
          {
            id: "a",
            label: "Restart with remaining laps / time",
            correct: true,
            feedback: "Yes — if enough race can still be run, they restart.",
            effect: { type: "clearControl" },
          },
          {
            id: "b",
            label: "Always abandoned — no points",
            correct: false,
            feedback: "Sometimes abandoned, but often restarted if safe.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onElapsed", ms: 5000 }, action: { type: "setControl", flag: "red" } },
      {
        id: "i1",
        trigger: { kind: "onElapsed", ms: 9000 },
        action: { type: "coach", beatId: "sf-red-restart-q" },
      },
    ],
  },

  // ── Tyres ─────────────────────────────────────────────────────
  {
    id: "ty-compounds",
    chapterId: "tyres",
    title: "Soft, medium, hard",
    learnLine: "Softer = faster but wears quicker. Harder lasts longer.",
    debriefPass: "Soft for pace, hard for endurance — strategy is the trade-off.",
    debriefFail: "Soft is not always best — it dies sooner and can cost you later laps.",
    setup: { totalLaps: 3, weatherOverride: "dry", startCompound: "medium", autoBegin: true },
    requiredCorrectBeatIds: ["ty-compounds-q"],
    beats: [
      beat(
        "ty-compounds-q",
        "Pick a compound",
        "Dry race, long stint needed. Which compound usually lasts longest?",
        [
          {
            id: "a",
            label: "Hard",
            correct: true,
            feedback: "Hard is the endurance slick.",
            effect: { type: "setCompound", compound: "hard" },
          },
          {
            id: "b",
            label: "Soft",
            correct: false,
            feedback: "Soft is quickest but fragile.",
          },
          {
            id: "c",
            label: "Wet",
            correct: false,
            feedback: "Wet is for heavy rain — slow on a dry track.",
          },
        ],
      ),
    ],
    injects: [
      {
        id: "i1",
        trigger: { kind: "onLightsOut" },
        action: { type: "coach", beatId: "ty-compounds-q" },
      },
    ],
  },
  {
    id: "ty-mandatory",
    chapterId: "tyres",
    title: "Use more than one dry compound",
    learnLine: "In dry races, rules push teams to use different slick compounds.",
    debriefPass: "Dry races normally require using more than one slick compound — strategy variety.",
    debriefFail: "You usually cannot run soft-only all race in dry conditions — compound rules apply.",
    setup: { totalLaps: 3, weatherOverride: "dry", startCompound: "soft", autoBegin: false },
    requiredCorrectBeatIds: ["ty-mandatory-q"],
    beats: [
      beat(
        "ty-mandatory-q",
        "Compound rules",
        "Dry race (no wet declared). Why do teams often plan two different slicks?",
        [
          {
            id: "a",
            label: "Sporting rules require different dry compounds",
            correct: true,
            feedback: "Simplified: yes — it stops one-compound processions.",
          },
          {
            id: "b",
            label: "Only because softs look nicer",
            correct: false,
            feedback: "It’s a sporting requirement in dry races, not aesthetics.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "ty-mandatory-q" } }],
  },
  {
    id: "ty-wear",
    chapterId: "tyres",
    title: "Worn tyres kill pace",
    learnLine: "When wear drops, box for fresh rubber or lose time every lap.",
    debriefPass: "Dead tyres = slow laps. The pit wall boxes before the cliff.",
    debriefFail: "Pushing forever on worn tyres loses more time than a clean stop.",
    setup: { totalLaps: 3, weatherOverride: "dry", startCompound: "soft", autoBegin: true },
    requiredCorrectBeatIds: ["ty-wear-q"],
    beats: [
      beat(
        "ty-wear-q",
        "Cliff incoming",
        "Telemetry shows tyre wear critical. Best call?",
        [
          {
            id: "a",
            label: "Box next lap for fresh tyres",
            correct: true,
            feedback: "Good call — stop now, race on new rubber.",
            effect: { type: "requestBox" },
          },
          {
            id: "b",
            label: "Stay out and push harder",
            correct: false,
            feedback: "Pushing on cooked tyres digs a deeper hole.",
            effect: { type: "setEngine", mode: "push" },
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLightsOut" }, action: { type: "forceWear", wear: 28 } },
      { id: "i1", trigger: { kind: "onElapsed", ms: 6000 }, action: { type: "coach", beatId: "ty-wear-q" } },
    ],
  },

  // ── Pits ──────────────────────────────────────────────────────
  {
    id: "pt-box",
    chapterId: "pits",
    title: "Box this lap",
    learnLine: "Pit wall calls ‘box’ — car peels in at pit entry next time by.",
    debriefPass: "‘Box’ means commit to the pit lane at the entry — not stop on track.",
    debriefFail: "Boxing is a planned pit entry, not parking on the racing line.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["pt-box-q"],
    beats: [
      beat(
        "pt-box-q",
        "Make the call",
        "You need a tyre change. What does the pit wall tell the driver?",
        [
          {
            id: "a",
            label: "Box next lap",
            correct: true,
            feedback: "Classic call — driver peels in at pit entry.",
            effect: { type: "requestBox" },
          },
          {
            id: "b",
            label: "Stop in the middle of the straight",
            correct: false,
            feedback: "Never — service happens in the pit box.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i1", trigger: { kind: "onElapsed", ms: 5000 }, action: { type: "coach", beatId: "pt-box-q" } },
    ],
  },
  {
    id: "pt-limit",
    chapterId: "pits",
    title: "Pit lane speed limit",
    learnLine: "Pit lane has a strict speed limit — too fast = penalty.",
    debriefPass: "Pit lane is a worksite — speed is capped for crew safety.",
    debriefFail: "Racing speed in the pit lane is illegal and dangerous.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["pt-limit-q"],
    beats: [
      beat(
        "pt-limit-q",
        "In the lane",
        "You are in the pit lane. Why does the car crawl?",
        [
          {
            id: "a",
            label: "Speed limit protects the crews",
            correct: true,
            feedback: "Yes — pit lane limit is non-negotiable.",
          },
          {
            id: "b",
            label: "To save fuel only",
            correct: false,
            feedback: "Fuel isn’t the reason — safety and rules are.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLightsOut" }, action: { type: "forceWear", wear: 20 } },
      { id: "i1", trigger: { kind: "onPitStopped" }, action: { type: "coach", beatId: "pt-limit-q" } },
    ],
  },
  {
    id: "pt-unsafe",
    chapterId: "pits",
    title: "Unsafe release",
    learnLine: "Releasing into traffic in the pit lane = time penalty.",
    debriefPass: "Hold the car until the lane is clear — early release costs ~10s here.",
    debriefFail: "Unsafe release into another car’s path is a classic pit penalty.",
    setup: { totalLaps: 4, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["pt-unsafe-q"],
    beats: [
      beat(
        "pt-unsafe-q",
        "Traffic in the lane",
        "Service done, but another car is coming past your box. What do you do?",
        [
          {
            id: "a",
            label: "Hold — release when clear",
            correct: true,
            feedback: "Safe release. Patience beats a 10s hit.",
            effect: { type: "releaseSafe" },
          },
          {
            id: "b",
            label: "Release now anyway",
            correct: false,
            feedback: "That’s an unsafe release — expect a time penalty.",
            effect: { type: "releaseUnsafe" },
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLightsOut" }, action: { type: "forceWear", wear: 18 } },
      { id: "i1", trigger: { kind: "onPitHoldTraffic" }, action: { type: "coach", beatId: "pt-unsafe-q" } },
      {
        id: "i2",
        trigger: { kind: "onPitStopped" },
        action: { type: "spawnPitTraffic" },
      },
    ],
  },

  // ── Weather ───────────────────────────────────────────────────
  {
    id: "wx-rain",
    chapterId: "weather",
    title: "Rain vs slicks",
    learnLine: "Heavy rain on slicks = no grip. Box to inters or wets.",
    debriefPass: "When rain intensity spikes, switch off slicks or you’ll skate.",
    debriefFail: "Staying on slicks in heavy rain destroys lap time and safety.",
    setup: { totalLaps: 3, weatherOverride: "heavy", startCompound: "soft", autoBegin: true },
    requiredCorrectBeatIds: ["wx-rain-q"],
    beats: [
      beat(
        "wx-rain-q",
        "Monsoon hit",
        "Sepang dumps rain. You are still on soft slicks. Call?",
        [
          {
            id: "a",
            label: "Box to intermediate or wet",
            correct: true,
            feedback: "Correct — get rain tyres on now.",
            effect: { type: "setCompound", compound: "intermediate" },
          },
          {
            id: "b",
            label: "Stay out — slicks will warm up",
            correct: false,
            feedback: "Slicks don’t ‘warm into’ standing water.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLightsOut" }, action: { type: "forceRain", override: "heavy" } },
      { id: "i1", trigger: { kind: "onElapsed", ms: 5000 }, action: { type: "coach", beatId: "wx-rain-q" } },
    ],
  },
  {
    id: "wx-dry",
    chapterId: "weather",
    title: "Drying track",
    learnLine: "When the track dries, inters/wets overheat — switch to slicks.",
    debriefPass: "Drying = box back to slicks or you’ll cook the rain tyres.",
    debriefFail: "Rain tyres on a dry line are slow and destroy themselves.",
    setup: {
      totalLaps: 3,
      weatherOverride: "dry",
      startCompound: "intermediate",
      autoBegin: true,
    },
    requiredCorrectBeatIds: ["wx-dry-q"],
    beats: [
      beat(
        "wx-dry-q",
        "Line is dry",
        "Rain stopped. You’re on intermediates. Best move?",
        [
          {
            id: "a",
            label: "Box to slicks",
            correct: true,
            feedback: "Yes — get off the rain rubber.",
            effect: { type: "setCompound", compound: "medium" },
          },
          {
            id: "b",
            label: "Stay on inters to the flag",
            correct: false,
            feedback: "Inters will overheat and slow you badly.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i1", trigger: { kind: "onElapsed", ms: 5000 }, action: { type: "coach", beatId: "wx-dry-q" } },
    ],
  },

  // ── Overtaking ────────────────────────────────────────────────
  {
    id: "ov-drs",
    chapterId: "overtaking",
    title: "What is DRS?",
    learnLine: "DRS opens the rear wing in zones when within 1s of the car ahead.",
    debriefPass: "DRS is a detection + activation tool to help overtaking on straights.",
    debriefFail: "DRS is not always on — only in zones when you qualify on the gap.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["ov-drs-q"],
    beats: [
      beat(
        "ov-drs-q",
        "DRS armed",
        "You are within one second at the detection line. In the DRS zone you can…",
        [
          {
            id: "a",
            label: "Open the wing for less drag / more speed",
            correct: true,
            feedback: "That’s DRS — drag reduction on the straight.",
          },
          {
            id: "b",
            label: "Ignore blue flags",
            correct: false,
            feedback: "DRS and blue flags are unrelated systems.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLightsOut" }, action: { type: "enableDrsZone" } },
      { id: "i1", trigger: { kind: "onElapsed", ms: 7000 }, action: { type: "coach", beatId: "ov-drs-q" } },
    ],
  },
  {
    id: "ov-blue",
    chapterId: "overtaking",
    title: "Leaders vs backmarkers",
    learnLine: "Leaders need a clean pass; backmarkers must not defend under blue.",
    debriefPass: "Etiquette + blue flags keep the race fair when lapping traffic.",
    debriefFail: "A backmarker racing the leader hard under blue is wrong.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["ov-blue-q"],
    beats: [
      beat(
        "ov-blue-q",
        "Traffic ahead",
        "You lead the race. A lapped car fights you for position under blue flags. Who is wrong?",
        [
          {
            id: "a",
            label: "The lapped car should yield",
            correct: true,
            feedback: "Correct — blues mean let the leader through.",
          },
          {
            id: "b",
            label: "The leader must wait patiently forever",
            correct: false,
            feedback: "Leaders should get a clean pass — that’s why blues exist.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLap", lap: 1 }, action: { type: "blueFlagPlayer" } },
      { id: "i1", trigger: { kind: "onElapsed", ms: 8000 }, action: { type: "coach", beatId: "ov-blue-q" } },
    ],
  },

  // ── Penalties ─────────────────────────────────────────────────
  {
    id: "pn-time",
    chapterId: "penalties",
    title: "5s and 10s penalties",
    learnLine: "Time penalties add to your race time — can drop you after the flag.",
    debriefPass: "A +5s/+10s hit is applied at the stop or to finishing time.",
    debriefFail: "Time penalties still matter even if you cross the line ‘first’ on track.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["pn-time-q"],
    beats: [
      beat(
        "pn-time-q",
        "Stewards say +10s",
        "You get a 10-second time penalty. What does that mean?",
        [
          {
            id: "a",
            label: "10s added to your race time / served at stop",
            correct: true,
            feedback: "Yes — classification uses the adjusted time.",
            effect: { type: "addPenalty", kind: "plus10" },
          },
          {
            id: "b",
            label: "You are banned from the next race",
            correct: false,
            feedback: "That’s not what a simple time penalty does.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "pn-time-q" } }],
  },
  {
    id: "pn-drive",
    chapterId: "penalties",
    title: "Drive-through vs stop-go",
    learnLine: "Drive-through = pit lane at limit, no stop. Stop-go = stop in box for a set time.",
    debriefPass: "Drive-through is lighter; stop-go costs a full stationary hit.",
    debriefFail: "Drive-through ≠ stop-go — one rolls through, one must stop.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["pn-drive-q"],
    beats: [
      beat(
        "pn-drive-q",
        "Which penalty?",
        "Stewards give a drive-through. What must you do?",
        [
          {
            id: "a",
            label: "Enter pit lane, respect limit, no compulsory stop",
            correct: true,
            feedback: "Correct — drive through and rejoin.",
            effect: { type: "addPenalty", kind: "driveThrough" },
          },
          {
            id: "b",
            label: "Stop in the box for 10 seconds",
            correct: false,
            feedback: "That’s a stop-go, not a drive-through.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "pn-drive-q" } }],
  },
  {
    id: "pn-collision",
    chapterId: "penalties",
    title: "Causing a collision",
    learnLine: "If stewards blame you for a crash, expect time or grid penalties.",
    debriefPass: "Contact isn’t always a penalty — ‘causing a collision’ is the key judgment.",
    debriefFail: "Not every touch is equal — stewards decide who caused it.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["pn-collision-q"],
    beats: [
      beat(
        "pn-collision-q",
        "Stewards investigating",
        "Two cars touch; one spins. Stewards say you caused it. Likely outcome?",
        [
          {
            id: "a",
            label: "Time penalty or grid drop",
            correct: true,
            feedback: "Common outcomes for causing a collision.",
            effect: { type: "addPenalty", kind: "plus5" },
          },
          {
            id: "b",
            label: "Automatic championship title loss",
            correct: false,
            feedback: "Way too extreme for a standard incident.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "pn-collision-q" } }],
  },

  // ── Points ────────────────────────────────────────────────────
  {
    id: "pc-table",
    chapterId: "points",
    title: "Race points table",
    learnLine: "P1=25, P2=18 … down to P10=1 (plus optional fastest lap).",
    debriefPass: "Top ten score. Winning is 25 — huge championship swing.",
    debriefFail: "Only the top 10 score race points in the standard table.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["pc-table-q"],
    beats: [
      beat(
        "pc-table-q",
        "How many for a win?",
        "Standard race points for P1?",
        [
          {
            id: "a",
            label: "25 points",
            correct: true,
            feedback: "25 for the win — the big one.",
          },
          {
            id: "b",
            label: "10 points",
            correct: false,
            feedback: "10 is P5 in the modern table, not P1.",
          },
          {
            id: "c",
            label: "50 points",
            correct: false,
            feedback: "Not the standard race win haul.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "pc-table-q" } }],
  },
  {
    id: "pc-p10",
    chapterId: "points",
    title: "Why P10 matters",
    learnLine: "P10 still scores 1 point — P11 scores zero.",
    debriefPass: "That last point can decide a championship over a season.",
    debriefFail: "Outside the top 10 = no race points (DNF likewise).",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["pc-p10-q"],
    beats: [
      beat(
        "pc-p10-q",
        "Last point",
        "You finish P11. How many championship points?",
        [
          {
            id: "a",
            label: "Zero",
            correct: true,
            feedback: "Correct — points stop at P10.",
          },
          {
            id: "b",
            label: "One point",
            correct: false,
            feedback: "P10 gets 1 — P11 gets nothing.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "pc-p10-q" } }],
  },
  {
    id: "pc-sprint",
    chapterId: "points",
    title: "Sprint lite",
    learnLine: "Some weekends add a short sprint with a smaller points table.",
    debriefPass: "Sprint awards fewer points than the main race — still counts to the championship.",
    debriefFail: "Sprint is shorter and pays fewer points, but it is still championship-relevant.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["pc-sprint-q"],
    beats: [
      beat(
        "pc-sprint-q",
        "Sprint weekend",
        "Compared to the Sunday race, sprint points are…",
        [
          {
            id: "a",
            label: "Smaller — but still championship points",
            correct: true,
            feedback: "Right — sprint is a bonus points race.",
          },
          {
            id: "b",
            label: "Identical 25–18–15 table",
            correct: false,
            feedback: "Sprint uses a reduced scale.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "pc-sprint-q" } }],
  },

  // ── Edge cases ────────────────────────────────────────────────
  {
    id: "ed-sc-lap",
    chapterId: "edge",
    title: "Lapped cars under SC",
    learnLine: "Race control may let lapped cars unlap before the restart.",
    debriefPass: "Unlapping under SC cleans the restart so leaders aren’t stuck in traffic.",
    debriefFail: "Sometimes lapped cars get waved by under SC — it’s intentional.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["ed-sc-lap-q"],
    beats: [
      beat(
        "ed-sc-lap-q",
        "Unlap message",
        "Under safety car, race control lets lapped cars pass the SC to unlap. Why?",
        [
          {
            id: "a",
            label: "So the restart isn’t blocked by backmarkers",
            correct: true,
            feedback: "Yes — cleaner racing on the restart.",
            effect: { type: "setControl", flag: "sc" },
          },
          {
            id: "b",
            label: "To give backmarkers free wins",
            correct: false,
            feedback: "They don’t gain race position vs leaders — they unlap.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLap", lap: 1 }, action: { type: "setControl", flag: "sc" } },
      { id: "i1", trigger: { kind: "onControl", flag: "sc" }, action: { type: "coach", beatId: "ed-sc-lap-q" } },
    ],
  },
  {
    id: "ed-sc-pit",
    chapterId: "edge",
    title: "Pitting under safety car",
    learnLine: "SC is a common cheap pit window — but track position can shuffle.",
    debriefPass: "Pitting under SC costs less time relative to cars staying out — classic strategy.",
    debriefFail: "SC pits are strategic — not banned, but order can change.",
    setup: { totalLaps: 3, weatherOverride: "dry", autoBegin: true },
    requiredCorrectBeatIds: ["ed-sc-pit-q"],
    beats: [
      beat(
        "ed-sc-pit-q",
        "SC pit window",
        "Safety car is out. Why do teams often box?",
        [
          {
            id: "a",
            label: "The time loss is smaller while everyone is slow",
            correct: true,
            feedback: "Classic SC pit — ‘free’ stop relative to green-flag pace.",
            effect: { type: "requestBox" },
          },
          {
            id: "b",
            label: "Pitting under SC is always illegal",
            correct: false,
            feedback: "It’s allowed (with procedures) — and often optimal.",
          },
        ],
      ),
    ],
    injects: [
      { id: "i0", trigger: { kind: "onLap", lap: 1 }, action: { type: "setControl", flag: "sc" } },
      { id: "i1", trigger: { kind: "onControl", flag: "sc" }, action: { type: "coach", beatId: "ed-sc-pit-q" } },
    ],
  },
  {
    id: "ed-parc",
    chapterId: "edge",
    title: "Parc fermé (lite)",
    learnLine: "After quali, cars enter parc fermé — big setup changes are restricted.",
    debriefPass: "Parc fermé locks the car between quali and race so the grid stays fair.",
    debriefFail: "Teams can’t freely rebuild the car overnight after quali — parc fermé rules.",
    setup: { totalLaps: 2, weatherOverride: "dry", autoBegin: false },
    requiredCorrectBeatIds: ["ed-parc-q"],
    beats: [
      beat(
        "ed-parc-q",
        "Closed park",
        "After qualifying, parc fermé begins. What does that mean for the car?",
        [
          {
            id: "a",
            label: "Major setup changes are restricted until the race",
            correct: true,
            feedback: "Yes — keeps quali and race car comparable.",
          },
          {
            id: "b",
            label: "Teams may fully rebuild overnight",
            correct: false,
            feedback: "That’s what parc fermé prevents.",
          },
        ],
      ),
    ],
    injects: [{ id: "i1", trigger: { kind: "onReady" }, action: { type: "coach", beatId: "ed-parc-q" } }],
  },
];
