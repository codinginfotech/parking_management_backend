import { AuthProvider, Role } from '../../common/constants';

export interface SerializedUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  profileImage?: string;
  role: Role;
  authProvider: AuthProvider;
  isEmailVerified: boolean;
  assignedLotIds: string[];
  business: { id: string; name: string } | null;
}

export interface AuthResult {
  user: SerializedUser;
  accessToken: string;
  refreshToken: string;
}
