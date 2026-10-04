import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

// centralized error handling
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  console.error(err);

  // Handle expected application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,              
      error: {                    
        status: err.statusCode,    
        message: err.message,      
        code: err.code,            
        ...(err.details && {       
          details: err.details     
        })                         
      }                            
    });
    return;
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,               
    error: {                      
      status: 500,                
      message: "Internal server error",
      code: "INTERNAL_SERVER_ERROR"     
    }
  });
};