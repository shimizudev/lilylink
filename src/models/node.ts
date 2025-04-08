import WebSocket from 'ws';
import { Registry } from '../helpers/registry';
import type { LilyManager } from '../services/base-manager';
import type { LilyPlayer } from './player';
import { LilyRestHandler } from './rest';
import type { LilyTrack } from './track';
import { scAutoPlay, spAutoPlay } from '../helpers/autoPlay';
import { Source } from './rest';
export interface NodeStats {
  players: number;
  playingPlayers: number;
  uptime: number;
  memory: {
    free: number;
    used: number;
    allocated: number;
    reservable: number;
  };
  cpu: {
    cores: number;
    systemLoad: number;
    lavalinkLoad: number;
  };
  frameStats: {
    sent: number;
    nulled: number;
    deficit: number;
  };
}

export interface LilyNodeOptions {
  host: string;
  id?: number;
  identifier?: string;
  port: number;
  password?: string;
  retryDelay?: number;
  retryAmount?: number;
  regions?: string[];
  secure?: boolean;
  sessionId?: string;
}

export enum LilyNodeState {
  CONNECTING = 0,
  CONNECTED = 1,
  DISCONNECTING = 2,
  DISCONNECTED = 3,
}

export class LilyNode {
  public readonly manager: LilyManager | null = null;
  private readonly defaultPassword = 'youshallnotpass';
  private readonly defaultRetryDelay = 30000;
  private readonly defaultRetryAmount = 5;

  public host: string;
  public port: number;
  public identifier: string;
  public password: string;
  public state: LilyNodeState = LilyNodeState.CONNECTING;
  public reconnectTimeout?: NodeJS.Timeout;
  public reconnectAttempts = 0;
  public retryAmount: number;
  public retryDelay: number;
  public regions: string[];
  public secure: boolean;
  public sessionId: string;
  public socket: WebSocket | null;
  public info?: {
    version: string;
  };
  public version?: string;
  public url: string;
  public rest: LilyRestHandler;
  public stats: NodeStats;

  constructor(
    manager: LilyManager,
    {
      host,
      port,
      identifier = '',
      password = this.defaultPassword,
      regions = undefined,
      retryDelay = this.defaultRetryDelay,
      retryAmount = this.defaultRetryAmount,
      secure = false,
      sessionId = '',
    }: LilyNodeOptions
  ) {
    this.manager = manager;
    this.host = host;
    this.port = port;
    this.identifier = identifier;
    this.password = password;
    this.regions = regions?.map?.(x => x?.toLowerCase?.()) || [];
    this.retryDelay = retryDelay;
    this.retryAmount = retryAmount;
    this.secure = secure;
    this.sessionId = sessionId;
    this.socket = null;
    this.url = this.buildUrl();
    this.rest = new LilyRestHandler(this);
    this.stats = this.initializeStats();
  }

  private buildUrl(): string {
    const protocol = this.secure ? 'https' : 'http';
    return `${protocol}://${this.address}/v4/`;
  }

  private initializeStats(): NodeStats {
    return {
      players: 0,
      playingPlayers: 0,
      uptime: 0,
      memory: {
        free: 0,
        used: 0,
        allocated: 0,
        reservable: 0,
      },
      cpu: {
        cores: 0,
        systemLoad: 0,
        lavalinkLoad: 0,
      },
      frameStats: {
        sent: 0,
        nulled: 0,
        deficit: 0,
      },
    };
  }

  public get address(): string {
    return `${this.host}:${this.port}`;
  }

  public connect(): void {
    const headers = {
      Authorization: this.password,
      'User-Id': this.manager?.options.clientId,
      'Client-Name': this.manager?.options.clientName,
    };

    const wsUrl = `${this.secure ? 'wss' : 'ws'}://${this.address}/v4/websocket`;
    this.socket = new WebSocket(wsUrl, { headers });

    this.bindSocketEvents();
  }

  private bindSocketEvents(): void {
    if (!this.socket) {
      return;
    }

    this.socket.on('open', this.open.bind(this));
    this.socket.on('close', this.close.bind(this));
    this.socket.on('message', this.message.bind(this));
    this.socket.on('error', this.error.bind(this));
  }

  public reconnect(): void {
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, this.retryDelay);

    this.manager?.emit('nodeReconnect', this);
  }

  protected open(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.state = LilyNodeState.CONNECTED;
    this.manager?.emit('nodeConnected', this);
  }

  protected close(code: number, reason: string): void {
    if (this.state === LilyNodeState.CONNECTED) {
      this.state = LilyNodeState.DISCONNECTED;
    }

    this.cleanupSocket();

    if (this.retryAmount > this.reconnectAttempts) {
      this.reconnect();
    } else {
      this.socket = null;
      this.state = LilyNodeState.DISCONNECTED;
    }

    this.manager?.emit('nodeDisconnect', this, code, reason);
  }

  private cleanupSocket(): void {
    if (!this.socket) {
      return;
    }

    this.socket.removeAllListeners();
    this.socket.close();
  }

  protected async message(data: Buffer): Promise<void> {
    const payload = this.parsePayload(data);
    if (!payload) {
      return;
    }

    switch (payload.op) {
      case 'ready':
        await this.handleReadyPayload(payload);
        break;
      case 'stats':
        this.handleStatsPayload(payload);
        break;
      case 'playerUpdate':
        await this.handlePlayerUpdatePayload(payload);
        break;
      case 'event':
        await this.handleEventPayload(payload);
        break;
    }
  }

  private parsePayload(data: Buffer) {
    let parsed: Buffer | undefined = data;

    if (Array.isArray(data)) {
      parsed = Buffer.concat(data);
    } else if (data instanceof ArrayBuffer) {
      parsed = Buffer.from(data);
    }

    try {
      return JSON.parse(parsed?.toString('utf8') || '');
    } catch (_error) {
      console.error(_error);
      this.error(new Error('Failed to parse payload'));
      return null;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private async handleReadyPayload(payload: any): Promise<void> {
    this.sessionId = payload.sessionId;
    this.info = await this.rest.getInfo();
    this.version = this.info?.version;
    this.manager?.emit('nodeReady', this, payload);
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private handleStatsPayload(payload: any): void {
    payload.op = undefined;
    this.stats = payload as NodeStats;
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private async handlePlayerUpdatePayload(payload: any): Promise<void> {
    const player = this.manager?.getPlayer(payload.guildId);
    if (!player?.current) {
      return;
    }

    player.connected = payload.state.connected;
    player.current.position = payload.state.position;
    player.current.time = payload.state.time;
    player.ping = payload.state.ping;

    this.manager?.emit('playerUpdate', player, player.current, payload);
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private async handleEventPayload(payload: any): Promise<void> {
    const player = this.manager?.getPlayer(payload.guildId);
    if (!player) {
      return;
    }

    this.manager?.emit('nodeRaw', this, player, payload);

    switch (payload.type) {
      case 'TrackStartEvent':
        await this.handleTrackStart(player);
        break;
      case 'TrackEndEvent':
        await this.handleTrackEnd(player, payload);
        break;
      case 'TrackStuckEvent':
        this.handleTrackStuck(player, payload);
        break;
      case 'TrackExceptionEvent':
        this.handleTrackException(player, payload);
        break;
      case 'WebSocketClosedEvent':
        this.handleWebSocketClosed(player, payload);
        break;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private async handleTrackStart(player: any): Promise<void> {
    player.playing = true;
    player.paused = false;
    this.manager?.emit('trackStart', player, player.current);
  }

  private async handleTrackEnd(
    player: LilyPlayer,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    payload: any
  ): Promise<void> {
    player.playing = false;
    player.paused = false;

    if (this.manager?.options.previousInArray) {
      (player.previous as LilyTrack[]).push(
        new (Registry.get('Track'))({
          ...payload.track,
          encoded: player.current?.encoded,
        })
      );
    } else {
      player.previous = new (Registry.get('Track'))({
        ...payload.track,
        encoded: player.current?.encoded,
      });
    }

    this.manager?.emit(
      'trackEnd',
      player,
      player.current as LilyTrack,
      payload.reason,
      payload
    );

    if (['loadFailed', 'cleanup'].includes(payload.reason)) {
      await this.handleFailedTrack(player);
      return;
    }

    if (payload.reason === 'replaced') {
      return;
    }

    if (player.loop === 1) {
      await this.handleTrackLoop(player);
      return;
    }

    if (player.loop === 2 && player.current) {
      await this.handleQueueLoop(player);
      return;
    }

    if (player.queue.size) {
      player.play();
      return;
    }

    if (player.autoPlay) {
      await this.handleAutoPlay(player, payload);
      return;
    }

    if (!player.queue.size) {
      player.current = null;
      this.manager?.emit('queueEnd', player);

      if (player.autoLeave) {
        player.destroy();
        return;
      }
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private async handleFailedTrack(player: any): Promise<void> {
    if (player.queue.size) {
      player.play();
    } else {
      player.queue.clear();
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private async handleTrackLoop(player: any): Promise<void> {
    await this.rest.update({
      guildId: player.guildId,
      data: {
        track: {
          encoded: player.current.encoded,
        },
      },
    });
  }

  private async handleQueueLoop(player: LilyPlayer): Promise<void> {
    // @ts-expect-error: This is flower.
    player.current.position = 0;
    // @ts-expect-error: This is flower.
    player.current.time = 0;
    player.queue.add(player.current as LilyTrack);
    player.play();
  }

  private async handleAutoPlay(
    player: LilyPlayer,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    payload: any
  ): Promise<void> {
    if (payload.reason === 'stopped' || !player.autoPlay) {
      return;
    }

    if (player.current?.sourceName === 'youtube') {
    try {
      const uri = `https://www.youtube.com/watch?v=${player.current?.identifier}&list=RD${player.current?.identifier}`;
      const res = await this.manager?.search({ query: uri, requester: 'AutoPlay(YouTube)' });

      if (!res?.tracks || ['loadFailed', 'cleanup'].includes(res.loadType)) {
        return;
      }

      const filteredTracks = res.tracks.filter(
        (track) => track.identifier !== player.current?.identifier
      );

      if (filteredTracks.length === 0) {
        return;
      }

      const randomTrack =
        filteredTracks[Math.floor(Math.random() * filteredTracks.length)];
      player.queue.add(randomTrack as LilyTrack);
      player.play();
    } catch (error) {
      console.error('AutoPlay error:', error);
      return this.destroy();
    }
  } else if (player.current?.sourceName === 'spotify') {
    try {
      spAutoPlay(player.current?.identifier ?? '').then(async (data) => {
        const res = await this.manager?.search({ query: `https://open.spotify.com/track/${data}`, requester: 'AutoPlay(Spotify)' });
        
        if (!res?.tracks || ['error', 'empty'].includes(res.loadType)) {
          return;
        }
        const filteredTracks = res.tracks.filter(
          (track) => track.identifier !== player.current?.identifier
        );

        if (filteredTracks.length === 0) {
          return;
        }
        
        let track = filteredTracks[Math.floor(Math.random() * Math.floor(filteredTracks.length))];
        player.queue.add(track as LilyTrack);
        player.play();
      });
    } catch (error) {
      console.error('AutoPlay error:', error);
      return this.destroy();
    }
  } else if(player.current?.sourceName === 'soundcloud') {
    try {
      scAutoPlay(player.current?.url ?? '').then(async (data) => {
        const res = await this.manager?.search({ query: `${data}`, source: Source.SOUNDCLOUD, requester: 'AutoPlay(SoundCloud)'});
        if (!res?.tracks || ['error', 'empty'].includes(res.loadType)) {
          return;
        }
        const filteredTracks = res.tracks.filter(
          (track) => track.url !== player.current?.url
        );

        if (filteredTracks.length === 0) {
          return;
        }
        
        let track = filteredTracks[Math.floor(Math.random() * Math.floor(filteredTracks.length))];
        player.queue.add(track as LilyTrack);
        player.play();
      });
  } catch (error) {
    console.error('AutoPlay error:', error);
    return this.destroy();
  }
  }
}
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private handleTrackStuck(player: LilyPlayer, payload: any): void {
    this.manager?.emit(
      'trackStuck',
      player,
      player.current as LilyTrack,
      payload.thresholdMs
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private handleTrackException(player: LilyPlayer, payload: any): void {
    this.manager?.emit(
      'trackException',
      player,
      player.current as LilyTrack,
      payload.exception
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  private handleWebSocketClosed(player: LilyPlayer, payload: any): void {
    this.manager?.emit(
      'socketClosed',
      player,
      payload.code,
      payload.reason,
      payload.byRemote
    );
  }

  protected error(error: Error): void {
    this.manager?.emit('nodeError', this, error);
  }

  public destroy(): void {
    this.socket?.close();
    this.state = LilyNodeState.DISCONNECTED;
  }
}
