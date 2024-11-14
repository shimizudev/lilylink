import { EventEmitter } from 'node:events';
import { type Plugin, Structure } from '../helpers/structure';
import {
  LilyNodeState,
  type LilyNodeOptions as NodeOptions,
  type NodeStats,
} from '../models/node';
import type {
  PlayerLoop as Loop,
  LilyPlayer as Player,
  PlayerConfig,
} from '../models/player';
import { LoadType, Source } from '../models/rest';
import { LilyTrack, type LilyTrack as Track } from '../models/track';
import { version } from '../utils';
import type { LilyNodeManager as NodeManager } from './node-manager';
import type { LilyPlayerManager as PlayerManager } from './player-manager';

enum TrackEndReason {
  QueueEnd = 'queueEnd',
  LoadFailed = 'loadFailed',
  Stopped = 'stopped',
  Replaced = 'replaced',
  Cleanup = 'cleanup',
  Finished = 'finished',
}

interface VoicePacket {
  readonly t: 'VOICE_STATE_UPDATE' | 'VOICE_SERVER_UPDATE';
  readonly d: {
    readonly guild_id: string;
    readonly token?: string;
    readonly endpoint?: string;
    readonly session_id?: string;
    readonly channel_id?: string;
    readonly user_id?: string;
  };
}

interface ManagerConfig {
  readonly nodes: readonly NodeOptions[];
  readonly options: ManagerOptions;
  readonly sendPayload: <T>(guildId: string, payload: T) => Promise<void>;
}

interface ManagerOptions {
  readonly clientName?: string;
  readonly clientId?: string;
  readonly defaultPlatformSearch?: Source;
  readonly plugins?: readonly Plugin[];
  readonly noReplace?: boolean;
  readonly nodeLinkFeatures?: boolean;
  readonly previousInArray?: boolean;
  readonly queueStartIndex?: number;
}

interface PlaylistInfo {
  readonly name: string;
  readonly selectedTrack?: number;
}

interface SearchResult {
  readonly loadType: LoadType;
  readonly tracks: Track[];
  readonly playlistInfo: PlaylistInfo;
  readonly data: {
    readonly playlistInfo: PlaylistInfo;
    readonly tracks: readonly Track[];
    readonly pluginInfo: Record<string, unknown>;
  };
  readonly exception?: {
    readonly message: string;
    readonly severity: string;
  };
}

// Strongly typed events interface
interface Events {
  readonly nodeRaw: <T>(node: NodeOptions, player: Player, payload: T) => void;
  readonly nodeCreate: (node: NodeOptions) => void;
  readonly nodeReady: (node: NodeOptions, stats: NodeStats) => void;
  readonly nodeConnected: (node: NodeOptions) => void;
  readonly nodeError: <T>(node: NodeOptions, error: T) => void;
  readonly nodeReconnect: (node: NodeOptions) => void;
  readonly nodeDisconnect: (
    node: NodeOptions,
    code: number,
    reason: string
  ) => void;
  readonly nodeDestroy: (identifier: string) => void;
  readonly playerCreate: (player: Player) => void;
  readonly playerUpdate: <T>(player: Player, track: Track, payload: T) => void;
  readonly playerDestroy: (player: Player) => void;
  readonly playerTriggeredPlay: (player: Player, track: Track) => void;
  readonly playerTriggeredPause: (player: Player) => void;
  readonly playerTriggeredResume: (player: Player) => void;
  readonly playerTriggeredStop: (player: Player) => void;
  readonly playerTriggeredSkip: (
    player: Player,
    oldTrack: Track,
    currentTrack: Track,
    position: number
  ) => void;
  readonly playerTriggeredSeek: (player: Player, position: number) => void;
  readonly playerTriggeredShuffle: (
    player: Player,
    oldQueue: readonly Track[],
    currentQueue: readonly Track[]
  ) => void;
  readonly playerChangedVolume: (
    player: Player,
    oldVolume: number,
    volume: number
  ) => void;
  readonly playerChangedLoop: (
    player: Player,
    oldLoop: Loop,
    loop: Loop
  ) => void;
  readonly playerAutoPlaySet: (player: Player, autoPlay: boolean) => void;
  readonly playerAutoLeaveSet: (player: Player, autoLeave: boolean) => void;
  readonly playerTextChannelIdSet: (
    player: Player,
    oldChannel: string,
    newChannel: string
  ) => void;
  readonly playerVoiceChannelIdSet: (
    player: Player,
    oldChannel: string,
    newChannel: string
  ) => void;
  readonly playerNodeSet: (
    player: Player,
    oldNode: string,
    newNode: string
  ) => void;
  readonly playerConnected: (player: Player) => void;
  readonly playerDisconnected: (player: Player) => void;
  readonly playerMoved: (
    player: Player,
    oldChannel: string,
    newChannel: string
  ) => void;
  readonly playerDestroyed: (player: Player) => void;
  readonly trackStart: (player: Player, track: Track) => void;
  readonly trackEnd: (
    player: Player,
    track: Track,
    type: TrackEndReason,
    payload?: unknown
  ) => void;
  readonly trackStuck: (
    player: Player,
    track: Track,
    threshold: number
  ) => void;
  readonly trackException: (
    player: Player,
    track: Track,
    exception: unknown
  ) => void;
  readonly socketClosed: (
    player: Player,
    code: number,
    reason: string,
    byRemote: boolean
  ) => void;
  readonly queueEnd: (player: Player) => void;
}

export class LilyManager extends EventEmitter {
  public readonly version = version;
  private initialized = false;
  public options: Readonly<ManagerOptions>;
  public readonly sendPayload: <T>(
    guildId: string,
    payload: T
  ) => Promise<void>;
  public readonly nodes: NodeManager;
  public readonly players: PlayerManager;

  constructor(config: Readonly<ManagerConfig>) {
    super();

    this.sendPayload = config.sendPayload;
    this.options = Object.freeze({
      clientName: `LilyLink/${this.version} (Flowery, v${this.version.split('.')[0]}.${this.version.split('.')[1]})`,
      defaultPlatformSearch: Source.YOUTUBE,
      ...config.options,
    });

    const NodeManagerClass = Structure.get('NodeManager');
    // @ts-expect-error: This is flower.
    this.nodes = new NodeManagerClass(this, config.nodes);

    const PlayerManagerClass = Structure.get('PlayerManager');
    // @ts-expect-error: This is flower.
    this.players = new PlayerManagerClass(this);

    if (this.options.plugins?.length) {
      for (const plugin of this.options.plugins) {
        plugin.load(this);
      }
    }
  }

  public init(clientId: string): void {
    if (this.initialized) {
      return;
    }

    this.options = Object.freeze({
      ...this.options,
      clientId,
    });

    this.nodes.init();
    this.initialized = true;
  }

  public async search({
    query,
    source = this.options.defaultPlatformSearch as Source,
    node,
    requester = null,
  }: {
    query: string;
    source?: Source;
    node?: string;
    requester?: unknown;
  }): Promise<SearchResult> {
    const availableNodes = [...this.nodes.cache.values()].filter(
      (n) => n.state === LilyNodeState.CONNECTED
    );
    if (!availableNodes.length) {
      throw new Error('No available nodes to search from.');
    }

    const selectedNode =
      node && this.nodes.cache.has(node)
        ? this.nodes.get(node)
        : this.nodes.best;

    const response = await selectedNode?.rest.loadTracks(source, query);

    if (
      response?.loadType === LoadType.Error ||
      response?.loadType === LoadType.Empty
    ) {
      return response as unknown as SearchResult;
    }

    if (response?.loadType === LoadType.Track) {
      // @ts-expect-error: undefined error lol
      response.data.tracks = [response.data];
    }

    if (response?.loadType === LoadType.Search) {
      // @ts-expect-error: undefined error lol
      response.data.tracks = response.data;
    }

    const tracks = response?.data?.tracks?.map(
      (track) => new LilyTrack(track, requester)
    );

    return Object.freeze({
      ...response,
      tracks: Object.freeze(tracks),
    }) as unknown as SearchResult;
  }

  public async packetUpdate(packet: VoicePacket): Promise<void> {
    if (!['VOICE_STATE_UPDATE', 'VOICE_SERVER_UPDATE'].includes(packet.t)) {
      return;
    }

    const player = this.getPlayer(packet.d.guild_id);
    if (!player) {
      return;
    }

    player.voiceState ??= {};

    if (packet.t === 'VOICE_SERVER_UPDATE') {
      player.voiceState = {
        ...player.voiceState,
        token: packet.d.token,
        endpoint: packet.d.endpoint,
      };

      await this.attemptConnection(packet.d.guild_id);
    } else if (
      packet.t === 'VOICE_STATE_UPDATE' &&
      packet.d.user_id === this.options.clientId
    ) {
      if (!packet.d.channel_id) {
        player.connected = false;
        player.playing = false;
        player.voiceChannelId = '';
        player.voiceState = {};

        this.emit('playerDisconnected', player);
        return;
      }

      if (packet.d.channel_id !== player.voiceChannelId) {
        this.emit(
          'playerMoved',
          player,
          player.voiceChannelId,
          packet.d.channel_id
        );
        player.voiceChannelId = packet.d.channel_id;
      }

      player.voiceState = {
        ...player.voiceState,
        sessionId: packet.d.session_id,
      };

      await this.attemptConnection(packet.d.guild_id);
    }
  }

  private async attemptConnection(guildId: string): Promise<boolean> {
    const player = this.getPlayer(guildId);
    if (!player) {
      return false;
    }

    const { token, sessionId, endpoint } = player.voiceState;
    if (!token || !sessionId || !endpoint) {
      return false;
    }

    await player.node.rest.update({
      guildId,
      data: {
        voice: { sessionId, token, endpoint },
      },
    });

    return true;
  }

  public createPlayer(config: Readonly<PlayerConfig>): Player | undefined {
    return this.players.create(config);
  }

  public getPlayer(guildId: string): Player | undefined {
    return this.players.get(guildId);
  }

  // Type-safe event methods
  public on<T extends keyof Events>(event: T, listener: Events[T]): this {
    return super.on(event, listener);
  }

  public emit<T extends keyof Events>(
    event: T,
    ...args: Parameters<Events[T]>
  ): boolean {
    return super.emit(event, ...args);
  }

  public once<T extends keyof Events>(event: T, listener: Events[T]): this {
    return super.once(event, listener);
  }

  public off<T extends keyof Events>(event: T, listener: Events[T]): this {
    return super.off(event, listener);
  }
}
