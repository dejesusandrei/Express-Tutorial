// This file extends Express's built-in Request type.
//
// By default, Express does NOT know about req.user.
// We add our own "user" property here so TypeScript
// will recognize req.user inside our controllers/middleware.

declare global {
  namespace Express {
    interface Request {
      // "?" means user is optional.
      //
      // Why optional?
      // Not every route requires authentication.
      // If authMiddleware hasn't run, req.user can be undefined.
      user?: {
        // The userId comes from the verified JWT payload.
        userId: string;
      };
    }
  }
}

// Makes this file an external module,
// allowing us to use "declare global" above.
export {};