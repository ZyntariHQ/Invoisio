import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    Patch,
    Delete,
    UseGuards,
  } from '@nestjs/common';
  import { UsersService } from './users.service';
  import { CreateUserDto } from './dto/create-user.dto';
  import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
  
  @Controller('api/users')
  @UseGuards(JwtAuthGuard)
  export class UsersController {
    constructor(private readonly usersService: UsersService) {}
  
    // Create user (by walletAddress)
    @Post()
    create(@Body() dto: CreateUserDto) {
      return this.usersService.create(dto);
    }
  
    // Get all users
    @Get()
    findAll() {
      return this.usersService.findAll();
    }
  
    // Get user by ID
    @Get(':id')
    findOne(@Param('id') id: string) {
      return this.usersService.findOne(id);
    }
  
    // Get user by wallet address
    @Get('wallet/:walletAddress')
    findByWallet(@Param('walletAddress') walletAddress: string) {
      return this.usersService.findByWallet(walletAddress);
    }
  
    // Update user
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
      return this.usersService.update(id, dto);
    }
  
    // Delete user
    @Delete(':id')
    remove(@Param('id') id: string) {
      return this.usersService.remove(id);
    }
  }
  