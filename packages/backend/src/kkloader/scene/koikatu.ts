import {
  BinaryReader,
  type FileLike,
  compareVersions,
  msgUnpack,
  toReader,
} from "../binary";
import { KoikatuSceneObjectLoader } from "./object-loader";
import type { SceneObjectInfo } from "./object-loader-base";

const OBJECT_TYPE_NAMES: Record<number, string> = {
  0: "Character",
  1: "Item",
  2: "Light",
  3: "Folder",
  4: "Route",
  5: "Camera",
  7: "Text",
};

export type KoikatuSceneSummary = {
  version: string | null;
  map: number;
  objectCount: number;
  objectTypes: Record<string, number>;
  background: string;
  frame: string;
  hasMod: boolean;
  originalFilename: string | null;
  imageSize: number | null;
};

export class KoikatuSceneData {
  image: Uint8Array | null = null;
  version: string | null = null;
  dataVersion: string | null = null;
  objects: Record<number, SceneObjectInfo> = {};
  map = -1;
  caMap: Record<string, unknown> = {};
  sunLightType = 0;
  mapOption = true;
  aceNo = 0;
  aceBlend = 0;
  enableAOE = true;
  aoeColor = { r: 180 / 255, g: 180 / 255, b: 180 / 255, a: 1 };
  aoeRadius = 0.1;
  enableBloom = true;
  bloomIntensity = 0.4;
  bloomBlur = 0.8;
  bloomThreshold = 0.6;
  enableDepth = false;
  depthFocalSize = 0.95;
  depthAperture = 0.6;
  enableVignette = true;
  enableFog = false;
  fogColor = { r: 137 / 255, g: 193 / 255, b: 221 / 255, a: 1 };
  fogHeight = 1;
  fogStartDistance = 0;
  enableSunShafts = false;
  sunThresholdColor = { r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1 };
  sunColor = { r: 1, g: 1, b: 1, a: 1 };
  sunCaster = -1;
  enableShadow = true;
  faceNormal = false;
  faceShadow = false;
  lineColorG = 0;
  ambientShadow = { r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1 };
  lineWidthG = 0;
  rampG = 0;
  ambientShadowG = 0;
  shaderType = 0;
  skyInfo: Record<string, unknown> = { Enable: false, Pattern: 0 };
  cameraSaveData: Record<string, unknown> | null = null;
  cameraData: Array<Record<string, unknown>> = [];
  charaLight: Record<string, unknown> = {};
  mapLight: Record<string, unknown> = {};
  bgmCtrl: Record<string, unknown> = { play: false, repeat: 0, no: 0 };
  envCtrl: Record<string, unknown> = { play: false, repeat: 0, no: 0 };
  outsideSoundCtrl: Record<string, unknown> = {
    play: false,
    repeat: 0,
    fileName: "",
  };
  background = "";
  frame = "";
  tail = "";
  modHeader = "";
  modUnknown = 0;
  modData: unknown = null;
  modTail: Uint8Array = new Uint8Array();
  originalFilename: string | null = null;

  static async load(filelike: FileLike): Promise<KoikatuSceneData> {
    const ks = new KoikatuSceneData();
    const { reader, originalPath } = await toReader(filelike);
    ks.originalFilename = originalPath;

    ks.image = reader.getPng();
    const versionStr = reader.loadUtf8String();
    ks.version = versionStr;
    ks.dataVersion = versionStr;

    const objCount = reader.readI32();
    for (let i = 0; i < objCount; i++) {
      const key = reader.readI32();
      const objType = reader.readI32();
      const objInfo: SceneObjectInfo = { type: objType, data: {} };
      KoikatuSceneObjectLoader.dispatchLoad(
        reader,
        objType,
        objInfo,
        versionStr,
      );
      ks.objects[key] = objInfo;
    }

    ks.map = reader.readI32();
    ks.caMap = ks.loadChangeAmount(reader);
    ks.sunLightType = reader.readI32();
    ks.mapOption = reader.readBool();
    ks.aceNo = reader.readI32();

    const v002 = compareVersions(ks.dataVersion, "0.0.2");
    if (v002 >= 0) ks.aceBlend = reader.readF32();

    if (compareVersions(ks.dataVersion, "0.0.1") <= 0) {
      reader.readBool();
      reader.readF32();
      reader.loadLength("b");
    }

    if (v002 >= 0) {
      ks.enableAOE = reader.readBool();
      ks.aoeColor = KoikatuSceneObjectLoader.parseColorJson(
        reader.loadLengthUtf8("b"),
      );
      ks.aoeRadius = reader.readF32();
    }

    ks.enableBloom = reader.readBool();
    ks.bloomIntensity = reader.readF32();
    ks.bloomBlur = reader.readF32();
    if (v002 >= 0) ks.bloomThreshold = reader.readF32();

    if (compareVersions(ks.dataVersion, "0.0.1") <= 0) {
      reader.readBool();
    }

    ks.enableDepth = reader.readBool();
    ks.depthFocalSize = reader.readF32();
    ks.depthAperture = reader.readF32();
    ks.enableVignette = reader.readBool();

    if (compareVersions(ks.dataVersion, "0.0.1") <= 0) {
      reader.readF32();
    }

    ks.enableFog = reader.readBool();
    if (v002 >= 0) {
      ks.fogColor = KoikatuSceneObjectLoader.parseColorJson(
        reader.loadLengthUtf8("b"),
      );
      ks.fogHeight = reader.readF32();
      ks.fogStartDistance = reader.readF32();
    }

    ks.enableSunShafts = reader.readBool();
    if (v002 >= 0) {
      ks.sunThresholdColor = KoikatuSceneObjectLoader.parseColorJson(
        reader.loadLengthUtf8("b"),
      );
      ks.sunColor = KoikatuSceneObjectLoader.parseColorJson(
        reader.loadLengthUtf8("b"),
      );
    }

    if (compareVersions(ks.dataVersion, "0.0.4") >= 0) {
      ks.sunCaster = reader.readI32();
    }
    if (v002 >= 0) ks.enableShadow = reader.readBool();

    if (compareVersions(ks.dataVersion, "0.0.4") >= 0) {
      ks.faceNormal = reader.readBool();
      ks.faceShadow = reader.readBool();
      ks.lineColorG = reader.readF32();
      ks.ambientShadow = KoikatuSceneObjectLoader.parseColorJson(
        reader.loadLengthUtf8("b"),
      );
    }

    if (compareVersions(ks.dataVersion, "0.0.5") >= 0) {
      ks.lineWidthG = reader.readF32();
      ks.rampG = reader.readI32();
      ks.ambientShadowG = reader.readF32();
    }

    if (compareVersions(ks.dataVersion, "1.1.0.0") >= 0) {
      ks.shaderType = reader.readI32();
    }

    if (compareVersions(ks.dataVersion, "1.1.2.0") >= 0) {
      ks.skyInfo = msgUnpack(reader.loadLength("i")) as Record<string, unknown>;
    }

    ks.cameraSaveData = ks.loadCameraData(reader);
    ks.cameraData = Array.from({ length: 10 }, () => ks.loadCameraData(reader));

    ks.charaLight = KoikatuSceneObjectLoader.loadLightInfoBase(reader);
    ks.mapLight = {
      ...KoikatuSceneObjectLoader.loadLightInfoBase(reader),
      type: reader.readI32(),
    };

    ks.bgmCtrl = {
      repeat: reader.readI32(),
      no: reader.readI32(),
      play: reader.readBool(),
    };
    ks.envCtrl = {
      repeat: reader.readI32(),
      no: reader.readI32(),
      play: reader.readBool(),
    };
    ks.outsideSoundCtrl = {
      repeat: reader.readI32(),
      fileName: reader.loadUtf8String(),
      play: reader.readBool(),
    };

    ks.background = reader.loadLengthUtf8("b");
    ks.frame = reader.loadLengthUtf8("b");
    ks.tail = reader.loadUtf8String();
    if (ks.tail !== "【KStudio】") {
      throw new Error(`Unexpected scene tail: ${ks.tail}`);
    }

    if (reader.remaining > 0) {
      const mods = reader.readRemaining();
      const modReader = new BinaryReader(mods);
      ks.modHeader = modReader.loadLengthUtf8("b");
      ks.modUnknown = modReader.readI32();
      ks.modData = msgUnpack(modReader.loadLength("i"));
      ks.modTail = modReader.readRemaining();
    }

    return ks;
  }

  private loadChangeAmount(reader: {
    readF32: () => number;
  }): Record<string, unknown> {
    const readVec = () => ({
      x: reader.readF32(),
      y: reader.readF32(),
      z: reader.readF32(),
    });
    return { pos: readVec(), rot: readVec(), scale: readVec() };
  }

  private loadCameraData(reader: {
    readI32: () => number;
    readF32: () => number;
  }): Record<string, unknown> {
    const version = reader.readI32();
    const position = {
      x: reader.readF32(),
      y: reader.readF32(),
      z: reader.readF32(),
    };
    const rotation = {
      x: reader.readF32(),
      y: reader.readF32(),
      z: reader.readF32(),
    };

    let distance = { x: 0, y: 0, z: 0 };
    let deprecatedDistance: number | undefined;
    if (version === 1) {
      deprecatedDistance = reader.readF32();
    } else {
      distance = {
        x: reader.readF32(),
        y: reader.readF32(),
        z: reader.readF32(),
      };
    }

    const result: Record<string, unknown> = {
      position,
      rotation,
      distance,
      fieldOfView: reader.readF32(),
    };
    if (deprecatedDistance != null) {
      result.deprecated_distance = deprecatedDistance;
    }
    return result;
  }

  *walk(
    includeDepth = false,
    objectType: number | null = null,
  ): Generator<
    | [number | [string, number], SceneObjectInfo]
    | [number | [string, number], SceneObjectInfo, number]
  > {
    const shouldYield = (obj: SceneObjectInfo) =>
      objectType == null || obj.type === objectType;

    const walkChildren = function* (
      objInfo: SceneObjectInfo,
      depth: number,
    ): Generator<
      | [number | [string, number], SceneObjectInfo]
      | [number | [string, number], SceneObjectInfo, number]
    > {
      const data = objInfo.data;
      const child = data.child;
      if (child == null) return;

      if (objInfo.type === 0) {
        for (const [childKey, childList] of Object.entries(
          child as Record<string, SceneObjectInfo[]>,
        )) {
          for (const [idx, childObj] of childList.entries()) {
            if (shouldYield(childObj)) {
              if (includeDepth) yield [[childKey, idx], childObj, depth + 1];
              else yield [[childKey, idx], childObj];
            }
            yield* walkChildren(childObj, depth + 1);
          }
        }
      } else {
        for (const [idx, childObj] of (
          child as SceneObjectInfo[]
        ).entries()) {
          if (shouldYield(childObj)) {
            if (includeDepth) yield [idx, childObj, depth + 1];
            else yield [idx, childObj];
          }
          yield* walkChildren(childObj, depth + 1);
        }
      }
    };

    for (const [key, objInfo] of Object.entries(this.objects)) {
      const k = Number(key);
      if (shouldYield(objInfo)) {
        if (includeDepth) yield [k, objInfo, 0];
        else yield [k, objInfo];
      }
      yield* walkChildren(objInfo, 0);
    }
  }

  countObjectTypes(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const entry of this.walk()) {
      const objInfo = entry[1];
      const name =
        OBJECT_TYPE_NAMES[objInfo.type] ?? `Unknown(${objInfo.type})`;
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return counts;
  }

  summary(): KoikatuSceneSummary {
    return {
      version: this.version,
      map: this.map,
      objectCount: Object.keys(this.objects).length,
      objectTypes: this.countObjectTypes(),
      background: this.background,
      frame: this.frame,
      hasMod: Boolean(this.modHeader),
      originalFilename: this.originalFilename,
      imageSize: this.image?.byteLength ?? null,
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      version: this.version,
      dataVersion: this.dataVersion,
      map: this.map,
      sunLightType: this.sunLightType,
      mapOption: this.mapOption,
      background: this.background,
      frame: this.frame,
      objectCount: Object.keys(this.objects).length,
      objectTypes: this.countObjectTypes(),
      hasMod: Boolean(this.modHeader),
      objects: Object.fromEntries(
        Object.entries(this.objects).map(([k, v]) => [
          k,
          {
            type: v.type,
            typeName: OBJECT_TYPE_NAMES[v.type] ?? `Unknown(${v.type})`,
            data: sanitizeObjectData(v.data),
          },
        ]),
      ),
    };
  }
}

function sanitizeObjectData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  if (out.character instanceof Object && "summary" in (out.character as object)) {
    out.character = (out.character as { summary: () => unknown }).summary();
  }
  return out;
}
