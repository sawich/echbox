import {
  type BinaryReader,
  type FileLike,
  readLstinfoBlocks,
  toReader,
} from "../binary";
import { type BlockData, createBlock } from "./blocks";

const MODULE_NAMES = new Set([
  "Custom",
  "Coordinate",
  "Parameter",
  "Status",
  "About",
  "KKEx",
]);

export type KoikatuCharaSummary = {
  productNo: number;
  header: string;
  version: string;
  name: string;
  blocks: string[];
  unknownBlocks: string[];
  hasKkex: boolean;
  originalFilePath: string | null;
  imageSize: number | null;
  faceImageSize: number;
};

export class KoikatuCharaData {
  image: Uint8Array | null = null;
  productNo = 0;
  header!: Uint8Array;
  version!: Uint8Array;
  faceImage!: Uint8Array;
  blockdata: string[] = [];
  unknownBlockdata: string[] = [];
  originalFilePath: string | null = null;
  originalLstinfoOrder: string[] = [];
  serializedLstinfoOrder: string[] = [];
  blocks: Record<string, BlockData> = {};

  /** Sync load from an existing reader (used for scene-embedded cards). */
  static loadFromReader(
    reader: BinaryReader,
    containsPng = true,
  ): KoikatuCharaData {
    const kc = new KoikatuCharaData();

    if (containsPng) {
      kc.image = reader.getPng();
    }

    kc.productNo = reader.readI32();
    kc.header = reader.loadLength("b");
    kc.version = reader.loadLength("b");
    kc.faceImage = reader.loadLength("i");

    const { rawPayload, entries, originalOrder, serializedOrder } =
      readLstinfoBlocks(reader);
    kc.originalLstinfoOrder = originalOrder;
    kc.serializedLstinfoOrder = serializedOrder;

    for (const entry of entries) {
      const blockBytes = rawPayload.subarray(
        entry.pos,
        entry.pos + entry.size,
      );
      kc.blockdata.push(entry.name);
      kc.blocks[entry.name] = createBlock(entry.name, blockBytes, entry.version);
      if (!MODULE_NAMES.has(entry.name)) {
        kc.unknownBlockdata.push(entry.name);
      }
    }

    return kc;
  }

  static async load(
    filelike: FileLike,
    containsPng = true,
  ): Promise<KoikatuCharaData> {
    const { reader, originalPath } = await toReader(filelike);
    const kc = KoikatuCharaData.loadFromReader(reader, containsPng);
    kc.originalFilePath = originalPath;
    return kc;
  }

  get(name: string): BlockData {
    const block = this.blocks[name];
    if (!block) throw new Error(`no such blockdata: ${name}`);
    return block;
  }

  get name(): string {
    const parameter = this.blocks.Parameter?.data;
    if (!parameter || typeof parameter !== "object") return "";
    const p = parameter as Record<string, unknown>;
    const fullname = String(p.fullname ?? "").trim();
    if (fullname) return fullname;
    const lastname = String(p.lastname ?? "").trim();
    const firstname = String(p.firstname ?? "").trim();
    const nickname = String(p.nickname ?? "").trim();
    const name = `${lastname} ${firstname}`.trim();
    return nickname ? `${name} ( ${nickname} )`.trim() : name;
  }

  summary(): KoikatuCharaSummary {
    return {
      productNo: this.productNo,
      header: new TextDecoder().decode(this.header),
      version: new TextDecoder().decode(this.version),
      name: this.name,
      blocks: [...this.blockdata],
      unknownBlocks: [...this.unknownBlockdata],
      hasKkex: this.blockdata.includes("KKEx"),
      originalFilePath: this.originalFilePath,
      imageSize: this.image?.byteLength ?? null,
      faceImageSize: this.faceImage.byteLength,
    };
  }

  toJSON(includeImages = false): Record<string, unknown> {
    const data: Record<string, unknown> = {
      product_no: this.productNo,
      header: new TextDecoder().decode(this.header),
      version: new TextDecoder().decode(this.version),
      blockdata: this.blockdata,
      name: this.name,
    };
    if (includeImages) {
      if (this.image) data.image = this.image;
      data.face_image = this.faceImage;
    }
    const versions: Record<string, string> = {};
    for (const name of this.blockdata) {
      const block = this.blocks[name]!;
      data[name] = block.jsonalizable();
      versions[name] = block.version;
    }
    data.blockdata_versions = versions;
    return data;
  }
}

export class KoikatuCharaHeader {
  image: Uint8Array | null = null;
  productNo = 0;
  header!: Uint8Array;
  version!: Uint8Array;
  faceImage!: Uint8Array;

  static async load(filelike: FileLike): Promise<KoikatuCharaHeader> {
    const kch = new KoikatuCharaHeader();
    const { reader } = await toReader(filelike);
    if (reader.hasPngMagic()) {
      kch.image = reader.getPng();
    }
    kch.productNo = reader.readI32();
    kch.header = reader.loadLength("b");
    kch.version = reader.loadLength("b");
    kch.faceImage = reader.loadLength("i");
    return kch;
  }
}
