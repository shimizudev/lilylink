import { LilyFilters } from '../models/filters';
import { LilyNode } from '../models/node';
import { LilyPlayer } from '../models/player';
import { LilyQueue } from '../models/queue';
import { LilyRestHandler } from '../models/rest';
import { LilyTrack } from '../models/track';
import type { LilyManager } from '../services/base-manager';
import { LilyNodeManager } from '../services/node-manager';
import { LilyPlayerManager } from '../services/player-manager';

export interface Extendable {
  Node: typeof LilyNode;
  Rest: typeof LilyRestHandler;
  Player?: typeof LilyPlayer;
  Track?: typeof LilyTrack;
  Queue?: typeof LilyQueue;
  Filters: typeof LilyFilters;
  PlayerManager?: typeof LilyPlayerManager;
  NodeManager?: typeof LilyNodeManager;
}

export const structures: Extendable = {
  NodeManager: LilyNodeManager,
  PlayerManager: LilyPlayerManager,
  Player: LilyPlayer,
  Queue: LilyQueue,
  Node: LilyNode,
  Rest: LilyRestHandler,
  Filters: LilyFilters,
  Track: LilyTrack,
};

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export abstract class Structure {
  public static manager: LilyManager | undefined = undefined;
  public static setManager(manager: LilyManager) {
    Structure.manager = manager;
  }
  public static getManager(): LilyManager | undefined {
    return Structure.manager;
  }

  public static get<K extends keyof Extendable>(name: K): Extendable[K] {
    const structure = structures[name];
    if (!structure) {
      throw new TypeError(`"${name}" structure must be provided.`);
    }
    return structure;
  }
  public static extend<K extends keyof Extendable>(
    name: K,
    extender: Extendable[K]
  ) {
    structures[name] = extender;
  }
}

export class Plugin {
  public _name = '';
  public load(_manager: LilyManager): void {}
  public unload(_manager: LilyManager): void {}
}
