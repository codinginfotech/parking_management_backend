import { PricingMode, VehicleType } from '../constants';

export interface PricingSlab {
  uptoMinutes: number;
  amount: number;
}

export interface PricingRule {
  vehicleType: VehicleType;
  mode: PricingMode;
  flatRate?: number;
  firstHourRate?: number;
  /** Falls back to firstHourRate when unset. */
  additionalHourRate?: number;
  /** Charged per started 24h day (DAILY mode). */
  dailyRate?: number;
  slabs?: PricingSlab[];
  /** Charged per extra hour beyond the last slab. */
  overflowHourlyRate?: number;
  /** Cap applied per 24h window. */
  dailyMax?: number;
}

export interface CapacityEntry {
  vehicleType: VehicleType;
  spaces: number;
}

export interface OperatingHours {
  is24Hours: boolean;
  open?: string;
  close?: string;
}

export interface PassRenewal {
  renewedAt: string;
  months: number;
  amount: number;
  by: string;
}

/** Safe casts for Prisma Json columns whose shape the app owns. */
export function asJson<T>(value: unknown, fallback: T): T {
  return (value ?? fallback) as T;
}
