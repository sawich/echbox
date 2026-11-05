export function parseBooruTagString(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function buildTaggerWorkflow(
  template: Record<string, unknown>,
  imageName: string,
): Record<string, unknown> {
  const workflow = structuredClone(template) as Record<string, unknown>;
  const node = workflow["2"];
  if (!node || typeof node !== "object") {
    throw new Error('Workflow missing LoadImage node "2"');
  }
  const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
  if (!inputs || typeof inputs !== "object") {
    throw new Error('LoadImage node "2" missing inputs');
  }
  inputs.image = imageName;
  return workflow;
}

export type HistoryOutputNode = {
  text?: string[];
  ui?: { text?: string[] };
};

export type HistoryEntry = {
  outputs?: Record<string, HistoryOutputNode>;
};

function textFromNode(node: HistoryOutputNode | undefined): string | null {
  if (!node) return null;
  const parts = node.text ?? node.ui?.text;
  if (!parts || parts.length === 0) return null;
  const joined = parts.map((p) => p.trim()).filter(Boolean).join(", ");
  return joined.length > 0 ? joined : null;
}

const PREVIEW_NODES = ["13", "14", "15", "16"] as const;

export function extractTagStringFromHistory(
  entry: HistoryEntry,
): string | null {
  const outputs = entry.outputs;
  if (!outputs) return null;

  const fromTagger = textFromNode(outputs["8"]);
  if (fromTagger) return fromTagger;

  for (const id of PREVIEW_NODES) {
    const fromPreview = textFromNode(outputs[id]);
    if (fromPreview) return fromPreview;
  }
  return null;
}
