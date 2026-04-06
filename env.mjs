import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string().min(1),
    // NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    // NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
    /** Set to "true" to show vision pipeline debug (grid preview, chunk overlay). */
    NEXT_PUBLIC_VISION_DEBUG: z.string().optional(),
    /** If not "false", tile vision uses fast presence (Haiku) then refine bbox (Sonnet). */
    NEXT_PUBLIC_VISION_TILE_TWO_STAGE: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
    // NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_VISION_DEBUG: process.env.NEXT_PUBLIC_VISION_DEBUG,
    NEXT_PUBLIC_VISION_TILE_TWO_STAGE: process.env.NEXT_PUBLIC_VISION_TILE_TWO_STAGE,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   * This is especially useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
