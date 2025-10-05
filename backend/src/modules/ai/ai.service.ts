import { Injectable } from '@nestjs/common';
import { OpenAI } from 'openai';
import { ConfigService } from '@nestjs/config';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';

@Injectable()
export class AiService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async generateInvoice(generateInvoiceDto: GenerateInvoiceDto) {
    // In a real implementation, you would call the OpenAI API
    // For now, we'll return a mock response
    
    // Mock AI response
    const mockDraft = {
      clientName: generateInvoiceDto.clientInfo || 'Client Name',
      items: [
        {
          description: generateInvoiceDto.projectDescription,
          quantity: 1,
          unitPrice: generateInvoiceDto.hourlyRate || 100,
          taxRate: 10,
        },
      ],
      suggestedRates: {
        hourly: generateInvoiceDto.hourlyRate || 100,
      },
    };

    return {
      draft: mockDraft,
      notes: ['This is a mock AI-generated invoice draft. In a real implementation, this would use the OpenAI API.'],
    };
  }
}