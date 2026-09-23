import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export type AccessTokenPayload = {
  userId: string;
};

export const generateAccessToken = (
  userId: string
): string => {
  return jwt.sign( { userId }, env.jwtSecret, { expiresIn: "15m" } );
};