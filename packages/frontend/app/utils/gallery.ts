import type { CardType } from "@echbox/shared";

export function galleryAspect(
  type: CardType,
): "aspect-[252/352]" | "aspect-[320/180]" {
  return type === "scene" ? "aspect-[320/180]" : "aspect-[252/352]";
}
