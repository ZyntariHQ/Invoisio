import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infra/prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('test-token'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              upsert: jest.fn().mockResolvedValue({
                id: 'user-id',
                walletAddress: 'wallet-address',
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('connectWallet', () => {
    it('should connect wallet and return token and user', async () => {
      const connectWalletDto = {
        walletAddress: 'wallet-address',
        signature: 'signature',
        message: 'message',
      };

      const result = await service.connectWallet(connectWalletDto);

      expect(result).toEqual({
        token: 'test-token',
        user: {
          id: 'user-id',
          walletAddress: 'wallet-address',
        },
      });
      expect(prismaService.user.upsert).toHaveBeenCalledWith({
        where: { walletAddress: connectWalletDto.walletAddress },
        update: {},
        create: {
          walletAddress: connectWalletDto.walletAddress,
        },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-id',
        walletAddress: 'wallet-address',
      });
    });
  });
});