import type { TenantPrismaService } from '../tenant/tenant-prisma.service';

type Row = Record<string, any>;
type Where = Record<string, any>;
type OrderBy =
  Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];

const MODELS = [
  'organization',
  'employee',
  'department',
  'team',
  'teamMember',
  'leaveType',
  'leavePolicy',
  'leaveRequest',
  'leaveBalance',
  'document',
  'documentTemplate',
  'onboardingTemplate',
  'onboardingTemplateDepartment',
  'onboardingChecklistItem',
  'employeeOnboarding',
  'onboardingItemCompletion',
  'auditEvent',
] as const;

export type ModelName = (typeof MODELS)[number];

function isPlainObject(value: unknown): value is Row {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  );
}

function same(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return (left ?? null) === (right ?? null);
}

function flattenWhere(where: Where = {}): Where {
  const flat: Where = {};
  for (const [key, value] of Object.entries(where)) {
    // Compound unique selectors, e.g. { employeeId_itemId: { employeeId, itemId } }.
    if (key.includes('_') && isPlainObject(value)) {
      Object.assign(flat, value);
    } else {
      flat[key] = value as unknown;
    }
  }
  return flat;
}

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(flattenWhere(where)).every(([key, condition]) => {
    if (isPlainObject(condition) && 'in' in condition) {
      return (condition.in as unknown[]).some((value) => same(row[key], value));
    }
    if (isPlainObject(condition) && 'not' in condition) {
      return !same(row[key], condition.not);
    }
    return same(row[key], condition);
  });
}

function sortRows(rows: Row[], orderBy?: OrderBy): Row[] {
  if (!orderBy) return rows;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [field, direction] = Object.entries(order)[0];
      const value = (row: Row) =>
        (row[field] instanceof Date ? row[field].getTime() : row[field]) as
          number | string;
      const left = value(a);
      const right = value(b);
      if (left === right) continue;
      const result = left < right ? -1 : 1;
      return direction === 'desc' ? -result : result;
    }
    return 0;
  });
}

// Applies update data, including Prisma's atomic { increment } operator.
function applyData(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    row[key] = (
      isPlainObject(value) && 'increment' in value
        ? Number(row[key] ?? 0) + Number(value.increment)
        : value
    ) as unknown;
  }
}

class InMemoryModel {
  rows: Row[] = [];

  constructor(private readonly keyFields: string[]) {}

  findMany(args: { where?: Where; orderBy?: OrderBy } = {}) {
    return Promise.resolve(
      sortRows(
        this.rows.filter((row) => matches(row, args.where)),
        args.orderBy,
      ).map((row) => ({ ...row })),
    );
  }

  async findFirst(args: { where?: Where; orderBy?: OrderBy } = {}) {
    return (await this.findMany(args))[0] ?? null;
  }

  findUnique(args: { where: Where }) {
    return this.findFirst(args);
  }

  async findFirstOrThrow(args: { where?: Where; orderBy?: OrderBy } = {}) {
    const row = await this.findFirst(args);
    if (!row) {
      throw new Error('No record found');
    }
    return row;
  }

  count(args: { where?: Where } = {}) {
    return Promise.resolve(
      this.rows.filter((row) => matches(row, args.where)).length,
    );
  }

  create(args: { data: Row }) {
    const row = { createdAt: new Date(), ...args.data };
    const duplicate = this.rows.some((existing) =>
      this.keyFields.every((field) => same(existing[field], row[field])),
    );
    if (duplicate) {
      return Promise.reject(new Error('Unique constraint failed'));
    }
    this.rows.push(row);
    return Promise.resolve({ ...row });
  }

  update(args: { where: Where; data: Row }) {
    const row = this.rows.find((candidate) => matches(candidate, args.where));
    if (!row) {
      return Promise.reject(new Error('Record to update not found'));
    }
    applyData(row, args.data);
    return Promise.resolve({ ...row });
  }

  updateMany(args: { where: Where; data: Row }) {
    const rows = this.rows.filter((row) => matches(row, args.where));
    rows.forEach((row) => applyData(row, args.data));
    return Promise.resolve({ count: rows.length });
  }

  async upsert(args: { where: Where; create: Row; update: Row }) {
    const existing = this.rows.find((row) => matches(row, args.where));
    if (existing) {
      applyData(existing, args.update);
      return { ...existing };
    }
    return this.create({ data: args.create });
  }

  delete(args: { where: Where }) {
    const index = this.rows.findIndex((row) => matches(row, args.where));
    if (index === -1) {
      return Promise.reject(new Error('Record to delete does not exist'));
    }
    const [row] = this.rows.splice(index, 1);
    return Promise.resolve(row);
  }

  deleteMany(args: { where?: Where } = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matches(row, args.where));
    return Promise.resolve({ count: before - this.rows.length });
  }
}

const KEY_FIELDS: Partial<Record<ModelName, string[]>> = {
  teamMember: ['teamId', 'employeeId'],
  onboardingTemplateDepartment: ['templateId', 'departmentId'],
  employeeOnboarding: ['employeeId'],
  onboardingItemCompletion: ['employeeId', 'itemId'],
};

export type InMemoryDb = Record<ModelName, InMemoryModel>;

/**
 * Database boundary fake for People service tests: a minimal subset of the
 * Prisma delegate API over in-memory rows. It does not emulate RLS; services
 * must scope by organization themselves, which the tests verify.
 */
export function createInMemoryTenant() {
  const db = Object.fromEntries(
    MODELS.map((model) => [
      model,
      new InMemoryModel(KEY_FIELDS[model] ?? ['id']),
    ]),
  ) as InMemoryDb;

  const tenant = {
    run: <T>(_organizationId: string, work: (client: any) => Promise<T>) =>
      work(db),
  } as unknown as TenantPrismaService;

  const seed = (model: ModelName, rows: Row[]) => {
    db[model].rows.push(
      ...rows.map((row) => ({
        createdAt: new Date(),
        updatedAt: new Date(),
        ...row,
      })),
    );
  };

  return { db, tenant, seed };
}
