export const ROLES = ['OWNER', 'MANAGER', 'ATTENDANT', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const VEHICLE_TYPES = ['TWO_WHEELER', 'CAR', 'SUV', 'COMMERCIAL'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PAID', 'PENDING', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SESSION_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PRICING_MODES = ['FLAT', 'HOURLY', 'SLAB'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const SLOT_STATUSES = ['AVAILABLE', 'OCCUPIED', 'BLOCKED'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const SHIFT_STATUSES = ['OPEN', 'CLOSED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const PASS_STATUSES = ['ACTIVE', 'CANCELLED'] as const;
export type PassStatus = (typeof PASS_STATUSES)[number];

export const AUTH_PROVIDERS = ['EMAIL', 'GOOGLE'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const ACTIVITY_ACTIONS = [
  'VEHICLE_ENTRY',
  'VEHICLE_EXIT',
  'SESSION_CANCELLED',
  'PAYMENT_COLLECTED',
  'SHIFT_STARTED',
  'SHIFT_ENDED',
  'PASS_CREATED',
  'PASS_RENEWED',
  'PASS_CANCELLED',
  'LOT_CREATED',
  'LOT_UPDATED',
  'STAFF_CREATED',
  'STAFF_UPDATED',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const SOCKET_EVENTS = {
  VEHICLE_ENTERED: 'vehicle:entered',
  VEHICLE_EXITED: 'vehicle:exited',
  OCCUPANCY_UPDATED: 'occupancy:updated',
  PAYMENT_RECEIVED: 'payment:received',
} as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
