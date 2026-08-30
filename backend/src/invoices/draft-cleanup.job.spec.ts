import { Test, TestingModule } from "@nestjs/testing";
import { DraftCleanupJob } from "./draft-cleanup.job";
import { DraftService } from "./draft.service";
import { ConfigService } from "@nestjs/config";

/**
 * Unit tests for DraftCleanupJob.
 *
 * The job must:
 *  1. Log started + completed when drafts are deleted.
 *  2. Log started + "no stale drafts" when count is 0.
 *  3. Catch and log unexpected errors WITHOUT re-throwing so the scheduler
 *     continues running on subsequent intervals.
 */
describe("DraftCleanupJob", () => {
  let job: DraftCleanupJob;

  const mockDraftService = {
    cleanupOldDrafts: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(30),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftCleanupJob,
        { provide: DraftService, useValue: mockDraftService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    job = module.get<DraftCleanupJob>(DraftCleanupJob);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("run()", () => {
    it("should log completion when stale drafts are deleted", async () => {
      mockDraftService.cleanupOldDrafts.mockResolvedValueOnce({
        deletedCount: 5,
      });

      const logSpy = jest
        .spyOn((job as any).logger, "log")
        .mockImplementation(() => {});

      await job.run();

      expect(mockDraftService.cleanupOldDrafts).toHaveBeenCalledTimes(1);
      // Two log lines: started + complete-with-count
      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(logSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("retentionDays=30"),
      );
      expect(logSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("deleted 5 stale draft(s)"),
      );
    });

    it("should log 'no stale drafts found' when deletedCount is 0", async () => {
      mockDraftService.cleanupOldDrafts.mockResolvedValueOnce({
        deletedCount: 0,
      });

      const logSpy = jest
        .spyOn((job as any).logger, "log")
        .mockImplementation(() => {});

      await job.run();

      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(logSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("no stale drafts found"),
      );
    });

    it("should catch errors and log them without re-throwing", async () => {
      const boom = new Error("DB connection lost");
      mockDraftService.cleanupOldDrafts.mockRejectedValueOnce(boom);

      const errorSpy = jest
        .spyOn((job as any).logger, "error")
        .mockImplementation(() => {});
      // Suppress the start log to keep the test focused on the error path
      jest.spyOn((job as any).logger, "log").mockImplementation(() => {});

      // Must NOT throw — the scheduler must stay alive
      await expect(job.run()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("unexpected error"),
        expect.stringContaining("DB connection lost"),
      );
    });
  });
});
