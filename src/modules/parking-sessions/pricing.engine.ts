import { PricingRule } from '../../common/types/domain';

const DAY_MINUTES = 24 * 60;

/**
 * The single source of truth for parking charges. The mobile app only ever
 * displays amounts computed here — a client-side figure is never trusted.
 */
export function calculateParkingAmount(
  rule: PricingRule | undefined,
  durationMinutes: number
): number {
  if (!rule) return 0;
  const minutes = Math.max(1, Math.ceil(durationMinutes));
  let amount = 0;

  switch (rule.mode) {
    case 'FLAT': {
      amount = rule.flatRate ?? 0;
      break;
    }
    case 'HOURLY': {
      const hours = Math.max(1, Math.ceil(minutes / 60));
      amount = (rule.firstHourRate ?? 0) + (hours - 1) * (rule.additionalHourRate ?? 0);
      break;
    }
    case 'SLAB': {
      const slabs = [...(rule.slabs ?? [])].sort((a, b) => a.uptoMinutes - b.uptoMinutes);
      if (slabs.length === 0) break;
      const match = slabs.find((slab) => minutes <= slab.uptoMinutes);
      if (match) {
        amount = match.amount;
      } else {
        const last = slabs[slabs.length - 1]!;
        const overflowHours = Math.ceil((minutes - last.uptoMinutes) / 60);
        amount = last.amount + overflowHours * (rule.overflowHourlyRate ?? 0);
      }
      break;
    }
  }

  if (rule.dailyMax !== undefined && rule.dailyMax > 0) {
    const days = Math.max(1, Math.ceil(minutes / DAY_MINUTES));
    amount = Math.min(amount, rule.dailyMax * days);
  }

  return Math.round(amount);
}

export function durationInMinutes(entryTime: Date, exitTime: Date = new Date()): number {
  return Math.max(1, Math.ceil((exitTime.getTime() - entryTime.getTime()) / 60000));
}
