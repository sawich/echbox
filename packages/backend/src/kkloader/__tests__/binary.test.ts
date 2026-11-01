import { describe, expect, test } from "bun:test";
import { encode } from "@msgpack/msgpack";
import {
  BinaryReader,
  compareVersions,
  msgUnpack,
  readLstinfoBlocks,
} from "../binary";
import { fixtureBytes } from "./helpers";

describe("BinaryReader", () => {
  test("reads little-endian primitives", () => {
    const buf = new Uint8Array(20);
    const view = new DataView(buf.buffer);
    view.setInt32(0, -42, true);
    view.setFloat32(4, 1.5, true);
    view.setInt8(8, 1);
    view.setBigInt64(9, 123n, true);

    const reader = new BinaryReader(buf);
    expect(reader.readI32()).toBe(-42);
    expect(reader.readF32()).toBeCloseTo(1.5);
    expect(reader.readBool()).toBe(true);
    expect(reader.readI64()).toBe(123);
  });

  test("loadLength and 7-bit strings", () => {
    const payload = new TextEncoder().encode("hello");
    const bytes = new Uint8Array([payload.length, ...payload, 5, ...payload]);
    const reader = new BinaryReader(bytes);
    expect(new TextDecoder().decode(reader.loadLength("b"))).toBe("hello");
    expect(reader.loadUtf8String()).toBe("hello");
  });

  test("PNG extract from character fixture", async () => {
    const raw = await fixtureBytes("chara", "kk_chara.png");
    const reader = new BinaryReader(raw);
    expect(reader.hasPngMagic()).toBe(true);
    const png = reader.getPng();
    expect(png[0]).toBe(0x89);
    expect(png.byteLength).toBeGreaterThan(8);
    expect(reader.remaining).toBeGreaterThan(0);
  });

  test("msgUnpack + lstinfo round-trip shape", () => {
    const blocks = encode({
      lstInfo: [
        { name: "Parameter", version: "0.0.0", pos: 0, size: 3 },
        { name: "Status", version: "0.0.0", pos: 3, size: 2 },
      ],
    });
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const stream = new Uint8Array([
      ...new Uint8Array(new Int32Array([blocks.byteLength]).buffer),
      ...blocks,
      ...new Uint8Array(new BigInt64Array([BigInt(payload.byteLength)]).buffer),
      ...payload,
    ]);
    const reader = new BinaryReader(stream);
    const info = readLstinfoBlocks(reader);
    expect(info.originalOrder).toEqual(["Parameter", "Status"]);
    expect(info.serializedOrder).toEqual(["Parameter", "Status"]);
    expect(info.rawPayload.byteLength).toBe(5);
  });
});

describe("compareVersions", () => {
  test("orders dotted versions", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.1.2.1", "1.1.2.0")).toBe(1);
    expect(compareVersions("0.0.2", "0.0.2")).toBe(0);
  });
});

describe("msgUnpack", () => {
  test("decodes maps with string keys", () => {
    const packed = encode({ nickname: "test", age: 18 });
    expect(msgUnpack(packed)).toEqual({ nickname: "test", age: 18 });
  });
});
