import { z } from "zod";

export const CardVoteValueSchema = z.enum(["like", "dislike"]);
export type CardVoteValue = z.infer<typeof CardVoteValueSchema>;

export const CardVoteCountsSchema = z.object({
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
  myVote: CardVoteValueSchema.nullable(),
});
export type CardVoteCounts = z.infer<typeof CardVoteCountsSchema>;

export const SetCardVoteBodySchema = z.object({
  vote: CardVoteValueSchema.nullable(),
});
export type SetCardVoteBody = z.infer<typeof SetCardVoteBodySchema>;
