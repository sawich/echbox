import { test, expect } from "bun:test";
import { galleryAspect } from "./gallery";

test("character aspect", () => {
  expect(galleryAspect("character")).toBe("aspect-[252/352]");
});

test("scene aspect", () => {
  expect(galleryAspect("scene")).toBe("aspect-[320/180]");
});

test("clothes aspect", () => {
  expect(galleryAspect("clothes")).toBe("aspect-[252/352]");
});
