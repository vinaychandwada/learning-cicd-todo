export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Todo {
  _id: string;
  user: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  _id: string;
  user: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  bio: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  message?: string;
}
