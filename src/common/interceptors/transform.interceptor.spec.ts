import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new TransformInterceptor(reflector);
  });

  const createMockContext = (): ExecutionContext => {
    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  it('should wrap standard payload in success envelope', (done) => {
    const context = createMockContext();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const next: CallHandler = {
      handle: () => of({ foo: 'bar' }),
    };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toEqual({
          success: true,
          message: 'Request successful',
          data: { foo: 'bar' },
        });
        done();
      },
    });
  });

  it('should bypass transformation when @BypassTransform is set', (done) => {
    const context = createMockContext();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const next: CallHandler = {
      handle: () => of('# HELP prometheus_metric'),
    };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toBe('# HELP prometheus_metric');
        done();
      },
    });
  });

  it('should not double-wrap an already formatted envelope', (done) => {
    const context = createMockContext();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const alreadyFormatted = {
      success: true,
      message: 'Already formatted',
      data: [1, 2, 3],
    };

    const next: CallHandler = {
      handle: () => of(alreadyFormatted),
    };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toEqual(alreadyFormatted);
        done();
      },
    });
  });
});
