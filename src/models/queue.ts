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

  constructor() {
    this.tracks = new Set<LilyTrack>();
    this.head = null;
    this.tail = null;
    this.nodeCount = 0;
  }

  public add(track: LilyTrack): boolean {
    try {
      const node = new QueueNode(track);
      if (this.head) {
        node.prev = this.tail;
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
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
    if (position < 0 || position >= this.nodeCount) {
      throw new Error('Position out of bounds');
    }

    let current = this.head;
    for (let i = 0; i < position; i++) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      current = current!.next;
    }
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    return current!.value;
  }

  public has(track: LilyTrack): boolean {
    return this.tracks.has(track);
  }

  public remove(position: number): boolean {
    if (position < 0 || position >= this.nodeCount) {
      return false;
    }

    let current = this.head;
    for (let i = 0; i < position; i++) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      current = current!.next;
    }

    if (current === this.head) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      this.head = current!.next;
    }
    if (current === this.tail) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      this.tail = current!.prev;
    }
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    if (current!.prev) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      current!.prev.next = current!.next;
    }
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    if (current!.next) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      current!.next.prev = current!.prev;
    }

    // biome-ignore lint/style/noNonNullAssertion: <explanation>
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
    if (this.nodeCount <= 1) {
      return true;
    }

    // Fisher-Yates shuffle using linked list
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
      yield current.value;
      current = current.next;
    }
  }

  public forEach(callbackfn: (value: LilyTrack) => void): void {
    let current = this.head;
    while (current) {
      callbackfn(current.value);
      current = current.next;
    }
  }

  public map<T>(callbackfn: (value: LilyTrack) => T): T[] {
    const result: T[] = new Array(this.nodeCount);
    let current = this.head;
    let index = 0;
    while (current) {
      result[index++] = callbackfn(current.value);
      current = current.next;
    }
    return result;
  }
}
