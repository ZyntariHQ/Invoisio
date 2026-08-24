import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            checkReadiness: jest.fn(() => Promise.resolve({
              ok: true,
              version: '0.0.1',
              network: 'testnet',
              timestamp: new Date().toISOString(),
              anchoring: {
                enabled: false,
                contractIdConfigured: false,
                adminKeyConfigured: false,
                message: 'Anchoring is disabled',
              },
              checks: {
                postgres: { status: 'up', latencyMs: 10 },
                horizon: { status: 'up', latencyMs: 20 },
                soroban_rpc: { status: 'up', latencyMs: 30 },
              },
            })),
            checkLiveness: jest.fn(() => ({
              ok: true,
              version: '0.0.1',
              network: 'testnet',
              timestamp: new Date().toISOString(),
              anchoring: {
                enabled: false,
                contractIdConfigured: false,
                adminKeyConfigured: false,
                message: 'Anchoring is disabled',
              },
            })),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
