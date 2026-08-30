// The people of Evergreen, and the job their dialogue is doing.
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
//   HINT   — the turn (docs/evergreen-turn.md), leaking.
//
// HOW THE HINTS WORK, and the rule that must not be broken:
//
// NOBODY IN EVERGREEN KNOWS THEY ARE IN A HORROR STORY. Every character here
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
  /**
   * Trim, gloves and boots — what makes a resident not read as another player.
   *
   * Players get their jacket from a hash of their wallet out of a six-colour
   * list, and bare hands and boots unless a cosmetic overrides them. So a crowd
   * of players is a crowd of plain two-tone figures, and an NPC built the same
   * way is indistinguishable from one until you are close enough to read the
   * nameplate.
   *
   * Every resident therefore wears something a player CANNOT: a contrasting
   * trim plus coloured gloves and boots, in a combination picked for the job
   * rather than from the player palette. It reads as a uniform, which is what
   * these people are wearing, and it means "that is staff" is a silhouette
   * judgement at any distance.
   */
  trim: string;
  hand: string;
  boot: string;
  /** Head colour, from SKIN_TONES. The cast is not all one shade. */
  skin: string;
  /** Head shape, from HAT_STYLES. Silhouette does most of the telling-apart. */
  hat: string;
  lines: NpcLine[];
}

/**
 * The cast.
 *
 * Five people, each owning a different corner of the game's mechanics, so
 * "who do I ask about X" always has an answer. They are also each a different
 * distance from the truth: the technician is closest and least curious, the
 * watchman is furthest and most uneasy, and the retired operator remembers a
 * version of Evergreen nobody else does.
 */
export const NPCS: Npc[] = [
  {
    id: 'dez',
    name: 'Dez Okafor',
    role: 'Floor Technician',
    region: 'grounds',
    x: -16,
    z: 17,
    facing: 0,
    outfit: '#2e3a30',
    cap: '#e0a34a',
    trim: '#e0a34a',
    hand: '#3a3831',
    boot: '#2f2d28',
    skin: '#7a4d30',
    hat: 'hardhat',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'If you want something to do that pays: fell some trees. Buy a hatchet, take it to the treeline, bring the logs back. I will take every log you can carry and I will not ask where they came from.',
      },
      {
        kind: 'trade',
        minLevel: 1,
        text: 'Timber is a commodity like anything else — the Exchange lists it. Better wood grows further out, and the axe you own decides what you can actually put a blade through. Hatchet does pine and birch. That is it.',
      },
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
    x: 16,
    z: 17,
    facing: 0,
    outfit: '#5a4632',
    cap: '#8a6743',
    trim: '#c8a86a',
    hand: '#5f4830',
    boot: '#3d3226',
    skin: '#e0be9a',
    hat: 'bucket',
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
        text: 'Bigger packs are Scrip, not GREEN. Fifteen slots, thirty, fifty. Do not buy the fifty until you are reliably coming back — a bigger bag is a bigger thing to hand somebody.',
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
    z: -13,
    facing: 0,
    outfit: '#2b3d5c',
    cap: '#6b6963',
    trim: '#a9c4e0',
    hand: '#2a2f38',
    boot: '#23262c',
    skin: '#5e3a24',
    hat: 'beanie',
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
    x: 8,
    z: 18,
    facing: 0,
    outfit: '#3d3550',
    cap: '#8c7fa6',
    trim: '#cfc3e4',
    hand: '#d8ccc0',
    boot: '#312c3a',
    skin: '#cfa070',
    hat: 'visor',
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
        text: 'Fixed Income Notes lock GREEN for a term at a published rate. The long end pays over six times the short one. That gap is not generosity — it is what taking float out of circulation is worth to us.',
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
    z: 8,
    facing: Math.PI,
    outfit: '#5e3238',
    cap: '#9c8f86',
    trim: '#d6c2b4',
    hand: '#c9b6a6',
    boot: '#4a3b34',
    skin: '#e8d5c0',
    hat: 'bare',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Open a desk first. Nothing else in Evergreen earns, and the first one starts a seventy-two hour boost that only ever runs once. Every hour you spend reading menus is an hour of it gone.',
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
        text: 'We ran three sites off this floor once. Evergreen, Ashby, and one out east I could not tell you the name of any more. Now it is just us. I asked what happened to Ashby and got a look, not an answer.',
      },
      {
        kind: 'hint',
        minLevel: 10,
        text: 'Dear, we do not have clients. Not one, not in nine years. I did the accounts. Everything this fund produces, it produces for itself and it all goes somewhere the ledger just calls "load". I stopped asking. You are younger than me — you might not.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // The Machine Room — your own floor
  // -------------------------------------------------------------------------
  //
  // Their tips are the most load-bearing in the game: this is where a player
  // builds, and the layout rules are the one system nothing else explains.
  // Everything they say about geometry is true of floor-rules.
  {
    id: 'pim',
    name: 'Pim Vasquez',
    role: 'Floor Engineer',
    region: 'machine-room',
    x: -8,
    z: -11,
    facing: Math.PI / 2,
    outfit: '#35424a',
    cap: '#c9752f',
    trim: '#e2b273',
    hand: '#3a3831',
    boot: '#2f2d28',
    skin: '#e0be9a',
    hat: 'hardhat',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Two tiles between desks. Anything closer and the floor docks you for crowding — it scores how you arrange them, not just how many you own. People find that out after they have built eight in a block.',
      },
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Keep the middle lane clear and build along it. The aisle bonus reaches two tiles either side of the spine, so a desk out against the wall is earning you strictly less than the same desk two steps in.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Tall or wide is a real decision and I will not make it for you. Stack your good instruments on one desk and it compounds; spread thin and you live off the geometry instead. Both work. Half of each works worst.',
      },
      {
        kind: 'hint',
        minLevel: 6,
        text: 'You will hear them run harder when it gets cold. Nobody has ever explained that to me and I have stopped raising it, because the answer I get is that demand is seasonal. Demand for what, in December, at four in the morning.',
      },
      {
        kind: 'hint',
        minLevel: 16,
        text: 'They are not doing sums. I have had the housing off. There is a rotor in there the length of my arm, and you do not put a rotor in a thing that adds up numbers. I asked once what we actually sell. I was told to book the time to maintenance.',
      },
    ],
  },
  {
    id: 'tobi',
    name: 'Tobi Adeyemi',
    role: 'Materials Clerk',
    region: 'machine-room',
    x: 8,
    z: -6,
    facing: -Math.PI / 2,
    outfit: '#4a4030',
    cap: '#7d8a4e',
    trim: '#c2cf86',
    hand: '#4a4436',
    boot: '#33302a',
    skin: '#5e3a24',
    hat: 'cap',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Up to level four a desk is just money. From five it wants frames as well — one per four levels, rounded up. Cut the timber before you need it. Everybody cuts it after and then stands here annoyed at me about it.',
      },
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Frames come off the bench in the corner, twenty-four logs of oak or better. You do not buy them from me, whatever the sign says. I only count them.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'The token cost never went away, mind. Materials are on top, not instead. I have had three people this week convinced the frames were meant to replace the fee.',
      },
      {
        kind: 'hint',
        minLevel: 5,
        text: 'Requisitions I file that nobody explains: lamp oil, forty litres a month. Blackout cloth. Two hundred metres of cable rated for outdoors. For a fund. I put it through as facilities and go home.',
      },
      {
        kind: 'hint',
        minLevel: 13,
        text: 'The inventory has a category I am not cleared to open and it is the biggest one. Not by value — by weight. Whatever we are actually holding, it is heavy and it is not in the vault.',
      },
    ],
  },
  {
    id: 'nell',
    name: 'Nell Braithwaite',
    role: 'Load Scheduler',
    region: 'machine-room',
    x: -7,
    z: 6,
    facing: Math.PI,
    outfit: '#303f3a',
    cap: '#d8b64a',
    trim: '#f0dda0',
    hand: '#3d3a30',
    boot: '#2e2c26',
    skin: '#cfa070',
    hat: 'visor',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Reinvesting costs three quarters of a percent. Claiming costs two. If you are not spending it this hour, do not take it out — that gap is most of the difference between a good first week and a bad one.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'My job is deciding what runs when. Everything on this floor has a slot, the slots are not equal, and the ones nobody wants are between two and five in the morning.',
      },
      {
        kind: 'hint',
        minLevel: 4,
        text: 'I schedule to a curve I did not draw and cannot change. It peaks at dusk and again before dawn, every day, all year. Nothing in finance does that. Kettles do that.',
      },
      {
        kind: 'hint',
        minLevel: 11,
        text: 'When a desk goes down I get a call in eleven minutes. Eleven, every time, from a number that is not internal. I have never once been called about a bad quarter.',
      },
      {
        kind: 'hint',
        minLevel: 20,
        text: 'Last winter I shorted the north allocation by nine percent for one night, as a test. The complaint did not come from accounts. It came from somewhere I have never heard of, and it was not about money. It was about the north end going dark.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // The Trading Floor — the social room
  // -------------------------------------------------------------------------
  {
    id: 'sunil',
    name: 'Sunil Rao',
    role: 'Outfitter',
    region: 'trading-floor',
    x: -1,
    z: -8,
    facing: Math.PI,
    outfit: '#4c3a52',
    cap: '#b07fc4',
    trim: '#e7cdf0',
    hand: '#443b46',
    boot: '#302b34',
    skin: '#9c6640',
    hat: 'bare',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Looks only, at my counter. Nothing I sell will make a desk earn a coin more, and I would rather say so than have you find out in a fortnight. What it will do is make you recognisable, which out there is worth more than people think.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Refinement is the cheap trick nobody uses. Bring me something you already own instead of buying new and you will spend a fraction of it.',
      },
      {
        kind: 'hint',
        minLevel: 7,
        text: 'Best sellers this year, in order: hard hats, watch caps, boots. Not one of them a suit. I stock what people ask for, and what people ask for is kit.',
      },
      {
        kind: 'hint',
        minLevel: 15,
        text: 'A regular came in and asked whether I did anything in a colour that does not show up at night. I said this is a trading floor. He said yes, and did I do anything in a colour that does not show up at night.',
      },
    ],
  },
  {
    id: 'greta',
    name: 'Greta Lindqvist',
    role: 'Note Desk',
    region: 'trading-floor',
    x: 8,
    z: 0,
    facing: -Math.PI / 2,
    outfit: '#2f4a44',
    cap: '#7fbfa8',
    trim: '#cfe8dd',
    hand: '#3a4440',
    boot: '#2b302e',
    skin: '#d4d2cf',
    hat: 'visor',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'A Fixed Income Note locks your GREEN for a term and pays you for the inconvenience. Locked is locked — do not put your axe money in one and then find you cannot buy the axe.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Notes are the right home for the part of your balance you have already decided not to touch. They are the wrong home for the rest of it. Most people work that out with the wrong half.',
      },
      {
        kind: 'hint',
        minLevel: 9,
        text: 'Every note we write matures inside twelve months. Not one longer, and I have asked. The answer was that the committee prefers a short book. A short book, in perpetuity, for nine years running.',
      },
      {
        kind: 'hint',
        minLevel: 18,
        text: 'I priced a five-year once, properly, off our own numbers. The rate came out negative. Not unattractive — negative, as in the model does not believe there is a five-year.',
      },
    ],
  },
  {
    id: 'abe',
    name: 'Abe Ferreira',
    role: 'Allocations Runner',
    region: 'trading-floor',
    x: -6,
    z: 6,
    facing: 0,
    outfit: '#55402c',
    cap: '#d09050',
    trim: '#f2c894',
    hand: '#463d31',
    boot: '#332c25',
    skin: '#b8834f',
    hat: 'bucket',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Allocations come sealed and you do not know what is in one until you open it. That is the whole product. If you cannot afford to open a bad one, you cannot afford the good one either.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Instruments stack on a single desk far better than they spread across a floor. Four good ones together beat four good ones scattered, by more than you would guess.',
      },
      {
        kind: 'hint',
        minLevel: 3,
        text: 'Runner is the title but there is nowhere to run to. Everything I carry goes between this room and the machine floor. I have never once taken a package off site, and I have been asking for the depot address for two years.',
      },
      {
        kind: 'hint',
        minLevel: 12,
        text: 'The sealed ones come in on the night lorry and the drivers do not get out. Engine running, doors shut, gate open four minutes. I used to think that was rudeness. It is too consistent to be rudeness.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Evergreen HQ — the plaza
  // -------------------------------------------------------------------------
  {
    id: 'col',
    name: 'Col Whitmore',
    role: 'Front of House',
    region: 'evergreen-hq',
    x: -3,
    z: -1,
    facing: Math.PI,
    outfit: '#26333f',
    cap: '#b9c3cc',
    trim: '#dfe6ec',
    hand: '#39404a',
    boot: '#2a2f36',
    skin: '#42281a',
    hat: 'cap',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Doors here, not menus. The tower behind me, the avenue south back to the Grounds, and the service gate east onto the treeline. If a gate will not take you it is a level you are short, and it will tell you which.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Everyone assumes the tower is the important part. The important part is that this is the last address in the register with a person answering at it. I say that to visitors and they think it is a boast.',
      },
      {
        kind: 'hint',
        minLevel: 10,
        text: 'I keep the visitor book. Nine years, and every name in it is somebody who already worked here. Not one client, not one auditor, not one courier who was not ours. I still put the book out every morning.',
      },
      {
        kind: 'hint',
        minLevel: 19,
        text: 'The doors lock from the inside on a timer at dusk and the override is not at this desk. I have front of house on my badge and I cannot open my own front door after dark. That is not a security policy. That is a policy about something.',
      },
    ],
  },
  {
    id: 'yusuf',
    name: 'Yusuf Demir',
    role: 'Grounds Keeper',
    region: 'evergreen-hq',
    x: -6,
    z: 8,
    facing: -Math.PI / 2,
    outfit: '#3a4a2c',
    cap: '#86a04a',
    trim: '#cbdf9a',
    hand: '#414734',
    boot: '#2f3328',
    skin: '#7a4d30',
    hat: 'bucket',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Follow the lamps if you are lost. They are not spread out to light the square — they run in pairs down the routes that go somewhere, the approach and the spur east. Walk the lit line and you will end up at a door.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'The fountain costs more a year than the benches, the planters and me together. I have seen the line. Nobody has ever proposed turning it off, and in nine years of cuts that makes it the only thing nobody has proposed cutting.',
      },
      {
        kind: 'hint',
        minLevel: 8,
        text: 'I do the perimeter lamps twice a week and the plaza ones twice a month. That is the instruction, in writing. Four times the attention on the lights facing away from the building as the ones people stand under.',
      },
      {
        kind: 'hint',
        minLevel: 17,
        text: 'The wall went up the same summer the lamps went in, and it is the wrong wall for keeping people out — no wire, no camera, and you could get over it with a bin. It is the right height for something that cannot climb, which is a strange specification for a car park.',
      },
    ],
  },
  {
    id: 'rae',
    name: 'Rae Okonkwo',
    role: 'Yard Supervisor',
    region: 'evergreen-hq',
    x: -16,
    z: 4,
    facing: Math.PI / 2,
    outfit: '#4a3324',
    cap: '#e08a3c',
    trim: '#f4c07e',
    hand: '#4b4136',
    boot: '#332c25',
    skin: '#e8d5c0',
    hat: 'hardhat',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Timber comes through this yard, so if you are cutting, this is where it is worth something. Sell where the stuff gets used, not where you found it. You will not get yard prices out at the treeline.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Three vans, and I run two. The third has been off the road eleven months waiting on a part that is apparently not made any more. That is the whole supply chain, in one bay.',
      },
      {
        kind: 'hint',
        minLevel: 13,
        text: 'Every delivery is inbound. I have not booked a single outbound load since I took this yard. Whatever we are producing, it is not leaving by road, and I am the road.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // The Treeline — the last staffed ground
  // -------------------------------------------------------------------------
  {
    id: 'bram',
    name: 'Bram Halloway',
    role: 'Forestry Lead',
    region: 'treeline',
    x: -8,
    z: 2,
    facing: 0,
    outfit: '#34452c',
    cap: '#6f8f3e',
    trim: '#b8d180',
    hand: '#3f4634',
    boot: '#2d3127',
    skin: '#cfa070',
    hat: 'bucket',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'The ladder is pine, birch, oak, black pine, ironbark, and your axe decides how far up it you get. A hatchet takes pine and birch and will bounce off the rest. That is not you doing it wrong, that is the axe.',
      },
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Black pine grows out here in quantity and it is the best wood you can get without going past the fence. Cut it here. There is nothing deeper in worth the walk until you have an axe that can take ironbark.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Each axe is cut from wood the one before it could fell. That is deliberate, and it means you cannot skip a rung. You climb it or you buy your way up it, and buying gets expensive fast.',
      },
      {
        kind: 'hint',
        minLevel: 6,
        text: 'Stumps out here go over in a season. The same stump inside the fence is still standing after four years. Same rain, same soil, four hundred metres apart. I have written it up twice.',
      },
      {
        kind: 'hint',
        minLevel: 14,
        text: 'We are told to clear sixty metres either side of every line and never told what the lines are for. I have cut brush off cable my whole career and I have never seen cable that thick going to a building that small.',
      },
    ],
  },
  {
    id: 'nesrin',
    name: 'Nesrin Kaya',
    role: 'Track Warden',
    region: 'treeline',
    x: 6,
    z: -2,
    facing: Math.PI,
    outfit: '#443040',
    cap: '#a5709c',
    trim: '#ddb8d6',
    hand: '#403a3e',
    boot: '#2e2a2d',
    skin: '#b8834f',
    hat: 'beanie',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Your pockets hold four things and that is all you get until you buy a pack. Four. People come out here with an axe and no room for what they cut, and then blame the tree.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Stay on the track and you will be fine. The density climbs the further off it you get, so getting lost out here is a navigation problem rather than any other kind. This side of the fence, anyway.',
      },
      {
        kind: 'hint',
        minLevel: 5,
        text: 'My shift ends at dusk and it is not flexible. I asked to do a late once, for the overtime. It went up two levels and came back as no. Nobody said unsafe. They said no.',
      },
      {
        kind: 'hint',
        minLevel: 12,
        text: 'The fence has a gate on this side and none of the hinges are on this side. It opens outward, away from us. You hang a gate that way to stop something pushing in, and there is nothing out there to push.',
      },
    ],
  },
  {
    id: 'ollie',
    name: 'Ollie Sparrow',
    role: 'Log Buyer',
    region: 'treeline',
    x: 14,
    z: 3,
    facing: -Math.PI / 2,
    outfit: '#52472e',
    cap: '#c8b04a',
    trim: '#eee0a0',
    hand: '#474031',
    boot: '#332e24',
    skin: '#9c6640',
    hat: 'cap',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Trees come back. Pine in half a minute, black pine nearer two, ironbark the best part of three. Work a circuit rather than standing over one stump — by the time you have gone round, the first is up again.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Crossbows and bolts, that is what the good timber is for. Bolts especially. You use those up, which makes them the only thing on the bench you will ever come back and make twice.',
      },
      {
        kind: 'hint',
        minLevel: 4,
        text: 'Odd year for it. Everything I buy that goes on a bench comes back as something with a point on it. Nobody has ordered a chair since I started.',
      },
      {
        kind: 'hint',
        minLevel: 16,
        text: 'I am paid per bolt at four times what a bolt is worth, off a budget line that sits under maintenance. Somebody upstairs would rather I never ran out, and would rather it not appear as a weapons cost.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // The Deep Forest — two people, at the gate, and no further
  // -------------------------------------------------------------------------
  //
  // A crowd out here would undo the region. The Deep Forest works because it is
  // the first place in the game with nobody in it, and the fix for "every area
  // should have people" cannot be to staff the one area whose point is that it
  // is unstaffed.
  //
  // So: two, both within sight of the south gate, both out here for a reason a
  // player can see, and neither further in than you could throw. They are also
  // the strongest carriers of the reveal in the cast, because they are the only
  // ones saying ordinary work things in a place the player already knows is
  // wrong.
  //
  // Their placement is load-bearing rather than fussy. They stand outside
  // GATE_RADIUS plus a talking distance, because standing close enough to talk
  // to somebody inside the gate would fire the extraction instead of the
  // conversation — npcs.test asserts the clearance.
  {
    id: 'judd',
    name: 'Judd Marrow',
    role: 'Salvage Buyer',
    region: 'deep-forest',
    x: 0,
    z: 37,
    facing: 0,
    outfit: '#2c3330',
    cap: '#8f9a90',
    trim: '#ccd4cd',
    hand: '#3a403c',
    boot: '#282c2a',
    skin: '#e0be9a',
    hat: 'beanie',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Gate is six steps behind me and there are three more on the other sides. Get inside one and you are out with everything you are carrying. That is the only way this ends well, and it is worth turning back earlier than feels sensible.',
      },
      {
        kind: 'tip',
        minLevel: 0,
        text: 'If you go down out here your pack opens where you fell and anybody can walk up and take it. Not a fee, not a fraction — the lot, on the ground, with your name nowhere on it. Carry what you can afford to hand over.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'I buy at the gate because I do not go past it. Whatever you drag back I will price, and I will price it better than anyone inside the fence will, for reasons we can both work out.',
      },
      {
        kind: 'hint',
        minLevel: 9,
        text: 'Fifth year on this pitch. The trade has not changed and the customers have. Used to be foresters. Now it is people who came out here on purpose with something sharp, and they do not want paying in coin. They want paying in bolts.',
      },
      {
        kind: 'hint',
        minLevel: 18,
        text: 'I have moved this stall twice, both times south. Not for the footfall. I could give you the year the treeline stopped being the edge of anything, and I could give you what it cost me each time to admit it.',
      },
    ],
  },
  {
    id: 'wen',
    name: 'Wen Xiuying',
    role: 'Line Inspector',
    region: 'deep-forest',
    x: -5,
    z: 39,
    facing: Math.PI / 4,
    outfit: '#313c48',
    cap: '#5f9ec4',
    trim: '#b4d8ee',
    hand: '#3b4249',
    boot: '#2a2f34',
    skin: '#cfa070',
    hat: 'hardhat',
    lines: [
      {
        kind: 'tip',
        minLevel: 0,
        text: 'Do not come out here to explore. Come out with a route and a reason, and go back along it. Everyone I have watched get into trouble was somewhere they could not have told you why they were.',
      },
      {
        kind: 'trade',
        minLevel: 0,
        text: 'Ironbark is out here and nowhere else, and it is the top of the ladder for a reason. It is also three minutes to come back, so if you are cutting it, cut it and leave. Do not wait on a second one.',
      },
      {
        kind: 'hint',
        minLevel: 7,
        text: 'I walk the lines and log the faults. Forty years of it. What I cannot tell you is where the far end goes — my section runs out at a junction, and the schedule for the next one is not issued to me.',
      },
      {
        kind: 'hint',
        minLevel: 15,
        text: 'The draw on this line has not dropped in nine years and everything it used to feed is dark. Ashby is dark. Cowden is dark. Same load as when they were lit, and it is all going one way, and the one way is behind you.',
      },
      {
        kind: 'hint',
        minLevel: 21,
        text: 'You want to know what my job actually is. It is making sure Evergreen never goes off. Not the fund — the lights. I have never been given a reason and I have never once needed one, and neither has anybody who has stood where you are standing at this hour.',
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
