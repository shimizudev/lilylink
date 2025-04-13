import type { LilyTrack } from './track';

class QueueNode {
  constructor(
    public value: LilyTrack,
    public prev: QueueNode | null = null,
    public next: QueueNode | null = null
  ) {}
}

export class LilyQueue {
  private tracks: Set<LilyTrack>;
  private head: QueueNode | null;
  private tail: QueueNode | null;
  private nodeCount: number;
  private startIndex: number;

  constructor(queueStartIndex = 0) {
    this.tracks = new Set<LilyTrack>();
    this.head = null;
    this.tail = null;
    this.nodeCount = 0;
    this.startIndex = Math.max(0, queueStartIndex);
  }

  public setStartIndex(index: number): void {
    this.startIndex = Math.max(0, index);
  }

  public getStartIndex(): number {
    return this.startIndex;
  }

  public add(track: LilyTrack): boolean {
    try {
      const node = new QueueNode(track);
      if (this.head) {
        node.prev = this.tail;
        this.tail!.next = node;
        this.tail = node;
      } else {
        this.head = node;
        this.tail = node;
      }
      this.tracks.add(track);
      this.nodeCount++;
      return true;
    } catch {
      return false;
    }
  }

  public get(position: number): LilyTrack {
    const adjustedPosition = position - this.startIndex;
    if (adjustedPosition < 0 || adjustedPosition >= this.nodeCount) {
      throw new Error('Position out of bounds');
    }

    let current = this.head;
    for (let i = 0; i < adjustedPosition; i++) {
      current = current!.next;
    }
    return current!.value;
  }

  public has(track: LilyTrack): boolean {
    return this.tracks.has(track);
  }

  public remove(position: number): boolean {
    const adjustedPosition = position - this.startIndex;
    if (adjustedPosition < 0 || adjustedPosition >= this.nodeCount) {
      return false;
    }

    let current = this.head;
    for (let i = 0; i < adjustedPosition; i++) {
      current = current!.next;
    }

    if (current === this.head) {
      this.head = current!.next;
    }
    if (current === this.tail) {
      this.tail = current!.prev;
    }
    if (current!.prev) {
      current!.prev.next = current!.next;
    }
    if (current!.next) {
      current!.next.prev = current!.prev;
    }

    this.tracks.delete(current!.value);
    this.nodeCount--;
    return true;
  }

  public shift(): LilyTrack {
    if (!this.head) {
      throw new Error('Queue is empty');
    }

    const track = this.head.value;
    this.head = this.head.next;
    if (this.head) {
      this.head.prev = null;
    } else {
      this.tail = null;
    }

    this.tracks.delete(track);
    this.nodeCount--;
    return track;
  }

  public unshift(track: LilyTrack): boolean {
    try {
      const node = new QueueNode(track);
      if (this.head) {
        node.next = this.head;
        this.head.prev = node;
        this.head = node;
      } else {
        this.head = node;
        this.tail = node;
      }
      this.tracks.add(track);
      this.nodeCount++;
      return true;
    } catch {
      return false;
    }
  }

  public pop(): LilyTrack {
    if (!this.tail) {
      throw new Error('Queue is empty');
    }

    const track = this.tail.value;
    this.tail = this.tail.prev;
    if (this.tail) {
      this.tail.next = null;
    } else {
      this.head = null;
    }

    this.tracks.delete(track);
    this.nodeCount--;
    return track;
  }

  public clear(): boolean {
    try {
      this.tracks.clear();
      this.head = null;
      this.tail = null;
      this.nodeCount = 0;
      return true;
    } catch {
      return false;
    }
  }

  public shuffle(): boolean {
    if (this.nodeCount < 2) {
      throw new Error('There must be at least 2 songs in queue!');
    }

    const positions: QueueNode[] = [];
    let current = this.head;
    while (current) {
      positions.push(current);
      current = current.next;
    }

    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      if (i !== j) {
        const temp = positions[i].value;
        positions[i].value = positions[j].value;
        positions[j].value = temp;
      }
    }
    return true;
  }

  public get size(): number {
    return this.nodeCount;
  }

  public *values(): IterableIterator<LilyTrack> {
    let current = this.head;
    while (current) {
      yield { ...current.value };
      current = current.next;
    }
  }

  public forEach(callbackfn: (value: LilyTrack, index: number) => void): void {
    let current = this.head;
    let index = this.startIndex;
    while (current) {
      callbackfn(current.value, index);
      current = current.next;
      index++;
    }
  }

  public map<T>(callbackfn: (value: LilyTrack, index: number) => T): T[] {
    const result: T[] = new Array(this.nodeCount);
    let current = this.head;
    let arrayIndex = 0;
    let queueIndex = this.startIndex;
    while (current) {
      result[arrayIndex++] = callbackfn(current.value, queueIndex);
      current = current.next;
      queueIndex++;
    }
    return result;
  }
}
