import type { RequestHandler } from "express";

// "Kapag nagkaroon ng rejected Promise, ipasa mo yung error sa Express error middleware."
export const asyncHandler = (handler: RequestHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};