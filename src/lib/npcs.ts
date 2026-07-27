// The people of Greenwood, and the job their dialogue is doing.
//
// NO IMPORTS. Same contract as the map modules: the server will eventually want
// to gate lines by level without dragging a client module in behind it.
//
// THREE JOBS AT ONCE, and every line has to know which one it is doing.
//
//   TIP    — how the game works. Concrete, actionable, correct. This is the
//            single most useful thing an NPC does and it is why players will
//            talk to them twice.
//   TRADE  — the corporate surface. Yield, desks, notes, the Exchange. It has to
//            be genuinely competent finance talk, because the whole illusion
//            rests on the front being convincing rather than being a thin skin.
//   HINT   — the turn (docs/greenwood-turn.md), leaking.
//
// HOW THE HINTS WORK, and the rule that must not be broken:
//
// NOBODY IN GREENWOOD KNOWS THEY ARE IN A HORROR STORY. Every character here
// believes they work at a fund. So no line is ever ominous ON PURPOSE — the
// dread comes entirely from the player assembling things the speaker thinks are
// mundane. A watchman complaining about the lighting budget is doing his job;
// the player is the only one in the conversation who notices that nobody lights
// a perimeter to look at their own car park.
//
// The moment an NPC says something knowing, portentous, or trailing off into a
// meaningful silence, the reveal is dead — because a character being cagey tells
// the player there IS a secret, which is the one thing they must work out for
// themselves. If a line could be delivered by a narrator, cut it.
//
// Hints are gated on Total Level so the reveal paces with progression, opening
// between levels 3 and 10 exactly as the design doc specifies. A level-1 player
// hears a functioning company; a level-10 player hears the same people saying
// slightly different things and starts counting.

export type LineKind = 'tip' | 'trade' | 'hint';

export interface NpcLine {
  kind: LineKind;
  text: string;
  /**
   * Total Level at which this line becomes available.
   *
   * Tips are mostly 0 — a new player needs them most. Hints climb, so the world
   * gets quietly stranger as you get further in rather than all at once.
   */
  minLevel: number;
}

export interface Npc {
  id: string;
  name: string;
  /** Under the name. What they do, in the fund's own words. */
  role: string;
  /** Which region they stand in. */
  region: string;
  /** Their tile. Kept on paved ground so the scatter never buries them. */
  x: number;
  z: number;
  /** Radians about Y, 0 facing +Z. Most face the way players approach from. */
  facing: number;
  /** Jacket colour. Deliberately ordinary — see the palette rules in CLAUDE.md. */
  outfit: string;
  /** Cap colour. Staff wear the brand; residents do not. */
  cap: string;
  lines: NpcLine[];
}

/**
 * The cast.
 *
 * Five people, each owning a different corner of the game's mechanics, so
 * "who do I ask about X" always has an answer. They are also each a different
 * distance from the truth: the technician is closest and least curious, the
 * watchman is furthest and most uneasy, and the retired operator remembers a
 * version of Greenwood nobody else does.
 */
export const NPCS: Npc[] = [
  {
    id: 'dez',
    name: 'Dez Okafor',
    role: 'Floor Technician',
    region: 'grounds',
    x: -13,
    z: 18,
    facing: 0,
    outfit: '#4a5a48',
    cap: '#ccff00',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Four instrument slots per desk. The game averages them and then raises that to a power below one — so two rares in one desk beat four commons spread across two. Concentrate. Everyone learns that the expensive way.',
      },
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Levelling a desk pulls from fund capital, and capital is shared. A taller floor is a narrower one. There is no correct answer, which is the honest reason the choice is interesting.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Equity Desk, Treasury Desk — different reinvestment rates, same chassis underneath. Treasury compounds cheaper. Equity moves harder. Run both if you can afford the floor space.',
      },
      {
        kind: 'trade',
        minLevel: 2,
        text: 'Where a desk stands changes what it earns. Central aisle pays a premium, crowding costs you. I know how that sounds. I have measured it a hundred times and it is still true.',
      },
      {
        kind: 'hint',
        minLevel: 3,
        text: 'Coolant lines under the floor. On a fund. I asked once and got told it is for the servers, and I said which servers, and they moved me to the day shift.',
      },
      {
        kind: 'hint',
        minLevel: 5,
        text: 'Desk yield tracks ambient temperature almost exactly. Inverse. Cold night, better numbers. No financial instrument on earth behaves like that, and I have stopped putting it in reports.',
      },
      {
        kind: 'hint',
        minLevel: 8,
        text: 'Every desk on this floor has a rating plate. Not a serial number — a rating. Kilowatts. I have never seen a spreadsheet with a kilowatt rating and I have been doing this eleven years.',
      },
    ],
  },
  {
    id: 'marta',
    name: 'Marta Vane',
    role: 'Quartermaster',
    region: 'grounds',
    x: 13,
    z: 18,
    facing: 0,
    outfit: '#6b5b3e',
    cap: '#ccff00',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'You need a pack before the fence. Not for capacity — for the rule. Nothing comes back with you unless it is in one. Buy the Satchel, it is sold at the gate itself.',
      },
      {
        kind: 'tip',
        minLevel: 0,
        text: 'The pack is never what you lose. It is yours permanently. What you lose is whatever is inside it when something kills you, and it drops where you fell for whoever gets there first.',
      },
      {
        kind: 'tip',
        minLevel: 4,
        text: 'Bigger packs are Scrip, not BNTY. Fifteen slots, thirty, fifty. Do not buy the fifty until you are reliably coming back — a bigger bag is a bigger thing to hand somebody.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'I take Scrip. Scrip comes from doing things — quests, the introduction, the daily set. It is the one currency you cannot buy your way into, which is deliberate and which everybody complains about.',
      },
      {
        kind: 'hint',
        minLevel: 3,
        text: 'Salvage requisition forms. That is the actual paperwork for a field expedition. Not "acquisition", not "procurement". Somebody chose that word and I would like to meet them.',
      },
      {
        kind: 'hint',
        minLevel: 6,
        text: 'The returns rate is the part nobody puts on a slide. Plenty of people go out. Fewer come back with a full pack. And a handful, every month, just do not file anything at all.',
      },
      {
        kind: 'hint',
        minLevel: 9,
        text: 'I stock antiseptic. On a trading floor. It moves faster than anything else I carry and nobody has ever once asked me why that is on the list.',
      },
    ],
  },
  {
    id: 'hal',
    name: 'Halvard Reyes',
    role: 'Perimeter Watch',
    region: 'grounds',
    x: 2,
    z: -14,
    facing: 0,
    outfit: '#3f5c86',
    cap: '#a09e99',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Gate opens at total level six for the Treeline, ten for the Deep Forest, and you need a pack for both. Level comes from doing things — trading, treasury, allocations, running your floor. Four tracks, they all count.',
      },
      {
        kind: 'tip',
        minLevel: 5,
        text: 'Past the fence, the extraction gates are the only way out with what you are carrying. Four of them, one on each edge, lit so you can see them from a distance. Plan the route out before you go in. Everyone plans the route in.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Officially this is asset protection. I stand here, I log who goes out, I log who comes back. It is a clipboard job and the pay is fine.',
      },
      {
        kind: 'hint',
        minLevel: 3,
        text: 'Floodlights point out. Every one of them. I raised it in my first week — thought it was an install error, all that light thrown into the trees and none on the yard. Was told it was correct as specified.',
      },
      {
        kind: 'hint',
        minLevel: 5,
        text: 'Top of the fence angles inward. You only build it that way when you are worried about something getting in. A fence to keep staff from wandering off leans the other way. I notice things, it is the job.',
      },
      {
        kind: 'hint',
        minLevel: 7,
        text: 'Bulbs on the far end have been out four months. Requisition keeps coming back "deprioritised". Meanwhile the settlement side gets replacements within a week. Somebody upstairs has decided which half of this fence matters.',
      },
      {
        kind: 'hint',
        minLevel: 10,
        text: 'Two in the morning, something walked the treeline end to end. Took it about forty minutes. I logged it as wildlife because there is no other box to tick, and nobody has ever come back to me about it.',
      },
    ],
  },
  {
    id: 'iris',
    name: 'Iris Sunna',
    role: 'Exchange Clerk',
    region: 'grounds',
    x: 2,
    z: 18,
    facing: 0,
    outfit: '#4b4459',
    cap: '#ccff00',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Everything is tradeable between players — instruments, cosmetics, all of it. The house takes two percent and gives every basis point of it back: half burned, half into the rewards pool. We do not keep a cut.',
      },
      {
        kind: 'tip',
        minLevel: 2,
        text: 'Rarity is a much flatter curve than people assume. A legendary is worth more than a common, not twenty times more. Anyone pricing off the old multipliers is going to sit on their listing a long time.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Fixed Income Notes lock BNTY for a term at a published rate. The long end pays over six times the short one. That gap is not generosity — it is what taking float out of circulation is worth to us.',
      },
      {
        kind: 'hint',
        minLevel: 4,
        text: 'Volume leaders this quarter: cable, scrap, pelts. Pelts. I file them under soft commodities because there is nowhere else to put them, and I would rather not think about the supply chain.',
      },
      {
        kind: 'hint',
        minLevel: 6,
        text: 'There is a line item called rotten cells that clears at a decent price every single week. I have asked three people what a rotten cell is. I got three different answers and none of them were the same kind of answer.',
      },
      {
        kind: 'hint',
        minLevel: 9,
        text: 'Settlement times are exact to the second, every trade, no exceptions. Except between two and four in the morning, when they go long and the log just says "network". We do not have a network problem. I would know.',
      },
    ],
  },
  {
    id: 'bess',
    name: 'Beatrix Coyle',
    role: 'Retired Operator',
    region: 'grounds',
    x: -2,
    // Four tiles clear of the entrance arch. At 21 her nameplate landed on top
    // of the GREENWOOD GROUNDS sign — labels are screen-space billboards and do
    // nothing to avoid each other, so the only fix is distance on the ground.
    z: 19,
    facing: Math.PI,
    outfit: '#7a3f4a',
    cap: '#6b6963',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Open a desk first. Nothing else in Greenwood earns, and the first one starts a seventy-two hour boost that only ever runs once. Every hour you spend reading menus is an hour of it gone.',
      },
      {
        kind: 'tip',
        minLevel: 1,
        text: 'Yield stops accruing at a twelve-hour ceiling. Route it before you log off or you are working for nothing overnight. That one catches everybody exactly once.',
      },
      {
        kind: 'tip',
        minLevel: 3,
        text: 'Total Level is the four tracks added together and it caps at twenty-five for now. You can reach the cap on one track alone — nobody is going to make you trade if you would rather build.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Forty years I ran a floor. Started on two desks and a hand-written ledger. The numbers are bigger now and the job has not changed at all: put the machines where they help each other and do not get greedy about it.',
      },
      {
        kind: 'hint',
        minLevel: 3,
        text: 'The Grounds went out to the ridge when I started. Proper walk, that was. Fence came in twice since. Nobody announced it either time — you just come back off leave and the world is a bit smaller.',
      },
      {
        kind: 'hint',
        minLevel: 6,
        text: 'We ran three sites off this floor once. Greenwood, Ashby, and one out east I could not tell you the name of any more. Now it is just us. I asked what happened to Ashby and got a look, not an answer.',
      },
      {
        kind: 'hint',
        minLevel: 10,
        text: 'Dear, we do not have clients. Not one, not in nine years. I did the accounts. Everything this fund produces, it produces for itself and it all goes somewhere the ledger just calls "load". I stopped asking. You are younger than me — you might not.',
      },
    ],
  },
];

const BY_ID = new Map(NPCS.map((n) => [n.id, n]));

export function npcById(id: string): Npc | null {
  return BY_ID.get(id) ?? null;
}

/** Everyone standing in a region. */
export function npcsIn(region: string): Npc[] {
  return NPCS.filter((n) => n.region === region);
}

/** How close you have to be to talk. One tile, like everything else. */
export const TALK_RADIUS = 1.6;

/** The person you are standing next to, if any. */
export function npcAt(region: string, x: number, z: number): Npc | null {
  return (
    npcsIn(region).find((n) => Math.hypot(x - n.x, z - n.z) <= TALK_RADIUS) ?? null
  );
}

/**
 * What this person will say to a player at this level.
 *
 * Tips first, because that is what an NPC is FOR the first time you meet them —
 * a player who talks to somebody and gets atmosphere instead of help learns not
 * to talk to anybody. The flavour and the hints come after, in that order, so
 * the useful thing is never buried under the interesting one.
 */
export function linesFor(npc: Npc, totalLevel: number): NpcLine[] {
  const available = npc.lines.filter((l) => totalLevel >= l.minLevel);
  const rank: Record<LineKind, number> = { tip: 0, trade: 1, hint: 2 };
  return [...available].sort((a, b) => rank[a.kind] - rank[b.kind] || a.minLevel - b.minLevel);
}

/**
 * The one line to open with.
 *
 * The deepest hint they have earned, if they have earned any, otherwise their
 * first tip. Leading with the newest thing is what makes coming back worthwhile:
 * a player who levels up and revisits the same five people should find the
 * conversation has moved, or they will only ever talk to each of them once.
 */
export function greetingFor(npc: Npc, totalLevel: number): NpcLine | null {
  const lines = linesFor(npc, totalLevel);
  if (lines.length === 0) return null;
  const hints = lines.filter((l) => l.kind === 'hint');
  return hints.length ? hints[hints.length - 1] : lines[0];
}
