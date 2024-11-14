import { z } from 'zod';
import { validate } from '../helpers/validate';
import type { LilyManager } from '../services/base-manager';
import type { LilyNode } from './node';
import { LilyQueue } from './queue';
import type { VoiceState } from './rest';
import type { LilyTrack } from './track';

export enum PlayerLoop {
  OFF = 'off',
  TRACK = 'track',
  QUEUE = 'queue',
}

export interface PlayerConfig {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  volume?: number;
  loop?: PlayerLoop;
  autoPlay?: boolean;
  autoLeave?: boolean;
  node?: string;
  queueStartIndex?: number;
}

export enum PlayerState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  BUFFERING = 'BUFFERING',
  NONE = 'NONE',
}

export class LilyPlayer {
  readonly manager!: LilyManager;
  public guildId!: string;
  public voiceChannelId!: string;
  public textChannelId!: string;
  public voiceState: VoiceState = {};
  public autoPlay!: boolean;
  public autoLeave!: boolean;
  public connected!: boolean;
  public playing!: boolean;
  public paused!: boolean;
  public volume = 80;
  public loop: PlayerLoop = PlayerLoop.OFF;
  public current: LilyTrack | null = null;
  public previous: LilyTrack | LilyTrack[] | null = null;
  public ping = 0;
  public queue!: LilyQueue;
  public node!: LilyNode;
  public data: Record<string, unknown> = {};

  constructor(manager: LilyManager, config: PlayerConfig) {
    this.manager = manager;
    this.guildId = config.guildId;
    this.voiceChannelId = config.voiceChannelId;
    this.textChannelId = config.textChannelId;
    this.connected = false;
    this.playing = false;
    this.paused = false;
    this.previous = manager.options.previousInArray
      ? ([] as LilyTrack[])
      : null;
    this.volume = config.volume || 100;
    this.loop = config.loop || PlayerLoop.OFF;
    this.autoPlay = config.autoPlay || false;
    this.autoLeave = config.autoLeave || false;
    this.queue = new LilyQueue(config.queueStartIndex ?? 0);
    this.node = this.manager.nodes.get(config.node as string) as LilyNode;
  }

  public set(key: string, data: unknown): void {
    this.data[key] = data;
  }

  public get<T>(key: string): T {
    return this.data[key] as T;
  }

  public setVoiceChannelId(voiceChannelId: string): boolean {
    validate(
      voiceChannelId,
      z.string(),
      'voiceChannelId is invalid',
      TypeError
    );
    const oldVoiceChannelId = String(this.voiceChannelId);

    this.voiceChannelId = voiceChannelId;
    this.manager.emit(
      'playerVoiceChannelIdSet',
      this,
      oldVoiceChannelId,
      voiceChannelId
    );
    return true;
  }

  public setTextChannelId(textChannelId: string): boolean {
    validate(textChannelId, z.string(), 'textChannelId is invalid', TypeError);
    const oldTextChannelId = String(this.textChannelId);
    this.textChannelId = textChannelId;
    this.manager.emit(
      'playerTextChannelIdSet',
      this,
      oldTextChannelId,
      textChannelId
    );
    return true;
  }

  public setAutoPlay(autoPlay: boolean): boolean {
    validate(autoPlay, z.boolean(), 'autoPlay is invalid');

    this.autoPlay = autoPlay;
    this.manager.emit('playerAutoPlaySet', this, autoPlay);
    return true;
  }

  public setAutoLeave(autoLeave: boolean): boolean {
    validate(autoLeave, z.boolean(), 'invalid autoLeave');

    this.autoLeave = autoLeave;
    this.manager.emit('playerAutoLeaveSet', this, autoLeave);
    return true;
  }

  public connect(options: { setMute?: boolean; setDeaf?: boolean }): boolean {
    this.manager.sendPayload(
      this.guildId,
      JSON.stringify({
        op: 4,
        d: {
          guild_id: this.guildId,
          channel_id: this.voiceChannelId,
          self_mute: options?.setMute || false,
          self_deaf: options?.setDeaf || false,
        },
      })
    );

    this.connected = true;
    this.manager.emit('playerConnected', this);
    return true;
  }

  public disconnect(): boolean {
    this.manager.sendPayload(
      this.guildId,
      JSON.stringify({
        op: 4,
        d: {
          guild_id: this.guildId,
          channel_id: null,
          self_mute: false,
          self_deaf: false,
        },
      })
    );

    this.connected = false;
    this.manager.emit('playerDisconnected', this);
    return true;
  }

  public play(): boolean {
    if (!this.queue.size) {
      return false;
    }

    this.current = this.queue.shift();

    this.node.rest.update({
      guildId: this.guildId,
      data: {
        track: {
          encoded: this.current.encoded,
        },
        volume: this.volume,
      },
    });

    this.playing = true;
    this.manager.emit('playerTriggeredPlay', this, this.current);
    return true;
  }

  public pause(): boolean {
    if (this.paused) {
      return true;
    }

    this.node.rest.update({
      guildId: this.guildId,
      data: {
        paused: true,
      },
    });

    this.paused = true;
    this.manager.emit('playerTriggeredPause', this);
    return true;
  }

  public resume(): boolean {
    if (!this.paused) {
      return true;
    }

    this.node.rest.update({
      guildId: this.guildId,
      data: {
        paused: false,
      },
    });

    this.paused = false;
    this.manager.emit('playerTriggeredResume', this);
    return true;
  }

  public stop(options?: {
    destroy?: boolean;
  }): boolean {
    if (!this.playing) {
      return false;
    }

    this.node.rest.update({
      guildId: this.guildId,
      data: {
        track: {
          encoded: undefined,
        },
      },
    });

    options?.destroy ? this.destroy() : this.queue.clear();

    this.playing = false;
    this.manager.emit('playerTriggeredStop', this);
    return true;
  }

  public async skip(position?: number): Promise<boolean> {
    if (!this.queue.size && this.autoPlay) {
      await this.node.rest.update({
        guildId: this.guildId,
        data: {
          track: {
            encoded: undefined,
          },
        },
      });
    } else if (!this.queue.size) {
      return false;
    }

    validate(
      position,
      z
        .number()
        .min(0)
        .max(this.queue.size - 1)
        .optional(),
      'Invalid position'
    );
    const oldTrack = { ...this.current };
    if (position) {
      this.current = this.queue.get(position);
      this.queue.remove(position);

      this.node.rest.update({
        guildId: this.guildId,
        data: {
          track: {
            encoded: this.current.encoded,
          },
        },
      });
    } else {
      this.play();
    }

    this.manager.emit(
      'playerTriggeredSkip',
      this,
      oldTrack as LilyTrack,
      this.current as LilyTrack,
      position ?? 0
    );
    return true;
  }

  public seek(position: number): boolean {
    validate(
      position,
      z
        .number()
        .min(0)
        .max(this.current?.duration || 0),
      'Invalid position'
    );

    this.node.rest.update({
      guildId: this.guildId,
      data: {
        position: position,
      },
    });

    this.manager.emit('playerTriggeredSeek', this, position);
    return true;
  }

  public shuffle(): boolean {
    if (this.queue.size < 2) {
      return false;
    }

    const oldQueue = { ...Array.from(this.queue.values()) };
    this.queue.shuffle();
    this.manager.emit(
      'playerTriggeredShuffle',
      this,
      oldQueue,
      Array.from(this.queue.values())
    );
    return true;
  }

  public setVolume(volume: number): boolean {
    validate(volume, z.number().min(0).max(100), 'volume is invalid');
    const oldVolume = Number(this.volume);
    this.volume = volume;

    this.node.rest.update({
      guildId: this.guildId,
      data: {
        volume: this.volume,
      },
    });

    this.manager.emit('playerChangedVolume', this, oldVolume, volume);
    return true;
  }

  public setLoop(loop: PlayerLoop): boolean {
    validate(
      loop,
      z.enum([PlayerLoop.TRACK, PlayerLoop.QUEUE, PlayerLoop.OFF]),
      'Loop is invalid',
      TypeError
    );
    const oldLoop: PlayerLoop = this.loop;

    this.loop = loop;
    this.manager.emit('playerChangedLoop', this, oldLoop, loop);
    return true;
  }

  public destroy(): boolean {
    if (this.connected) {
      this.disconnect();
    }
    this.queue.clear();
    this.manager.players.delete(this.guildId);

    this.manager.emit('playerDestroyed', this);
    return true;
  }
}
