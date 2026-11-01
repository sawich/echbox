import { z } from "zod";

export const EchoBodySchema = z.object({
  message: z.string().min(1).max(500),
});

export type EchoBody = z.infer<typeof EchoBodySchema>;

export const EchoResponseSchema = z.object({
  echo: z.string(),
});

export type EchoResponse = z.infer<typeof EchoResponseSchema>;
