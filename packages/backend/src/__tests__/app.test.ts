import { describe, expect, test } from "bun:test";
import { app } from "../app";
import { fixture } from "../kkloader/__tests__/helpers";

describe("HTTP app", () => {
  test("GET /", async () => {
    const res = await app.handle(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello Elysia");
  });

  test("GET /health", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  test("POST /echo validates body", async () => {
    const ok = await app.handle(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ echo: "hi" });

    const bad = await app.handle(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "" }),
      }),
    );
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /api/kk/chara", () => {
  test("parses reference card summary", async () => {
    const file = Bun.file(fixture("chara", "kk_chara.png"));
    const form = new FormData();
    form.set("file", file, "kk_chara.png");

    const res = await app.handle(
      new Request("http://localhost/api/kk/chara", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { header: string; blocks: string[]; name: string };
      data?: unknown;
    };
    expect(body.summary.header).toContain("KoiKatuChara");
    expect(body.summary.blocks).toContain("Parameter");
    expect(body.summary.name.length).toBeGreaterThan(0);
    expect(body.data).toBeUndefined();
  });

  test("returns full JSON when full=true", async () => {
    const file = Bun.file(fixture("chara", "kk_chara.png"));
    const form = new FormData();
    form.set("file", file, "kk_chara.png");
    form.set("full", "true");

    const res = await app.handle(
      new Request("http://localhost/api/kk/chara", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { Parameter: unknown } };
    expect(body.data?.Parameter).toBeDefined();
  });

  test("parses ownCloud Other card", async () => {
    const file = Bun.file(fixture("chara", "kk_tatsumaki_fubuki.png"));
    const form = new FormData();
    form.set("file", file, "card.png");

    const res = await app.handle(
      new Request("http://localhost/api/kk/chara", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { blocks: string[]; name: string };
    };
    expect(body.summary.blocks).toContain("Custom");
    expect(body.summary.name.length).toBeGreaterThan(0);
  });
});

describe("POST /api/kk/scene", () => {
  test("parses simple scene summary", async () => {
    const file = Bun.file(fixture("scene", "kk_scene_simple.png"));
    const form = new FormData();
    form.set("file", file, "scene.png");

    const res = await app.handle(
      new Request("http://localhost/api/kk/scene", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: {
        version: string;
        objectCount: number;
        objectTypes: Record<string, number>;
      };
    };
    expect(body.summary.version).toBe("1.1.2.1");
    expect(body.summary.objectCount).toBe(1);
    expect(body.summary.objectTypes.Item).toBe(1);
  });

  test("parses larger scene with character", async () => {
    const file = Bun.file(fixture("scene", "kk_scene.png"));
    const form = new FormData();
    form.set("file", file, "kk_scene.png");
    form.set("full", "true");

    const res = await app.handle(
      new Request("http://localhost/api/kk/scene", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { objectTypes: Record<string, number> };
      data: { objects: Record<string, { type: number }> };
    };
    expect(body.summary.objectTypes.Character).toBe(1);
    expect(Object.keys(body.data.objects).length).toBeGreaterThan(0);
  });
});
