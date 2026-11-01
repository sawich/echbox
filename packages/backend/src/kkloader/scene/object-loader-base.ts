import { type BinaryReader, compareVersions } from "../binary";

export type Vec3 = { x: number; y: number; z: number };
export type ColorRgba = { r: number; g: number; b: number; a: number };
export type SceneObjectInfo = {
  type: number;
  data: Record<string, unknown>;
};

export abstract class SceneObjectLoaderBase {
  protected static loadDispatch: Record<
    number,
    (
      reader: BinaryReader,
      objInfo: SceneObjectInfo,
      version: string | null,
    ) => void
  > = {};

  static dispatchLoad(
    reader: BinaryReader,
    objType: number,
    objInfo: SceneObjectInfo,
    version: string | null = null,
  ): void {
    const method = this.loadDispatch[objType];
    if (!method) throw new Error(`Unknown object type: ${objType}`);
    method(reader, objInfo, version);
  }

  static loadVector3(reader: BinaryReader): Vec3 {
    return { x: reader.readF32(), y: reader.readF32(), z: reader.readF32() };
  }

  static loadColorRgba(reader: BinaryReader): ColorRgba {
    return {
      r: reader.readF32(),
      g: reader.readF32(),
      b: reader.readF32(),
      a: reader.readF32(),
    };
  }

  static parseColorJson(jsonStr: string): ColorRgba {
    const color = JSON.parse(jsonStr) as Partial<ColorRgba>;
    return {
      r: color.r ?? 0,
      g: color.g ?? 0,
      b: color.b ?? 0,
      a: color.a ?? 1,
    };
  }

  static loadBoolArray(reader: BinaryReader, count: number): boolean[] {
    return Array.from({ length: count }, () => reader.readBool());
  }

  static loadObjectInfoBase(reader: BinaryReader): Record<string, unknown> {
    return {
      dicKey: reader.readI32(),
      position: this.loadVector3(reader),
      rotation: this.loadVector3(reader),
      scale: this.loadVector3(reader),
      treeState: reader.readI32(),
      visible: reader.readBool(),
    };
  }

  static loadBoneInfo(reader: BinaryReader): Record<string, unknown> {
    return {
      dicKey: reader.readI32(),
      changeAmount: {
        position: this.loadVector3(reader),
        rotation: this.loadVector3(reader),
        scale: this.loadVector3(reader),
      },
    };
  }

  static loadRoutePointAidInfo(reader: BinaryReader): Record<string, unknown> {
    return {
      dicKey: reader.readI32(),
      changeAmount: {
        position: this.loadVector3(reader),
        rotation: this.loadVector3(reader),
        scale: this.loadVector3(reader),
      },
      isInit: reader.readBool(),
    };
  }

  static loadFolderInfo(
    reader: BinaryReader,
    objInfo: SceneObjectInfo,
    version: string | null = null,
  ): void {
    const data = this.loadObjectInfoBase(reader);
    data.name = reader.loadUtf8String();
    data.child = this.loadChildObjects(reader, version);
    objInfo.data = data;
  }

  static loadCameraInfo(
    reader: BinaryReader,
    objInfo: SceneObjectInfo,
    _version: string | null = null,
  ): void {
    const data = this.loadObjectInfoBase(reader);
    data.name = reader.loadUtf8String();
    data.active = reader.readBool();
    objInfo.data = data;
  }

  static loadChildObjects(
    reader: BinaryReader,
    version: string | null = null,
  ): SceneObjectInfo[] {
    const count = reader.readI32();
    const children: SceneObjectInfo[] = [];
    for (let i = 0; i < count; i++) {
      const objType = reader.readI32();
      const objInfo: SceneObjectInfo = { type: objType, data: {} };
      this.dispatchLoad(reader, objType, objInfo, version);
      children.push(objInfo);
    }
    return children;
  }

  static cmp(version: string | null | undefined, target: string): number {
    if (version == null) return 1;
    return compareVersions(version, target);
  }
}
