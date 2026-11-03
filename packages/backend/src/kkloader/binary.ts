import { decode } from "@msgpack/msgpack";
import { resolve } from "node:path";

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type FileLike = string | Uint8Array | ArrayBuffer | Buffer;

export class BinaryReader {
  readonly buffer: Uint8Array<ArrayBufferLike>;
  private view: DataView;
  offset = 0;
  /** Set when a length-prefixed read was shorter than declared (truncated file). */
  truncated = false;

  constructor(data: Uint8Array) {
    this.buffer = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get remaining(): number {
    return this.buffer.byteLength - this.offset;
  }

  tell(): number {
    return this.offset;
  }

  seek(pos: number): void {
    this.offset = pos;
  }

  private require(length: number): void {
    if (this.offset + length > this.buffer.byteLength) {
      throw new RangeError(
        `Unexpected EOF: need ${length} bytes at ${this.offset}, have ${this.remaining}`,
      );
    }
  }

  readBytes(length: number): Uint8Array<ArrayBufferLike> {
    this.require(length);
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readI8(): number {
    this.require(1);
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readU8(): number {
    this.require(1);
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  /** Little-endian int32 (`struct "i"`). */
  readI32(): number {
    this.require(4);
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  /** Little-endian int64 as number (`struct "q"`). Safe for sizes used here. */
  readI64(): number {
    this.require(8);
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return Number(v);
  }

  /** Little-endian float32 (`struct "f"`). */
  readF32(): number {
    this.require(4);
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  /** Big-endian uint32 (`struct ">I"`). */
  readU32BE(): number {
    this.require(4);
    const v = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return v;
  }

  readBool(): boolean {
    return this.readI8() !== 0;
  }

  /**
   * Length-prefixed blob; length type matches Python struct chars i/b/q.
   * On truncated files, Python's `read(n)` returns short data — we match that
   * and set `truncated` so callers can detect incomplete payloads.
   */
  loadLength(kind: "i" | "b" | "q"): Uint8Array {
    const length =
      kind === "i" ? this.readI32() : kind === "b" ? this.readI8() : this.readI64();
    if (length < 0) {
      throw new RangeError(`Negative length: ${length}`);
    }
    if (length > this.remaining) {
      this.truncated = true;
      return this.readBytes(this.remaining);
    }
    return this.readBytes(length);
  }

  /** .NET-style 7-bit length-prefixed string bytes. */
  loadStringBytes(): Uint8Array {
    let length = 0;
    let i = 0;
    for (;;) {
      const serial = this.readU8();
      length |= (0b01111111 & serial) << (7 * i);
      if (serial >> 7 !== 1) break;
      i += 1;
    }
    return this.readBytes(length);
  }

  loadUtf8String(): string {
    return new TextDecoder("utf-8").decode(this.loadStringBytes());
  }

  loadLengthUtf8(kind: "i" | "b" | "q"): string {
    return new TextDecoder("utf-8").decode(this.loadLength(kind));
  }

  peekBytes(length: number): Uint8Array {
    return this.buffer.subarray(this.offset, this.offset + length);
  }

  hasPngMagic(): boolean {
    const head = this.peekBytes(PNG_MAGIC.length);
    if (head.length < PNG_MAGIC.length) return false;
    return PNG_MAGIC.every((b, i) => head[i] === b);
  }

  /** Extract PNG from current offset through IEND (inclusive). */
  getPng(): Uint8Array {
    const origin = this.offset;
    const sig = this.readBytes(8);
    if (!PNG_MAGIC.every((b, i) => sig[i] === b)) {
      throw new Error("Invalid PNG signature");
    }
    for (;;) {
      const length = this.readU32BE();
      const type = this.readBytes(4);
      this.readBytes(length + 4); // data + CRC
      if (
        type[0] === 0x49 &&
        type[1] === 0x45 &&
        type[2] === 0x4e &&
        type[3] === 0x44
      ) {
        break;
      }
    }
    return this.buffer.subarray(origin, this.offset);
  }

  readRemaining(): Uint8Array {
    return this.readBytes(this.remaining);
  }
}

export function msgUnpack(data: Uint8Array | null | undefined): unknown {
  if (data == null) return null;
  try {
    return decode(data, { useBigInt64: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/out of bounds/i.test(message) || /unexpected end/i.test(message)) {
      throw new RangeError(`Truncated msgpack payload (${data.byteLength} bytes)`);
    }
    throw err;
  }
}

export async function toReader(
  filelike: FileLike,
): Promise<{ reader: BinaryReader; originalPath: string | null }> {
  if (typeof filelike === "string") {
    const buf = new Uint8Array(await Bun.file(filelike).arrayBuffer());
    return { reader: new BinaryReader(buf), originalPath: resolve(filelike) };
  }
  if (filelike instanceof ArrayBuffer) {
    return { reader: new BinaryReader(new Uint8Array(filelike)), originalPath: null };
  }
  return { reader: new BinaryReader(new Uint8Array(filelike)), originalPath: null };
}

export function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const bParts = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const va = aParts[i] ?? 0;
    const vb = bParts[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

export type LstInfoEntry = {
  name: string;
  version: string;
  pos: number;
  size: number;
};

export function readLstinfoBlocks(reader: BinaryReader): {
  rawPayload: Uint8Array;
  entries: LstInfoEntry[];
  originalOrder: string[];
  serializedOrder: string[];
} {
  const index = msgUnpack(reader.loadLength("i")) as { lstInfo: LstInfoEntry[] };
  const rawPayload = reader.loadLength("q");
  const entries = index.lstInfo;
  const originalOrder = entries.map((e) => e.name);
  const serializedOrder = [...entries]
    .sort((a, b) => a.pos - b.pos)
    .map((e) => e.name);
  return { rawPayload, entries, originalOrder, serializedOrder };
}
