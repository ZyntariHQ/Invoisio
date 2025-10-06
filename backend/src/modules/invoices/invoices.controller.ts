import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('api/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('create')
  create(@Body() createInvoiceDto: CreateInvoiceDto) {
    // In a real implementation, you would get the userId from the JWT token
    const userId = 'user-id-from-jwt';
    return this.invoicesService.create(userId, createInvoiceDto);
  }

  @Get()
  findAll(
    @Query() paginationDto: PaginationDto,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    // In a real implementation, you would get the userId from the JWT token
    const userId = 'user-id-from-jwt';
    return this.invoicesService.findAll(
      userId,
      paginationDto.page,
      paginationDto.limit,
      status,
      search,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    // In a real implementation, you would get the userId from the JWT token
    const userId = 'user-id-from-jwt';
    return this.invoicesService.findOne(userId, id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateInvoiceDto: UpdateInvoiceDto) {
    // In a real implementation, you would get the userId from the JWT token
    const userId = 'user-id-from-jwt';
    return this.invoicesService.update(userId, id, updateInvoiceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    // In a real implementation, you would get the userId from the JWT token
    const userId = 'user-id-from-jwt';
    return this.invoicesService.remove(userId, id);
  }
}