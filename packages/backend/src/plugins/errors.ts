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
  readonly version: number;
  readonly conflict: { pluginId: string; version: number };

  constructor(pluginId: string, version: number) {
    super(
      409,
      "CONFLICT",
      `Duplicate plugin content hash (already exists in plugin ${pluginId} v${version})`,
    );
    this.name = "DuplicatePluginHashError";
    this.pluginId = pluginId;
    this.plugin_id = pluginId;
    this.version = version;
    this.conflict = { pluginId, version };
  }
}

export class ForbiddenPluginError extends PluginServiceError {
  constructor(message = "Forbidden: only the plugin author may modify this plugin") {
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
