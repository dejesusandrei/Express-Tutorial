import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/AppError";

export const validate = (
  schema: ZodType,
  source: "body" | "params" = "body"
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details: Record<string, string[]> = {};

      for (const issue of result.error.issues) {
        const field = issue.path.join(".");

        if (!details[field]) {
          details[field] = [];
        }

        details[field].push(issue.message);
      }

      return next(
        new AppError("Validation failed", 400, "VALIDATION_ERROR", details)
      );
    }
    req[source] = result.data;
    next();
  };
};