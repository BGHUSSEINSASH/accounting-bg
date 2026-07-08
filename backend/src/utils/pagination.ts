export interface PaginationParams {
  page: number;
  limit: number;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function getPaginationParams(query: any): PaginationParams {
  return {
    page: Math.max(1, parseInt(query.page) || 1),
    limit: Math.min(500, Math.max(1, parseInt(query.limit) || 50)),
    search: query.search,
    sort_by: query.sort_by,
    sort_order: (query.sort_order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.limit);
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

export function buildSearchQuery(
  baseQuery: string,
  countQuery: string,
  params: PaginationParams,
  searchFields: string[],
  extraWhere?: string
): { query: string; countQueryStr: string; values: any[] } {
  const values: any[] = [];
  const conditions: string[] = [];

  if (extraWhere) conditions.push(extraWhere);

  if (params.search && searchFields.length > 0) {
    const searchConditions = searchFields.map(f => `${f} LIKE ?`);
    const searchVal = `%${params.search}%`;
    conditions.push(`(${searchConditions.join(' OR ')})`);
    searchFields.forEach(() => values.push(searchVal));
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = params.sort_by
    ? ` ORDER BY ${params.sort_by} ${params.sort_order || 'asc'}`
    : '';
  const limitClause = ` LIMIT ? OFFSET ?`;
  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  return {
    query: `${baseQuery}${whereClause}${orderClause}${limitClause}`,
    countQueryStr: `${countQuery}${whereClause}`,
    values,
  };
}
