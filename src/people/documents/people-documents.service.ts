import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { requirePeopleOrganization } from '../common/people-access';
import {
  avatarInitials,
  formatFileSize,
  toDateOnly,
} from '../common/people-mappers';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { DOCUMENT_STORAGE, type DocumentStorage } from './document-storage';
import {
  validateDocumentFile,
  type UploadedDocumentFile,
} from './document-file-validation';

export interface UploadDocumentInput {
  name: unknown;
  category: unknown;
  scope: unknown;
  employeeId?: unknown;
}

const CATEGORIES = [
  'Policy',
  'Contract',
  'Identification',
  'Compliance',
  'Compensation',
  'Other',
];

interface DocumentRecord {
  id: string;
  name: string;
  category: string;
  createdAt: Date;
  sizeBytes: number;
  visibility: string;
  employeeId: string | null;
}

@Injectable()
export class PeopleDocumentsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  async uploadDocument(
    user: AuthenticatedUser,
    file: UploadedDocumentFile | undefined,
    input: UploadDocumentInput,
  ) {
    const organizationId = requirePeopleOrganization(user);
    if (!file) {
      throw validationError('file', 'A file is required');
    }
    validateDocumentFile(file);
    const { name, category, scope, employeeId } = parseUploadInput(input);

    // Validate the assignment before any bytes are stored.
    const employee = employeeId
      ? await this.tenant.run(organizationId, (client) =>
          client.employee.findFirst({
            where: { id: employeeId, organizationId },
          }),
        )
      : null;
    if (employeeId && !employee) {
      throw validationError(
        'employeeId',
        'Employee was not found in this organization',
      );
    }

    // The object is stored before its row exists, so it gets its own random
    // name; the document row's ID is assigned by Postgres.
    const storageKey = `organizations/${organizationId}/documents/${randomUUID()}`;
    // Bytes first: metadata is only persisted once the file is durable.
    await this.storage.put({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimetype,
    });

    try {
      const document = await this.tenant.run(organizationId, (client) =>
        client.document.create({
          data: {
            organizationId,
            scope: scope === 'company' ? 'COMPANY' : 'EMPLOYEE',
            employeeId: employee?.id ?? null,
            name,
            category,
            // Display label only; access is decided by scope, not this text.
            visibility:
              scope === 'company' ? 'All employees' : 'Employee and HR',
            storageKey,
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.buffer.length,
            uploadedByUserId: user.id,
            createdAt: new Date(),
          },
        }),
      );

      return employee
        ? {
            scope: 'employee' as const,
            document: toEmployeeDocument(document, employee.fullName),
          }
        : { scope: 'company' as const, document: toCompanyDocument(document) };
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  listCompanyDocuments(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const documents = await client.document.findMany({
        where: { organizationId, scope: 'COMPANY' },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      return documents.map((document) => toCompanyDocument(document));
    });
  }

  listEmployeeDocuments(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const [documents, employees] = await Promise.all([
        client.document.findMany({
          where: { organizationId, scope: 'EMPLOYEE' },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
        client.employee.findMany({ where: { organizationId } }),
      ]);
      const names = new Map(
        employees.map((employee) => [employee.id, employee.fullName]),
      );
      return documents.map((document) =>
        toEmployeeDocument(
          document,
          names.get(document.employeeId ?? '') ?? '',
        ),
      );
    });
  }

  listTemplates(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const templates = await client.documentTemplate.findMany({
        where: { organizationId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return templates.map((template) => ({
        id: template.id,
        name: template.name,
        category: template.category,
        description: template.description,
      }));
    });
  }
}

function parseUploadInput(input: UploadDocumentInput) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    throw validationError('name', 'Document name is required');
  }
  if (
    typeof input.category !== 'string' ||
    !CATEGORIES.includes(input.category)
  ) {
    throw validationError(
      'category',
      `Category must be one of: ${CATEGORIES.join(', ')}`,
    );
  }
  if (input.scope !== 'company' && input.scope !== 'employee') {
    throw validationError('scope', 'Scope must be company or employee');
  }

  const employeeId =
    typeof input.employeeId === 'string' && input.employeeId.trim()
      ? input.employeeId.trim()
      : undefined;
  if (input.scope === 'employee' && !employeeId) {
    throw validationError(
      'employeeId',
      'employeeId is required for employee documents',
    );
  }
  if (input.scope === 'company' && employeeId) {
    throw validationError(
      'employeeId',
      'employeeId must be omitted for company documents',
    );
  }

  return { name, category: input.category, scope: input.scope, employeeId };
}

function validationError(field: string, message: string) {
  return new UnprocessableEntityException({
    code: 'VALIDATION_ERROR',
    message,
    fields: { [field]: message },
  });
}

function toCompanyDocument(document: DocumentRecord) {
  return {
    id: document.id,
    name: document.name,
    category: document.category,
    uploadedAt: toDateOnly(document.createdAt),
    fileSize: formatFileSize(document.sizeBytes),
    visibility: document.visibility,
  };
}

function toEmployeeDocument(document: DocumentRecord, employeeName: string) {
  return {
    id: document.id,
    name: document.name,
    category: document.category,
    uploadedAt: toDateOnly(document.createdAt),
    fileSize: formatFileSize(document.sizeBytes),
    employeeId: document.employeeId ?? '',
    employeeName,
    avatarInitials: avatarInitials(employeeName),
  };
}
