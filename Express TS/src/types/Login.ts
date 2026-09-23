import { User } from "./User";

export type LoginResult = {
  user: User;
  accessToken: string;
};