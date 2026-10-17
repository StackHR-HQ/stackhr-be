import { GlobalExceptionFilter } from './global-exception.filter';
import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: any;
  let mockArgumentsHost: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should capture HttpException and attach correlationId and traceId', () => {
    RequestContextService.run(
      {
        correlationId: 'test-corr-filter-1',
        traceId: 'test-trace-filter-1',
        startTime: Date.now(),
      },
      () => {
        const exception = new BadRequestException('Invalid email address');
        filter.catch(exception, mockArgumentsHost);

        expect(mockResponse.status).toHaveBeenCalledWith(
          HttpStatus.BAD_REQUEST,
        );
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          message: 'Invalid email address',
          data: null,
          error: {
            error: 'Bad Request',
            statusCode: HttpStatus.BAD_REQUEST,
            correlationId: 'test-corr-filter-1',
            traceId: 'test-trace-filter-1',
          },
        });
      },
    );
  });

  it('should handle unhandled native Errors as 500 with trace details', () => {
    RequestContextService.run(
      {
        correlationId: 'test-corr-500',
        traceId: 'test-trace-500',
        startTime: Date.now(),
      },
      () => {
        const exception = new Error('Unexpected database connection drop');
        filter.catch(exception, mockArgumentsHost);

        expect(mockResponse.status).toHaveBeenCalledWith(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          message: 'Unexpected database connection drop',
          data: null,
          error: {
            error: 'Error',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            correlationId: 'test-corr-500',
            traceId: 'test-trace-500',
          },
        });
      },
    );
  });
});
