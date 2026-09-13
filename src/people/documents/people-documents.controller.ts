import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../../auth/auth.decorators';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PEOPLE_ADMIN_ROLES } from '../common/people-access';
import { PeopleExceptionFilter } from '../common/people-exception.filter';
import { MAX_DOCUMENT_BYTES } from './document-file-validation';
import { PeopleDocumentsService } from './people-documents.service';

@Controller('people/documents')
@UseGuards(AuthGuard, RolesGuard)
@UseFilters(PeopleExceptionFilter)
@RequireRoles(...PEOPLE_ADMIN_ROLES)
export class PeopleDocumentsController {
  constructor(private readonly documentsService: PeopleDocumentsService) {}

  @Get('company')
  listCompanyDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listCompanyDocuments(user);
  }

  @Get('employees')
  listEmployeeDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listEmployeeDocuments(user);
  }

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listTemplates(user);
  }

  @Post()
  @UseInterceptors(
    // Multer rejects oversized bodies with 413 before they are buffered fully.
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.documentsService.uploadDocument(user, file, {
      name: body?.name,
      category: body?.category,
      scope: body?.scope,
      employeeId: body?.employeeId,
    });
  }
}
