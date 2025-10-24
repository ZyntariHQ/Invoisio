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
  Req,
  Patch,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { RequestWithUser } from '../../types/request-with-user';

@Controller('api/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('create')
  create(@Req() req: RequestWithUser, @Body() createInvoiceDto: CreateInvoiceDto) {
    const userId = req.user?.id;
    return this.invoicesService.create(userId, createInvoiceDto);
  }

  @Get('user/:id')
  async findAllByUser(@Param('id') userId: string) {
    return this.invoicesService.findAllByUser(userId);
  }
  

  @Get()
  findAll(
    @Req() req: any,
    @Query() paginationDto: PaginationDto,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const userId = req.user?.userId;
    return this.invoicesService.findAll(
      userId,
      paginationDto.page,
      paginationDto.limit,
      status,
      search,
    );
  }

   @Get(':id')
   async findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
     const userId = req.user?.id;
     return this.invoicesService.findOne(id, userId);
   }
 
   @Patch(':id')
   async update(@Param('id') id: string, @Req() req: RequestWithUser, @Body() dto: UpdateInvoiceDto) {
     const userId = req.user?.id;
     return this.invoicesService.update(id, userId, dto);
   }
 
   @Delete(':id')
   async remove(@Param('id') id: string, @Req() req: RequestWithUser) {
     const userId = req.user?.id;
     return this.invoicesService.remove(id, userId);
   }
}