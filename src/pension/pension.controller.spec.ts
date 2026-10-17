/* eslint-disable @typescript-eslint/unbound-method */
import { PensionController } from './pension.controller';
import { PensionService } from './pension.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import { AttachEmployerDto, ValidateEmployerCodeDto } from './dto/pension.dto';

describe('PensionController', () => {
  let controller: PensionController;
  let service: jest.Mocked<PensionService>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    name: 'HR Admin',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.HR_ADMIN,
    organizationId: 'org-123',
  };

  beforeEach(() => {
    service = {
      getRegisteredPfas: jest.fn(),
      getEmployerConfig: jest.fn(),
      updateEmployerConfig: jest.fn(),
      createScheduleFromPayroll: jest.fn(),
      listSchedules: jest.fn(),
      getSchedule: jest.fn(),
      validateSchedule: jest.fn(),
      checkValidationStatus: jest.fn(),
      submitSchedule: jest.fn(),
      initiatePayment: jest.fn(),
      syncPaymentStatus: jest.fn(),
      syncDisbursements: jest.fn(),
      getDashboard: jest.fn(),
      getComplianceReport: jest.fn(),
      validateEmployerCode: jest.fn(),
      attachEmployer: jest.fn(),
      getEmployerStatus: jest.fn(),
      revokeEmployer: jest.fn(),
    } as any;

    controller = new PensionController(service);
  });

  it('delegates validateEmployer', async () => {
    const dto = new ValidateEmployerCodeDto();
    dto.employerCode = 'PR0000126311';
    await controller.validateEmployer(mockUser, dto);
    expect(service.validateEmployerCode).toHaveBeenCalledWith(mockUser, dto);
  });

  it('delegates attachEmployer', async () => {
    const dto = new AttachEmployerDto();
    dto.validationId = 'ev_123';
    await controller.attachEmployer(mockUser, dto);
    expect(service.attachEmployer).toHaveBeenCalledWith(mockUser, dto);
  });

  it('delegates getEmployerStatus', async () => {
    await controller.getEmployerStatus(mockUser);
    expect(service.getEmployerStatus).toHaveBeenCalledWith(mockUser);
  });

  it('delegates revokeEmployer', async () => {
    await controller.revokeEmployer(mockUser);
    expect(service.revokeEmployer).toHaveBeenCalledWith(mockUser);
  });

  it('delegates getRegisteredPfas', () => {
    controller.getRegisteredPfas();
    expect(service.getRegisteredPfas).toHaveBeenCalled();
  });

  it('delegates getEmployerConfig', async () => {
    await controller.getEmployerConfig(mockUser);
    expect(service.getEmployerConfig).toHaveBeenCalledWith(mockUser);
  });

  it('delegates updateEmployerConfig', async () => {
    await controller.updateEmployerConfig(mockUser, {
      penCentralEmployerCode: 'EMP001',
    });
    expect(service.updateEmployerConfig).toHaveBeenCalledWith(mockUser, {
      penCentralEmployerCode: 'EMP001',
    });
  });

  it('delegates createScheduleFromPayroll', async () => {
    await controller.createScheduleFromPayroll(mockUser, 'run-1');
    expect(service.createScheduleFromPayroll).toHaveBeenCalledWith(
      mockUser,
      'run-1',
    );
  });

  it('delegates listSchedules', async () => {
    await controller.listSchedules(mockUser, {});
    expect(service.listSchedules).toHaveBeenCalledWith(mockUser, {});
  });

  it('delegates getSchedule', async () => {
    await controller.getSchedule(mockUser, 'sch-1');
    expect(service.getSchedule).toHaveBeenCalledWith(mockUser, 'sch-1');
  });

  it('delegates validateSchedule', async () => {
    await controller.validateSchedule(mockUser, 'sch-1');
    expect(service.validateSchedule).toHaveBeenCalledWith(mockUser, 'sch-1');
  });

  it('delegates checkValidationStatus', async () => {
    await controller.checkValidationStatus(mockUser, 'sch-1');
    expect(service.checkValidationStatus).toHaveBeenCalledWith(
      mockUser,
      'sch-1',
    );
  });

  it('delegates submitSchedule', async () => {
    await controller.submitSchedule(mockUser, 'sch-1');
    expect(service.submitSchedule).toHaveBeenCalledWith(mockUser, 'sch-1');
  });

  it('delegates initiatePayment', async () => {
    await controller.initiatePayment(mockUser, 'sch-1');
    expect(service.initiatePayment).toHaveBeenCalledWith(mockUser, 'sch-1');
  });

  it('delegates syncPaymentStatus', async () => {
    await controller.syncPaymentStatus(mockUser, 'sch-1');
    expect(service.syncPaymentStatus).toHaveBeenCalledWith(mockUser, 'sch-1');
  });

  it('delegates syncDisbursements', async () => {
    await controller.syncDisbursements(mockUser, 'sch-1');
    expect(service.syncDisbursements).toHaveBeenCalledWith(mockUser, 'sch-1');
  });

  it('delegates getDashboard', async () => {
    await controller.getDashboard(mockUser);
    expect(service.getDashboard).toHaveBeenCalledWith(mockUser);
  });

  it('delegates getComplianceReport', async () => {
    await controller.getComplianceReport(mockUser);
    expect(service.getComplianceReport).toHaveBeenCalledWith(mockUser);
  });
});
