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
  create(@Req() req: any, @Body() createInvoiceDto: CreateInvoiceDto) {
    const userId = req.user?.userId;
    return this.invoicesService.create(userId, createInvoiceDto);
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
  findOne(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.invoicesService.findOne(userId, id);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() updateInvoiceDto: UpdateInvoiceDto) {
    const userId = req.user?.userId;
    return this.invoicesService.update(userId, id, updateInvoiceDto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.invoicesService.remove(userId, id);
  }
}