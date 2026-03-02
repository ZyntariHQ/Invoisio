import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'stellar') {
        return {
          networkPassphrase: 'Test SDF Network ; September 2015',
        };
      }
      if (key === 'app') {
        return {
          version: '0.0.1',
        };
      }
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkHealth', () => {
    it('should return health status with ok: true', () => {
      const result = controller.checkHealth();
      
      expect(result.ok).toBe(true);
      expect(result.version).toBe('0.0.1');
      expect(result.network).toBe('testnet');
      expect(result.timestamp).toBeDefined();
    });
  });
});
