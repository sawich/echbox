import { BinaryReader, msgUnpack } from "../binary";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface BlockData {
  name: string;
  version: string;
  data: unknown;
  jsonalizable(): unknown;
}

export class MsgpackBlock implements BlockData {
  constructor(
    public name: string,
    public data: unknown,
    public version: string,
  ) {}

  jsonalizable(): unknown {
    return this.data;
  }
}

export class CustomBlock implements BlockData {
  name = "Custom";
  data: Record<string, unknown> = {};
  static readonly fields = ["face", "body", "hair"] as const;

  constructor(raw: Uint8Array, public version: string) {
    const reader = new BinaryReader(raw);
    for (const field of CustomBlock.fields) {
      this.data[field] = msgUnpack(reader.loadLength("i"));
    }
  }

  jsonalizable(): unknown {
    return this.data;
  }
}

export function unpackCoordinate(
  data: Uint8Array,
  containsMakeup = true,
): Record<string, unknown> {
  const reader = new BinaryReader(data);
  const coordinate: Record<string, unknown> = {
    clothes: msgUnpack(reader.loadLength("i")),
    accessory: msgUnpack(reader.loadLength("i")),
  };
  if (containsMakeup) {
    coordinate.enableMakeup = reader.readBool();
    coordinate.makeup = msgUnpack(reader.loadLength("i"));
  }
  return coordinate;
}

export class CoordinateBlock implements BlockData {
  name = "Coordinate";
  data: unknown;

  constructor(raw: Uint8Array | null, public version: string) {
    if (raw == null) {
      this.data = null;
      return;
    }
    if (version === "0.0.0") {
      const packed = msgUnpack(raw) as Uint8Array[];
      this.data = packed.map((c) => unpackCoordinate(c));
    } else if (version === "0.0.1") {
      this.data = unpackCoordinate(raw, false);
    } else {
      this.data = msgUnpack(raw);
    }
  }

  jsonalizable(): unknown {
    return this.data;
  }
}

export class UnknownBlock implements BlockData {
  constructor(
    public name: string,
    public data: Uint8Array,
    public version: string,
  ) {}

  jsonalizable(): unknown {
    return {
      rawSize: this.data.byteLength,
      note: "unknown block (raw bytes)",
    };
  }
}

const KKEX_NESTED_KEYS: Array<[string, number, string]> = [
  ["Accessory_States", 1, "CoordinateData"],
  ["Additional_Card_Info", 1, "CardInfo"],
  ["Additional_Card_Info", 1, "CoordinateInfo"],
  ["KCOX", 1, "Overlays"],
  ["KKABMPlugin.ABMData", 1, "boneData"],
  ["KSOX", 1, "Lookup"],
  ["MigrationHelper", 1, "Info"],
  ["com.deathweasel.bepinex.clothingunlocker", 1, "ClothingUnlocked"],
  ["com.deathweasel.bepinex.dynamicboneeditor", 1, "AccessoryDynamicBoneData"],
  ["com.deathweasel.bepinex.hairaccessorycustomizer", 1, "HairAccessories"],
  ["com.deathweasel.bepinex.materialeditor", 1, "MaterialColorPropertyList"],
  ["com.deathweasel.bepinex.materialeditor", 1, "MaterialFloatPropertyList"],
  ["com.deathweasel.bepinex.materialeditor", 1, "MaterialShaderList"],
  ["com.deathweasel.bepinex.materialeditor", 1, "MaterialTexturePropertyList"],
  ["com.deathweasel.bepinex.materialeditor", 1, "RendererPropertyList"],
  ["com.deathweasel.bepinex.materialeditor", 1, "TextureDictionary"],
  ["com.deathweasel.bepinex.pushup", 1, "Pushup_BodyData"],
  ["com.deathweasel.bepinex.pushup", 1, "Pushup_BraData"],
  ["com.deathweasel.bepinex.pushup", 1, "Pushup_TopData"],
  ["com.jim60105.kk.charaoverlaysbasedoncoordinate", 1, "IrisDisplaySideList"],
  ["com.snw.bepinex.breastphysicscontroller", 1, "DynamicBoneParameter"],
  ["madevil.kk.ass", 1, "CharaTriggerInfo"],
  ["madevil.kk.ass", 1, "CharaVirtualGroupInfo"],
  ["madevil.kk.ass", 1, "CharaVirtualGroupNames"],
  ["madevil.kk.ass", 1, "TriggerGroupList"],
  ["madevil.kk.ass", 1, "TriggerPropertyList"],
  ["madevil.kk.ca", 1, "AAAPKExtdata"],
  ["madevil.kk.ca", 1, "AccStateSyncExtdata"],
  ["madevil.kk.ca", 1, "DynamicBoneEditorExtdata"],
  ["madevil.kk.ca", 1, "HairAccessoryCustomizerExtdata"],
  ["madevil.kk.ca", 1, "MaterialEditorExtdata"],
  ["madevil.kk.ca", 1, "MoreAccessoriesExtdata"],
  ["madevil.kk.ca", 1, "ResolutionInfoExtdata"],
  ["madevil.kk.ca", 1, "TextureContainer"],
  ["marco.authordata", 1, "Authors"],
  ["orange.spork.advikplugin", 1, "ResizeChainAdjustments"],
];

function existsPath(obj: unknown, path: Array<string | number>): boolean {
  let current: unknown = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object") return false;
    current = (current as Record<string | number, unknown>)[key as never];
  }
  return current != null;
}

export class KKExBlock implements BlockData {
  name = "KKEx";
  data: Record<string, unknown>;
  truncated = false;

  constructor(raw: Uint8Array, public version: string) {
    try {
      this.data = (msgUnpack(raw) as Record<string, unknown>) ?? {};
    } catch {
      // Truncated / corrupt KKEx payloads are common on incomplete card copies.
      this.data = { _rawSize: raw.byteLength, _error: "incomplete KKEx msgpack" };
      this.truncated = true;
      return;
    }
    for (const keys of KKEX_NESTED_KEYS) {
      if (!existsPath(this.data, keys)) continue;
      const [k1, k2, k3] = keys;
      const plugin = this.data[k1] as
        | Record<number, Record<string, unknown>>
        | undefined;
      const slot = plugin?.[k2];
      if (!slot) continue;
      const nested = slot[k3];
      if (typeof nested === "string") continue;
      if (!(nested instanceof Uint8Array)) continue;
      try {
        slot[k3] = msgUnpack(nested);
      } catch {
        // leave raw bytes
      }
    }
  }

  jsonalizable(): unknown {
    return this.data;
  }
}

export function createBlock(
  name: string,
  data: Uint8Array,
  version: string,
): BlockData {
  switch (name) {
    case "Custom":
      return new CustomBlock(data, version);
    case "Coordinate":
      return new CoordinateBlock(data, version);
    case "Parameter":
      return new MsgpackBlock("Parameter", msgUnpack(data), version);
    case "Status":
      return new MsgpackBlock("Status", msgUnpack(data), version);
    case "About":
      return new MsgpackBlock("About", msgUnpack(data), version);
    case "KKEx":
      return new KKExBlock(data, version);
    default:
      return new UnknownBlock(name, data, version);
  }
}
