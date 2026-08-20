export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  user: AuthUser;
  context?: any;
  error?: string;
}
