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
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiBearerAuth, ApiTags, ApiQuery, ApiOperation } from '@nestjs/swagger';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('api/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @ApiOperation({ summary: 'Create invoice' })
  create(@GetUser('sub') userId: string, @Body() createInvoiceDto: CreateInvoiceDto) {
    return this.invoicesService.create(userId, createInvoiceDto);
  }

  @Get()
  @ApiOperation({ summary: 'List invoices' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @GetUser('sub') userId: string,
    @Query() paginationDto: PaginationDto,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.invoicesService.findAll(
      userId,
      paginationDto.page,
      paginationDto.limit,
      status,
      search,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by id' })
  findOne(@GetUser('sub') userId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update invoice' })
  update(
    @GetUser('sub') userId: string,
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(userId, id, updateInvoiceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete invoice' })
  remove(@GetUser('sub') userId: string, @Param('id') id: string) {
    return this.invoicesService.remove(userId, id);
  }
}