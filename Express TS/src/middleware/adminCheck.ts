import { NextFunction, Request, Response } from "express";

const checkAdmin = (req: Request, res: Response, next: NextFunction) => {
  const isAdmin = false;

  if (!isAdmin) {
    return res.status(403).json({
      message: "Forbidden"
    });
  }

  next();
};

export default checkAdmin;