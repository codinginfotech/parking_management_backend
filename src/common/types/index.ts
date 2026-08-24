import { Role } from '../constants';

export interface AuthUser {
  id: string;
  fullName: string;
  role: Role;
  businessId: string | null;
  /** Lots explicitly assigned to a MANAGER/ATTENDANT. Empty = all lots of the business. */
  assignedLotIds: string[];
}

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}
