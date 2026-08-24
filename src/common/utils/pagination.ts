import { Pagination } from '../types';

export function parsePagination(
  query: Record<string, unknown>,
  defaults: { limit?: number; maxLimit?: number } = {}
): Pagination {
  const maxLimit = defaults.maxLimit ?? 100;
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), maxLimit)
      : (defaults.limit ?? 20);
  return { page, limit, skip: (page - 1) * limit };
}
