import { z } from 'zod';
import { Registry } from '../helpers/registry';
import {
  type LilyNode,
  type LilyNodeOptions,
  LilyNodeState,
} from '../models/node';
import type { LilyManager } from './base-manager';

const nodeOptionsSchema = z
  .object({
    host: z.string().min(1),
    id: z.number().int().positive().optional(),
    identifier: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535),
    password: z.string().min(1).optional(),
    retryDelay: z.number().int().min(100).max(60000).optional().default(5000),
    retryAmount: z.number().int().min(1).max(10).optional().default(3),
    regions: z.array(z.string().min(1)).optional().default([]),
    secure: z.boolean().optional().default(false),
    sessionId: z.string().min(1).optional(),
  })
  .strict();

export type ValidatedNodeOptions = z.infer<typeof nodeOptionsSchema>;

export const SortTypeNodeEnum = z.enum([
  'players',
  'playingPlayers',
  'memory',
  'cpuLavalink',
  'cpuSystem',
  'uptime',
  'random',
]);

export type SortTypeNode = z.infer<typeof SortTypeNodeEnum>;

interface NodeStats {
  players: number;
  playingPlayers: number;
  memory: {
    used: number;
  };
  cpu: {
    lavalinkLoad: number;
    systemLoad: number;
  };
  uptime: number;
}

export class LilyNodeManager {
  private readonly manager: LilyManager;
  public cache: Map<string | number, LilyNode>;
  private readonly maxCacheSize = 100;

  constructor(manager: LilyManager, nodes: LilyNodeOptions[]) {
    this.manager = manager;
    this.cache = new Map();
    const validatedNodes = nodes.map((node) => this.validateNode(node));

    if (validatedNodes.length === 0) {
      throw new Error('At least one node configuration is required');
    }

    for (const node of validatedNodes) {
      this.add(node);
    }
  }

  private validateNode(options: LilyNodeOptions): ValidatedNodeOptions {
    try {
      return nodeOptionsSchema.parse(options);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        throw new Error(`Invalid node configuration: ${issues}`);
      }
      throw error;
    }
  }

  public init(): void {
    if (this.cache.size === 0) {
      throw new Error('No nodes available to initialize');
    }

    for (const node of this.cache.values()) {
      try {
        node.connect();
      } catch (error) {
        this.manager.emit('nodeError', node, error);
      }
    }
  }

  public add(options: LilyNodeOptions): void {
    if (this.cache.size >= this.maxCacheSize) {
      throw new Error(
        `Cannot add more nodes. Maximum capacity (${this.maxCacheSize}) reached`
      );
    }

    const validatedOptions = this.validateNode(options);
    const identifier = validatedOptions.identifier ?? validatedOptions.host;

    if (this.cache.has(identifier)) {
      throw new Error(`Node with identifier "${identifier}" already exists`);
    }

    const NodeClass = Registry.get('Node');
    const node = new NodeClass(this.manager, validatedOptions);
    this.cache.set(identifier, node);

    this.manager.emit('nodeCreate', node);
  }

  public remove(identifier: string): void {
    const node = this.cache.get(identifier);
    if (!node) {
      throw new Error(`Node with identifier "${identifier}" not found`);
    }

    try {
      node.destroy();
      this.cache.delete(identifier);
      this.manager.emit('nodeDestroy', identifier);
    } catch (error) {
      throw new Error(
        `Failed to remove node "${identifier}": ${(error as Error).message}`
      );
    }
  }

  public get(identifier: string | number): LilyNode | undefined {
    if (identifier === 'default' && this.cache.size === 1) {
      return this.cache.values().next().value;
    }

    const node = this.cache.get(identifier);
    if (!node) {
      throw new Error(`Node with identifier "${identifier}" not found`);
    }

    return node;
  }

  public get best(): LilyNode {
    const connectedNodes = [...this.cache.values()].filter(
      (node) => node.state === LilyNodeState.CONNECTED
    );

    if (connectedNodes.length === 0) {
      throw new Error('No connected nodes available');
    }

    return connectedNodes.sort((a, b) => a.stats.players - b.stats.players)[0];
  }

  public sortByUsage(sortType: SortTypeNode): LilyNode {
    SortTypeNodeEnum.parse(sortType);

    const connectedNodes = [...this.cache.values()].filter(
      (node) => node.state === LilyNodeState.CONNECTED
    );

    if (connectedNodes.length === 0) {
      throw new Error('No connected nodes available');
    }

    const getSortValue = (node: LilyNode): number => {
      const stats = node.stats as NodeStats;
      switch (sortType) {
        case 'players':
          return stats.players;
        case 'playingPlayers':
          return stats.playingPlayers;
        case 'memory':
          return stats.memory.used;
        case 'cpuLavalink':
          return stats.cpu.lavalinkLoad;
        case 'cpuSystem':
          return stats.cpu.systemLoad;
        case 'uptime':
          return stats.uptime;
        case 'random':
          return Math.random();
        default:
          throw new Error(`Invalid sort type: ${sortType}`);
      }
    };

    return connectedNodes.sort((a, b) => getSortValue(a) - getSortValue(b))[0];
  }

  public cleanup(): void {
    for (const [identifier, node] of this.cache) {
      try {
        node.destroy();
        this.cache.delete(identifier);
      } catch (error) {
        this.manager.emit('nodeError', node, error);
      }
    }
  }
}
