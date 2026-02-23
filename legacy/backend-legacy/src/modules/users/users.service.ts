import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Create user by walletAddress (id auto-generated)
  async create(dto: CreateUserDto) {
    // Check if user already exists
    const existing = await this.prisma.user.findUnique({
      where: { walletAddress: dto.walletAddress },
    });

    if (existing) return existing;

    return this.prisma.user.create({
      data: {
        walletAddress: dto.walletAddress,
        nonce: dto.nonce ?? Math.random().toString(36).substring(2, 10),
        nonceExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // expires in 10 mins
      },
    });
  }

    async findOrCreateByWalletAddress(walletAddress: string) {

        const normalized = walletAddress.toLowerCase();
    
        let user = await this.prisma.user.findUnique({
          where: { walletAddress: normalized },
        });
    
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              walletAddress: normalized,
              nonce: Math.random().toString(36).substring(2, 10),
              nonceExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
            },
          });
        }
    
        return user;
      }

  // Get all users
  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get one user by ID
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // Get one user by walletAddress
  async findByWallet(walletAddress: string) {
    const user = await this.prisma.user.findUnique({ where: { walletAddress } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // Update user (nonce or walletAddress)
  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: {
        ...dto,
        updatedAt: new Date(),
      },
    });
  }

  // Delete user
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id } });
  }
}
