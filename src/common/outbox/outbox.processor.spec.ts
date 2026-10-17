import { OutboxProcessor } from './outbox.processor';
import { OutboxService } from './outbox.service';

describe('OutboxProcessor', () => {
  let processor: OutboxProcessor;
  let mockOutboxService: Partial<OutboxService>;

  beforeEach(() => {
    mockOutboxService = {
      processPending: jest.fn().mockResolvedValue({
        processedCount: 2,
        failedCount: 0,
        deadLetterCount: 0,
      }),
    };

    processor = new OutboxProcessor(mockOutboxService as OutboxService);
  });

  afterEach(() => {
    processor.onApplicationShutdown();
  });

  it('should call outboxService.processPending when polling', async () => {
    await processor.poll();
    expect(mockOutboxService.processPending).toHaveBeenCalled();
  });

  it('should prevent overlapping poll runs if a previous run is in progress', async () => {
    let resolveFirstRun: (val: any) => void = () => {};
    (mockOutboxService.processPending as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstRun = resolve;
      }),
    );

    const firstRunPromise = processor.poll();
    // Second concurrent call while first is still pending
    await processor.poll();

    expect(mockOutboxService.processPending).toHaveBeenCalledTimes(1);

    resolveFirstRun({ processedCount: 1, failedCount: 0, deadLetterCount: 0 });
    await firstRunPromise;
  });

  it('should cleanly stop timer on application shutdown', () => {
    processor.onApplicationShutdown();
    expect(() => processor.onApplicationShutdown()).not.toThrow();
  });
});
