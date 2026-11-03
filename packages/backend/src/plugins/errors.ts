export class PluginServiceError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PluginServiceError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

export class DuplicatePluginHashError extends PluginServiceError {
  readonly pluginId: string;
  readonly plugin_id: string;
  readonly versionId: string;
  readonly semver: string;
  readonly conflict: { pluginId: string; versionId: string; semver: string };

  constructor(pluginId: string, versionId: string, semver: string) {
    super(
      409,
      "CONFLICT",
      `This file was already uploaded as version ${semver}.`,
    );
    this.name = "DuplicatePluginHashError";
    this.pluginId = pluginId;
    this.plugin_id = pluginId;
    this.versionId = versionId;
    this.semver = semver;
    this.conflict = { pluginId, versionId, semver };
  }
}

export class DuplicatePluginSemverError extends PluginServiceError {
  readonly pluginId: string;
  readonly plugin_id: string;
  readonly versionId: string;
  readonly semver: string;
  readonly conflict: { pluginId: string; versionId: string; semver: string };

  constructor(pluginId: string, versionId: string, semver: string) {
    super(
      409,
      "DUPLICATE_SEMVER",
      `Version ${semver} already exists for this plugin.`,
    );
    this.name = "DuplicatePluginSemverError";
    this.pluginId = pluginId;
    this.plugin_id = pluginId;
    this.versionId = versionId;
    this.semver = semver;
    this.conflict = { pluginId, versionId, semver };
  }
}

export class ForbiddenPluginError extends PluginServiceError {
  constructor(message = "Only the author can change this plugin.") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenPluginError";
  }
}

export class BadPluginError extends PluginServiceError {
  constructor(message = "Invalid plugin request") {
    super(400, "BAD_PLUGIN", message);
    this.name = "BadPluginError";
  }
}

export class PluginNotFoundError extends PluginServiceError {
  constructor(message = "Plugin not found") {
    super(404, "NOT_FOUND", message);
    this.name = "PluginNotFoundError";
  }
}
