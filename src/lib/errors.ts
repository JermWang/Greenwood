// Shared error type for game and route code.
//
// It lives on its own rather than in game.ts so that modules the engine itself
// imports — floor.ts, for one — can throw it without forming an import cycle
// back through the engine. game.ts re-exports it, so every existing
// `import { GameError } from '@/lib/game'` keeps working unchanged.

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
