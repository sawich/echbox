import {
  type BinaryReader,
  type FileLike,
  toReader,
} from "../binary";
import { unpackCoordinate } from "./blocks";

/** Standalone 【KoiKatuClothes】 coordinate (outfit) card. */
export class KoikatuCoordinateEntry {
  image: Uint8Array | null = null;
  productNo = 0;
  header!: Uint8Array;
  version!: Uint8Array;
  coordinateName!: Uint8Array;
  data: Record<string, unknown> | null = null;
  originalFilePath: string | null = null;

  static loadFromReader(
    reader: BinaryReader,
    containsPng = false,
  ): KoikatuCoordinateEntry {
    const entry = new KoikatuCoordinateEntry();
    if (containsPng || reader.hasPngMagic()) {
      entry.image = reader.getPng();
    }
    entry.productNo = reader.readI32();
    entry.header = reader.loadStringBytes();
    entry.version = reader.loadStringBytes();
    entry.coordinateName = reader.loadStringBytes();
    entry.data = unpackCoordinate(reader.loadLength("i"), true);
    return entry;
  }

  static async load(
    filelike: FileLike,
    containsPng = true,
  ): Promise<KoikatuCoordinateEntry> {
    const { reader, originalPath } = await toReader(filelike);
    const entry = KoikatuCoordinateEntry.loadFromReader(reader, containsPng);
    entry.originalFilePath = originalPath;
    return entry;
  }

  summary() {
    return {
      productNo: this.productNo,
      header: new TextDecoder().decode(this.header),
      version: new TextDecoder().decode(this.version),
      coordinateName: new TextDecoder().decode(this.coordinateName),
      hasClothes: Boolean(this.data?.clothes),
      hasAccessory: Boolean(this.data?.accessory),
      enableMakeup: Boolean(this.data?.enableMakeup),
      imageSize: this.image?.byteLength ?? null,
      originalFilePath: this.originalFilePath,
    };
  }
}
