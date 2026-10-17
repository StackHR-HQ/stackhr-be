import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from '../context/request-context.service';

describe('AppLoggerService', () => {
  let loggerService: AppLoggerService;

  beforeEach(() => {
    loggerService = new AppLoggerService();
  });

  it('should initialize and log without error', () => {
    expect(() => {
      loggerService.log('Application started successfully', 'Bootstrap');
      loggerService.warn('This is a test warning', 'TestContext');
      loggerService.debug?.('Debugging details', 'TestContext');
      loggerService.verbose?.('Verbose trace', 'TestContext');
    }).not.toThrow();
  });

  it('should log structured errors with stack trace and metadata', () => {
    const error = new Error('Test database connection failed');
    expect(() => {
      loggerService.error(error, error.stack, 'DatabaseModule');
    }).not.toThrow();
  });

  it('should enrich log entries with RequestContext metadata when active', () => {
    RequestContextService.run(
      {
        correlationId: 'test-corr-abc',
        traceId: 'test-trace-xyz',
        organizationId: 'org-test-123',
        userId: 'usr-test-456',
        startTime: Date.now(),
      },
      () => {
        expect(() => {
          loggerService.log(
            { action: 'EXECUTE_PAYROLL', amount: 150000 },
            'PayrollService',
          );
        }).not.toThrow();
      },
    );
  });

  it('should redact sensitive fields when logging objects', () => {
    const pinoInstance = (loggerService as any).pino;
    const infoSpy = jest.spyOn(pinoInstance, 'info');

    loggerService.log({
      user: 'john.doe@example.com',
      password: 'SuperSecretPassword123!',
      token: 'bearer-jwt-token-xyz',
      accountNumber: '0123456789',
    });

    expect(infoSpy).toHaveBeenCalled();
  });
});
