import { type BinaryReader } from "../binary";
import { KoikatuCharaData } from "../chara/koikatu";
import {
  SceneObjectLoaderBase,
  type SceneObjectInfo,
} from "./object-loader-base";

export class KoikatuSceneObjectLoader extends SceneObjectLoaderBase {
  static {
    this.loadDispatch = {
      0: (r, o, v) => this.loadCharInfo(r, o, v),
      1: (r, o, v) => this.loadItemInfo(r, o, v),
      2: (r, o, v) => this.loadLightInfo(r, o, v),
      3: (r, o, v) => this.loadFolderInfo(r, o, v),
      4: (r, o, v) => this.loadRouteInfo(r, o, v),
      5: (r, o, v) => this.loadCameraInfo(r, o, v),
      7: (r, o, v) => this.loadTextInfo(r, o, v),
    };
  }

  static loadLightInfoBase(reader: BinaryReader): Record<string, unknown> {
    return {
      color: this.parseColorJson(reader.loadUtf8String()),
      intensity: reader.readF32(),
      rot: [reader.readF32(), reader.readF32()],
      shadow: reader.readBool(),
    };
  }

  static loadPatternInfo(reader: BinaryReader): Record<string, unknown> {
    return {
      key: reader.readI32(),
      file_path: reader.loadUtf8String(),
      clamp: reader.readBool(),
      uv: JSON.parse(reader.loadUtf8String()),
      rot: reader.readF32(),
    };
  }

  static loadRoutePointInfo(
    reader: BinaryReader,
    version: string | null = null,
  ): Record<string, unknown> {
    const routePoint: Record<string, unknown> = {
      dicKey: reader.readI32(),
      changeAmount: {
        position: this.loadVector3(reader),
        rotation: this.loadVector3(reader),
        scale: this.loadVector3(reader),
      },
      speed: reader.readF32(),
      easeType: reader.readI32(),
    };

    if (this.cmp(version, "1.0.3") === 0) {
      reader.readBytes(1);
    }
    if (this.cmp(version, "1.0.4.1") >= 0) {
      routePoint.connection = reader.readI32();
      routePoint.aidInfo = this.loadRoutePointAidInfo(reader);
    }
    if (this.cmp(version, "1.0.4.2") >= 0) {
      routePoint.link = reader.readBool();
    }
    return routePoint;
  }

  static loadCharInfo(
    reader: BinaryReader,
    objInfo: SceneObjectInfo,
    version: string | null = null,
  ): void {
    const data = this.loadObjectInfoBase(reader);
    data.sex = reader.readI32();
    data.character = KoikatuCharaData.loadFromReader(reader, false);

    const bonesCount = reader.readI32();
    const bones: Record<number, unknown> = {};
    for (let i = 0; i < bonesCount; i++) {
      const boneKey = reader.readI32();
      bones[boneKey] = this.loadBoneInfo(reader);
    }
    data.bones = bones;

    const ikCount = reader.readI32();
    const ikTargets: Record<number, unknown> = {};
    for (let i = 0; i < ikCount; i++) {
      const ikKey = reader.readI32();
      ikTargets[ikKey] = this.loadBoneInfo(reader);
    }
    data.ik_targets = ikTargets;

    const childCount = reader.readI32();
    const child: Record<number, SceneObjectInfo[]> = {};
    for (let i = 0; i < childCount; i++) {
      const childKey = reader.readI32();
      child[childKey] = this.loadChildObjects(reader, version);
    }
    data.child = child;

    data.kinematic_mode = reader.readI32();
    data.anime_info = {
      group: reader.readI32(),
      category: reader.readI32(),
      no: reader.readI32(),
    };
    data.hand_patterns = [reader.readI32(), reader.readI32()];
    data.nipple = reader.readF32();
    data.siru = reader.readBytes(5);
    data.mouth_open = reader.readF32();
    data.lip_sync = reader.readBool();

    data.lookAtTarget = {
      dicKey: reader.readI32(),
      position: this.loadVector3(reader),
      rotation: this.loadVector3(reader),
      scale: this.loadVector3(reader),
    };

    data.enable_ik = reader.readBool();
    data.active_ik = this.loadBoolArray(reader, 5);
    data.enable_fk = reader.readBool();
    data.active_fk = this.loadBoolArray(reader, 7);

    const expressionCount = this.cmp(version, "0.0.9") >= 0 ? 8 : 4;
    data.expression = this.loadBoolArray(reader, expressionCount);

    data.anime_speed = reader.readF32();
    data.anime_pattern = reader.readF32();
    data.anime_option_visible = reader.readBool();
    data.is_anime_force_loop = reader.readBool();

    const voiceListCount = reader.readI32();
    const voiceList = [];
    for (let i = 0; i < voiceListCount; i++) {
      voiceList.push({
        group: reader.readI32(),
        category: reader.readI32(),
        no: reader.readI32(),
      });
    }
    data.voiceCtrl = { list: voiceList, repeat: reader.readI32() };

    data.visible_son = reader.readBool();
    data.son_length = reader.readF32();
    data.visible_simple = reader.readBool();

    try {
      data.simple_color = this.parseColorJson(reader.loadLengthUtf8("b"));
    } catch {
      data.simple_color = { r: 1, g: 1, b: 1, a: 1 };
    }

    data.anime_option_param = [reader.readF32(), reader.readF32()];
    data.neck_byte_data = reader.readBytes(reader.readI32());
    data.eyes_byte_data = reader.readBytes(reader.readI32());
    data.anime_normalized_time = reader.readF32();

    const dicAccessGroupCount = reader.readI32();
    const dicAccessGroup: Record<number, number> = {};
    for (let i = 0; i < dicAccessGroupCount; i++) {
      dicAccessGroup[reader.readI32()] = reader.readI32();
    }
    data.dic_access_group = dicAccessGroup;

    const dicAccessNoCount = reader.readI32();
    const dicAccessNo: Record<number, number> = {};
    for (let i = 0; i < dicAccessNoCount; i++) {
      dicAccessNo[reader.readI32()] = reader.readI32();
    }
    data.dic_access_no = dicAccessNo;

    objInfo.data = data;
  }

  static loadItemInfo(
    reader: BinaryReader,
    objInfo: SceneObjectInfo,
    version: string | null = null,
  ): void {
    const data = this.loadObjectInfoBase(reader);
    data.group = reader.readI32();
    data.category = reader.readI32();
    data.no = reader.readI32();
    data.anime_pattern = this.cmp(version, "1.1.1.0") >= 0 ? reader.readI32() : 0;
    data.anime_speed = reader.readF32();

    const colors: unknown[] = [];
    const colorCount = this.cmp(version, "0.0.3") >= 0 ? 8 : 7;
    for (let i = 0; i < colorCount; i++) {
      const colorBytes = reader.loadStringBytes();
      colors.push(
        colorBytes.byteLength > 0
          ? JSON.parse(new TextDecoder().decode(colorBytes))
          : null,
      );
    }
    if (this.cmp(version, "0.0.3") < 0) {
      colors.push({ r: 1, g: 1, b: 1, a: 1 });
    }
    data.colors = colors;

    data.patterns = Array.from({ length: 3 }, () =>
      this.loadPatternInfo(reader),
    );
    data.alpha = reader.readF32();

    if (this.cmp(version, "0.0.4") >= 0) {
      data.line_color = JSON.parse(reader.loadUtf8String());
      data.line_width = reader.readF32();
    } else {
      data.line_color = { r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1 };
      data.line_width = 1;
    }

    if (this.cmp(version, "0.0.7") >= 0) {
      data.emission_color = JSON.parse(reader.loadUtf8String());
      data.emission_power = reader.readF32();
      data.light_cancel = reader.readF32();
    } else {
      data.emission_color = { r: 1, g: 1, b: 1, a: 1 };
      data.emission_power = 0;
      data.light_cancel = 0;
    }

    if (this.cmp(version, "0.0.6") >= 0) {
      data.panel = this.loadPatternInfo(reader);
    } else {
      data.panel = {
        key: 0,
        file_path: "",
        clamp: true,
        uv: { x: 0, y: 0, z: 1, w: 1 },
        rot: 0,
      };
    }

    data.enable_fk = reader.readBool();
    const bonesCount = reader.readI32();
    const bones: Record<string, unknown> = {};
    for (let i = 0; i < bonesCount; i++) {
      const boneKey = reader.loadUtf8String();
      bones[boneKey] = this.loadBoneInfo(reader);
    }
    data.bones = bones;
    data.enable_dynamic_bone =
      this.cmp(version, "1.0.1") >= 0 ? reader.readBool() : true;
    data.anime_normalized_time = reader.readF32();
    data.child = this.loadChildObjects(reader, version);
    objInfo.data = data;
  }

  static loadLightInfo(
    reader: BinaryReader,
    objInfo: SceneObjectInfo,
    _version: string | null = null,
  ): void {
    const data = this.loadObjectInfoBase(reader);
    data.no = reader.readI32();
    data.color = this.loadColorRgba(reader);
    data.intensity = reader.readF32();
    data.range = reader.readF32();
    data.spotAngle = reader.readF32();
    data.shadow = reader.readBool();
    data.enable = reader.readBool();
    data.drawTarget = reader.readBool();
    objInfo.data = data;
  }

  static loadRouteInfo(
    reader: BinaryReader,
    objInfo: SceneObjectInfo,
    version: string | null = null,
  ): void {
    const data = this.loadObjectInfoBase(reader);
    data.name = reader.loadUtf8String();
    data.child = this.loadChildObjects(reader, version);

    const routePointsCount = reader.readI32();
    data.route_points = Array.from({ length: routePointsCount }, () =>
      this.loadRoutePointInfo(reader, version),
    );

    if (this.cmp(version, "1.0.3") >= 0) {
      data.active = reader.readBool();
      data.loop = reader.readBool();
      data.visibleLine = reader.readBool();
    }
    if (this.cmp(version, "1.0.4") >= 0) {
      data.orient = reader.readI32();
    }
    if (this.cmp(version, "1.0.4.1") >= 0) {
      data.color = JSON.parse(reader.loadUtf8String());
    }
    objInfo.data = data;
  }

  static loadTextInfo(
    reader: BinaryReader,
    objInfo: SceneObjectInfo,
    _version: string | null = null,
  ): void {
    const data = this.loadObjectInfoBase(reader);
    data.id = reader.readI32();
    data.color = JSON.parse(reader.loadUtf8String());
    data.outlineColor = JSON.parse(reader.loadUtf8String());
    data.outlineSize = reader.readF32();
    data.textInfos_raw = reader.readBytes(reader.readI32());
    objInfo.data = data;
  }
}
