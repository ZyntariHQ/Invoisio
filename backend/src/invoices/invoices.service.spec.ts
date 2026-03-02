import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { ConfigService } from '@nestjs/config';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

describe('InvoicesService', () => {
  let service: InvoicesService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'stellar') {
        return {
          merchantPublicKey: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          memoPrefix: 'invoisio-',
        };
      }
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of invoices', () => {
      const result = service.findAll();
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(3); // Sample invoices seeded
    });

    it('should return invoices with required fields', () => {
      const result = service.findAll();
      
      if (result.length > 0) {
        const invoice = result[0];
        expect(invoice).toHaveProperty('id');
        expect(invoice).toHaveProperty('invoiceNumber');
        expect(invoice).toHaveProperty('clientName');
        expect(invoice).toHaveProperty('amount');
        expect(invoice).toHaveProperty('asset');
        expect(invoice).toHaveProperty('memo');
        expect(invoice).toHaveProperty('status');
      }
    });
  });

  describe('findOne', () => {
    it('should return a single invoice by id', () => {
      const allInvoices = service.findAll();
      const firstInvoice = allInvoices[0];
      
      const result = service.findOne(firstInvoice.id);
      
      expect(result).toBeDefined();
      expect(result.id).toBe(firstInvoice.id);
    });

    it('should throw NotFoundException for non-existent invoice', () => {
      expect(() => service.findOne('non-existent-id')).toThrow();
    });
  });

  describe('create', () => {
    it('should create a new invoice', () => {
      const dto: CreateInvoiceDto = {
        invoiceNumber: 'INV-TEST-001',
        clientName: 'Test Client',
        clientEmail: 'test@example.com',
        description: 'Test invoice',
        amount: 100.00,
        asset: 'USDC',
      };

      const result = service.create(dto);

      expect(result).toBeDefined();
      expect(result.invoiceNumber).toBe(dto.invoiceNumber);
      expect(result.clientName).toBe(dto.clientName);
      expect(result.amount).toBe(dto.amount);
      expect(result.asset).toBe(dto.asset);
      expect(result.status).toBe('pending');
      expect(result.memo).toContain('invoisio-');
    });

    it('should add created invoice to the list', () => {
      const initialCount = service.findAll().length;
      
      const dto: CreateInvoiceDto = {
        invoiceNumber: 'INV-TEST-002',
        clientName: 'Another Client',
        clientEmail: 'another@example.com',
        amount: 250.00,
        asset: 'XLM',
      };

      service.create(dto);
      const newCount = service.findAll().length;

      expect(newCount).toBe(initialCount + 1);
    });
  });

  describe('updateStatus', () => {
    it('should update invoice status', () => {
      const allInvoices = service.findAll();
      const invoice = allInvoices[0];
      const originalStatus = invoice.status;
      
      const newStatus = originalStatus === 'pending' ? 'paid' : 'pending';
      const result = service.updateStatus(invoice.id, newStatus);
      
      expect(result.status).toBe(newStatus);
    });
  });

  describe('findByMemo', () => {
    it('should find invoice by memo', () => {
      const allInvoices = service.findAll();
      const invoice = allInvoices[0];
      
      const result = service.findByMemo(invoice.memo);
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(invoice.id);
    });

    it('should return undefined for non-existent memo', () => {
      const result = service.findByMemo('invoisio-nonexistent');
      
      expect(result).toBeUndefined();
    });
  });
});
