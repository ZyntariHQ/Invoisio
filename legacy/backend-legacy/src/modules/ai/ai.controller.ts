import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-invoice')
  generateInvoice(@Body() generateInvoiceDto: GenerateInvoiceDto) {
    return this.aiService.generateInvoice(generateInvoiceDto);
  }
}