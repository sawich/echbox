import { resolve } from "node:path";
import { migrateDb } from "../db/migrate";
import { autoTagCards, createComfyClient } from "./auto-tag";

function usage(): never {
  console.error(`Usage: bun run cards:auto-tag -- [options]

Options:
  --dry-run              Run Comfy but do not write tags
  --limit <n>            Process at most n cards
  --force                Retag cards that already have tags
  --comfy-url <url>      ComfyUI base URL (default http://127.0.0.1:8188)
  --workflow <path>      API workflow JSON (default repo comfyui-workflow.json)
  --user-id <id>         Actor user id (default echbox system user)
`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let force = false;
  let limit: number | undefined;
  let comfyUrl = "http://127.0.0.1:8188";
  let workflowPath = resolve(
    import.meta.dir,
    "../../../../comfyui-workflow.json",
  );
  let userId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--force":
        force = true;
        break;
      case "--limit": {
        const raw = argv[++i];
        if (raw == null || Number.isNaN(Number(raw))) usage();
        limit = Number(raw);
        break;
      }
      case "--comfy-url": {
        const raw = argv[++i];
        if (!raw) usage();
        comfyUrl = raw;
        break;
      }
      case "--workflow": {
        const raw = argv[++i];
        if (!raw) usage();
        workflowPath = resolve(raw);
        break;
      }
      case "--user-id": {
        const raw = argv[++i];
        if (!raw) usage();
        userId = raw;
        break;
      }
      case "--help":
      case "-h":
        usage();
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        usage();
    }
  }

  return { dryRun, force, limit, comfyUrl, workflowPath, userId };
}

const dbPath = Bun.env.DATABASE_PATH ?? process.env.DATABASE_PATH;
const dataDir = Bun.env.DATA_DIR ?? process.env.DATA_DIR;

if (dbPath) {
  migrateDb(dbPath);
}

const args = parseArgs(Bun.argv.slice(2));
const workflowFile = Bun.file(args.workflowPath);
if (!(await workflowFile.exists())) {
  console.error(`Workflow not found: ${args.workflowPath}`);
  process.exit(1);
}
const workflow = (await workflowFile.json()) as Record<string, unknown>;

const result = await autoTagCards({
  dbPath,
  dataDir,
  comfy: createComfyClient(args.comfyUrl),
  workflow,
  dryRun: args.dryRun,
  limit: args.limit,
  force: args.force,
  userId: args.userId,
});

console.log(
  `Auto-tag cards: ${result.tagged} tagged, ${result.skipped} skipped, ${result.failed} failed`,
);
for (const failure of result.failures) {
  console.error(`  ${failure.cardId}: ${failure.error}`);
}

process.exit(result.failed > 0 ? 1 : 0);
