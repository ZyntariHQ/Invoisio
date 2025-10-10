import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('api/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-invoice')
  @ApiOperation({ summary: 'Generate invoice draft with OpenAI' })
  generateInvoice(@Body() generateInvoiceDto: GenerateInvoiceDto) {
    return this.aiService.generateInvoice(generateInvoiceDto);
  }
}