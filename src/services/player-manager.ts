import { z } from 'zod';
import { Structure } from '../helpers/structure';
import { validate } from '../helpers/validate';
import type { PlayerConfig } from '../models/player';
import type { LilyPlayer } from '../models/player';
import type { LilyManager } from './base-manager';

export class LilyPlayerManager {
  readonly manager: LilyManager;
  public cache: Map<string, LilyPlayer> = new Map();
  constructor(manager: LilyManager) {
    this.manager = manager;
  }
  public create(config: PlayerConfig): LilyPlayer | undefined {
    validate(config.guildId, z.string(), 'guildId is required');

    if (this.has(config.guildId)) {
      return this.get(config.guildId);
    }

    validate(config.voiceChannelId, z.string(), 'voiceChannelId is required');
    validate(config.textChannelId, z.string(), 'textChannelId is required');
    validate(
      config.volume,
      z.number().min(0).max(100).optional().default(50),
      'Invalid volume value.'
    );

    if (config.node) {
      validate(this.manager.nodes.get(config.node), z.any(), 'Invalid node');
    } else {
      const node = this.manager.nodes.sortByUsage('players');
      if (!node) {
        throw new Error('No available nodes');
      }

      config.node = node.identifier ?? node.host;
    }

    // @ts-expect-error: This is flower.
    const player: LilyPlayer = new (Structure.get('Player'))(
      this.manager,
      config
    );
    this.cache.set(config.guildId, player);

    return player;
  }
  public has(guildId: string): boolean {
    return this.cache.has(guildId);
  }
  public get(guildId: string): LilyPlayer | undefined {
    return this.cache.get(guildId);
  }
  public async delete(guildId: string): Promise<void> {
    if (!this.has(guildId)) {
      return;
    }
    await this.get(guildId)?.node.rest.destroy(guildId);
    this.cache.delete(guildId);
  }
}
