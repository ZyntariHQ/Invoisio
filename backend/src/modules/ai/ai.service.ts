import { Injectable, BadRequestException } from '@nestjs/common';
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
    const prompt = `You are an assistant that outputs ONLY JSON for an invoice draft. Fields: clientName, clientEmail (optional), currency (3-letter), items (array of {description, quantity, unitPrice, taxRate(optional)}). Use reasonable defaults if missing. Return strict JSON, no markdown fences.`;
    const userInput = `Client info: ${generateInvoiceDto.clientInfo || ''}\nProject: ${generateInvoiceDto.projectDescription || ''}\nHourly rate: ${generateInvoiceDto.hourlyRate || ''}`;

    const resp = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userInput },
      ],
      temperature: 0.2,
    });

    const content = resp.choices?.[0]?.message?.content?.trim();
    if (!content) throw new BadRequestException('Empty AI response');

    let draft: any;
    try {
      draft = JSON.parse(content);
    } catch {
      // Try to extract JSON blob
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new BadRequestException('AI response not JSON');
      draft = JSON.parse(match[0]);
    }

    // Basic normalization
    if (!Array.isArray(draft.items)) draft.items = [];
    draft.items = draft.items.map((i: any) => ({
      description: String(i.description || 'Item'),
      quantity: Number(i.quantity || 1),
      unitPrice: Number(i.unitPrice || generateInvoiceDto.hourlyRate || 100),
      taxRate: i.taxRate !== undefined ? Number(i.taxRate) : undefined,
    }));

    return { draft, notes: [] };
  }
}