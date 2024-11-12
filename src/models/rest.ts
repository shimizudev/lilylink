import { lilyRequest } from '../helpers/request';
import type { LilyNode } from './node';
import type { Track } from './track';

export enum Source {
  YOUTUBE = 'ytsearch',
  SOUNDCLOUD = 'scsearch',
  YOUTUBE_MUSIC = 'ytmsearch',
  SPOTIFY = 'spsearch',
}

export enum LoadType {
  Track = 'track',
  Playlist = 'playlist',
  Search = 'search',
  Empty = 'empty',
  Error = 'error',
}

export interface ObjectTrack {
  encoded?: string;
  identifier?: string;
  userData?: unknown;
}

export interface VoiceState {
  token?: string;
  sessionId?: string;
  endpoint?: string;
}

export interface RESTOptions {
  guildId: string;
  data: RESTData;
}

export interface RESTData {
  track?: ObjectTrack;
  identifier?: string;
  startTime?: number;
  endTime?: number;
  volume?: number;
  position?: number;
  paused?: boolean;
  filters?: object;
  voice?: VoiceState;
}
export interface RESTLoadTracks {
  loadType: LoadType;
  data?: LoadResultData;
}

export interface LoadResultData {
  info: PlaylistInfo;
  tracks?: Track[];
  pluginInfo: object;
}

export interface PlaylistInfo {
  name: string;
  selectedTrack?: number;
}

export class LilyRestHandler {
  public node: LilyNode | null = null;
  public url: string | null = null;
  public defaultHeaders: Record<string, string> | null = null;

  private async makeRequest<T>(url: string, options: RequestInit = {}) {
    const [res, error] = await lilyRequest<T>(url, options);
    if (error) {
      throw error;
    }
    return res;
  }

  constructor(node: LilyNode) {
    this.node = node;
    this.url = `http${this.node.secure ? 's' : ''}://${this.node.address}/v4`;
    this.defaultHeaders = {
      Authorization: this.node.password as string,
      Accept: 'application/json',
      'User-Agent': `LilyLink/${node.manager?.version} (Flowery, v${node.manager?.version.split('.')[0]}.${node.manager?.version.split('.')[1]})`,
      'Content-Type': 'application/json',
      'accept-encoding': 'br, gzip, deflate',
    };
  }

  public async loadTracks(source: Source, query: string) {
    let identifier = '';

    if (query.startsWith('http')) {
      identifier = query;
    } else {
      identifier = `${source}:${query}`;
    }

    const params = new URLSearchParams();
    params.set('identifier', identifier);

    const res = await this.makeRequest<RESTLoadTracks>(
      `${this.url}/loadtracks?${params.toString()}`,
      { headers: this.defaultHeaders as HeadersInit }
    );

    return res;
  }

  public async update<T>(data: RESTOptions) {
    const res = await this.makeRequest<T>(
      `${this.url}/sessions/${this.node?.sessionId}/players/${data.guildId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data.data),
        headers: this.defaultHeaders as HeadersInit,
      }
    );

    return res;
  }

  public async destroy<T>(guildId: string) {
    const res = await this.makeRequest<T>(
      `${this.url}/sessions/${this.node?.sessionId}/players/${guildId}`,
      {
        method: 'DELETE',
        headers: this.defaultHeaders as HeadersInit,
      }
    );

    return res;
  }
  public getInfo<T>() {
    return this.makeRequest<T>(`${this.url}/info`, {
      method: 'GET',
      headers: this.defaultHeaders as HeadersInit,
    });
  }
  public getStats<T>(): Promise<unknown> {
    return this.makeRequest<T>(`${this.url}/stats`, {
      method: 'GET',
      headers: this.defaultHeaders as HeadersInit,
    });
  }
  public getVersion<T>(): Promise<unknown> {
    return this.makeRequest<T>(
      `http${this.node?.secure ? 's' : ''}://${this.node?.address}/version`,
      {
        method: 'GET',
        headers: this.defaultHeaders as HeadersInit,
      }
    );
  }
  public async decodeTrack<T>(encodedTrack: string) {
    return this.makeRequest<T>(
      `${this.url}/decodetrack?encodedTrack=${encodeURIComponent(encodedTrack)}`,
      {
        method: 'GET',
        headers: this.defaultHeaders as HeadersInit,
      }
    );
  }
  public async decodeTracks<T>(encodedTracks: string[]) {
    return this.makeRequest<T>(`${this.url}/decodetracks`, {
      method: 'POST',
      body: JSON.stringify(encodedTracks),
      headers: this.defaultHeaders as HeadersInit,
    });
  }
  public async getPlayers<T>(sessionId: string) {
    return this.makeRequest<T>(`${this.url}/sessions/${sessionId}/players`, {
      method: 'GET',
      headers: this.defaultHeaders as HeadersInit,
    });
  }
  public async getPlayer<T>(sessionId: string, guildId: string) {
    return this.makeRequest<T>(
      `${this.url}/sessions/${sessionId}/players/${guildId}`,
      {
        method: 'GET',
        headers: this.defaultHeaders as HeadersInit,
      }
    );
  }
  public async getRoutePlannerStatus<T>() {
    return this.makeRequest<T>(`${this.url}/routeplanner/status`, {
      method: 'GET',
      headers: this.defaultHeaders as HeadersInit,
    });
  }
  public async unmarkFailedAddress<T>(address: string) {
    return this.makeRequest<T>(`${this.url}/routeplanner/free/address`, {
      method: 'POST',
      body: JSON.stringify({ address }),
      headers: this.defaultHeaders as HeadersInit,
    });
  }
  public async unmarkAllFailedAddresses<T>() {
    return this.makeRequest<T>(`${this.url}/routeplanner/free/all`, {
      method: 'POST',
      headers: this.defaultHeaders as HeadersInit,
    });
  }
}
