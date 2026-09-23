export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  status: number;
  message: string;
  code?: string;
};

export type ApiResult<T> =
  | {
      success: true;
      data: T;
      message?: string;
    }
  | {
      success: false;
      error: ApiError;
    };