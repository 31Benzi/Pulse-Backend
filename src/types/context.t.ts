import type { ApiError } from "../utils/error";

declare module "hono" {
  interface Context {
    sendError: (error: ApiError) => Response;
    sendStatus: (status: number) => Response;
    enhanced: boolean;
  }
}
