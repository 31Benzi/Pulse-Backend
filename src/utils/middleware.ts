import { createMiddleware } from "hono/factory";
import type { StatusCode } from "hono/utils/http-status";
import type { ApiError } from "./error";

const middleware = () =>
  createMiddleware(async (c, next) => {
    if (c.enhanced) return next();

    c.sendError = (error: ApiError) => {
      c.status(error.statusCode as StatusCode);
      return c.json(error.response);
    };

    c.sendStatus = (statusCode: number) => {
      c.status(statusCode as StatusCode);
      return c.body(null);
    };

    c.enhanced = true;

    await next();
  });

export default middleware;
