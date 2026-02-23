import { Injectable } from '@nestjs/common';
import { OpenAI } from 'openai';
import { ConfigService } from '@nestjs/config';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';

@Injectable()
export class AiService {
  private openai: OpenAI;
  private model: string;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
    this.model = this.configService.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async generateInvoice(generateInvoiceDto: GenerateInvoiceDto) {
    const system = 'You create concise invoice drafts. Output strict JSON.';
    const guidance = {
      draft: {
        clientName: generateInvoiceDto.clientInfo || 'Client',
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
      },
      notes: [
        'Adjust quantities and unit price based on scope.',
      ],
    };

    const userPrompt = `Project: ${generateInvoiceDto.projectDescription}\nClient: ${generateInvoiceDto.clientInfo ?? 'N/A'}\nHourly: ${generateInvoiceDto.hourlyRate ?? 'N/A'}\nReturn JSON with keys draft and notes. Use reasonable defaults, ensure numeric fields.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      });

      const content = completion.choices?.[0]?.message?.content?.trim() || '';
      if (!content) {
        return guidance;
      }
      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch {
        return guidance;
      }
    } catch {
      return guidance;
    }
  }
}