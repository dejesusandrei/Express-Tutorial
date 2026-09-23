import type { User } from '../types/User'

const users: User[] = [];

export const findAll = async (): Promise<User[]> => {
  return users;
};

export const findById = async (id: string): Promise<User | undefined> => {
  return users.find(user => user.id === id);
};

export const findByEmail = async (email: string): Promise<User | undefined> =>{
  return users.find(user => user.email === email);
}

export const create = async (user: User): Promise<User> => {
  users.push(user);

  return user;
}

export const deleteById = async (
  id: string
): Promise<User | undefined> => {
  const index = users.findIndex(user => user.id === id);
  
  if (index === -1) {
    return undefined;
  }

  const [deletedUser] = users.splice(index, 1);

  return deletedUser;
}