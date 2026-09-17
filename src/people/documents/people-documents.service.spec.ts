import { createInMemoryTenant } from '../testing/in-memory-tenant';
import { adminUser, employeeRow } from '../testing/fixtures';
import type { DocumentStorage } from './document-storage';
import { PeopleDocumentsService } from './people-documents.service';

function createInMemoryStorage() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const storage: DocumentStorage = {
    put: ({ key, body, contentType }) => {
      objects.set(key, { body, contentType });
      return Promise.resolve();
    },
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
  return { storage, objects };
}

function pdfFile(size = 2048) {
  const buffer = Buffer.alloc(size);
  buffer.write('%PDF-1.7');
  return {
    originalname: 'handbook.pdf',
    mimetype: 'application/pdf',
    size,
    buffer,
  };
}

describe('PeopleDocumentsService', () => {
  let fake: ReturnType<typeof createInMemoryTenant>;
  let storage: ReturnType<typeof createInMemoryStorage>;
  let service: PeopleDocumentsService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-13T09:00:00.000Z') });
    fake = createInMemoryTenant();
    storage = createInMemoryStorage();
    service = new PeopleDocumentsService(fake.tenant, storage.storage);
    fake.seed('employee', [employeeRow()]);
  });

  afterEach(() => jest.useRealTimers());

  describe('uploadDocument', () => {
    it('stores a company document privately and lists it with company documents', async () => {
      const file = pdfFile();

      const result = await service.uploadDocument(adminUser(), file, {
        name: '  Employee handbook ',
        category: 'Policy',
        scope: 'company',
      });

      const expectedDocument = {
        id: expect.any(String) as unknown,
        name: 'Employee handbook',
        category: 'Policy',
        uploadedAt: '2026-09-13',
        fileSize: '2.0 KB',
        visibility: 'All employees',
      };
      expect(result).toEqual({ scope: 'company', document: expectedDocument });
      await expect(service.listCompanyDocuments(adminUser())).resolves.toEqual([
        expectedDocument,
      ]);
      expect([...storage.objects.values()]).toEqual([
        { body: file.buffer, contentType: 'application/pdf' },
      ]);
    });

    it('assigns an employee document and lists it with employee documents', async () => {
      const result = await service.uploadDocument(adminUser(), pdfFile(512), {
        name: 'Signed contract',
        category: 'Contract',
        scope: 'employee',
        employeeId: 'emp_ada',
      });

      const expectedDocument = {
        id: expect.any(String) as unknown,
        name: 'Signed contract',
        category: 'Contract',
        uploadedAt: '2026-09-13',
        fileSize: '512 B',
        employeeId: 'emp_ada',
        employeeName: 'Ada Okafor',
        avatarInitials: 'AO',
      };
      expect(result).toEqual({ scope: 'employee', document: expectedDocument });
      await expect(service.listEmployeeDocuments(adminUser())).resolves.toEqual(
        [expectedDocument],
      );
      await expect(service.listCompanyDocuments(adminUser())).resolves.toEqual(
        [],
      );
    });
  });

  describe('listTemplates', () => {
    it('returns the caller organization template catalog by name', async () => {
      fake.seed('documentTemplate', [
        {
          id: 'tpl_offer',
          organizationId: 'org_a',
          name: 'Offer letter',
          category: 'Contract',
          description: 'Standard offer',
        },
        {
          id: 'tpl_nda',
          organizationId: 'org_a',
          name: 'NDA',
          category: 'Compliance',
          description: 'Mutual NDA',
        },
        {
          id: 'tpl_other',
          organizationId: 'org_b',
          name: 'Hidden',
          category: 'Other',
          description: '',
        },
      ]);

      await expect(service.listTemplates(adminUser())).resolves.toEqual([
        {
          id: 'tpl_nda',
          name: 'NDA',
          category: 'Compliance',
          description: 'Mutual NDA',
        },
        {
          id: 'tpl_offer',
          name: 'Offer letter',
          category: 'Contract',
          description: 'Standard offer',
        },
      ]);
    });
  });
});
