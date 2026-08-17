import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, NotFoundException, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { InvoiceEngagementController } from "./invoice-engagement.controller";
import { InvoiceEngagementService } from "./invoice-engagement.service";

describe("InvoiceEngagementController", () => {
  let app: INestApplication;

  const mockEngagementService = {
    recordEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceEngagementController],
      providers: [
        { provide: InvoiceEngagementService, useValue: mockEngagementService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("POST /invoices/:id/events accepts a view (impression) event without auth", async () => {
    await request(app.getHttpServer())
      .post("/invoices/invoice-1/events")
      .send({ type: "view" })
      .expect(202);

    expect(mockEngagementService.recordEvent).toHaveBeenCalledWith(
      "invoice-1",
      { type: "view" },
    );
  });

  it("POST /invoices/:id/events accepts a wallet_launch action event with a target", async () => {
    await request(app.getHttpServer())
      .post("/invoices/invoice-1/events")
      .send({ type: "wallet_launch", target: "payment_uri" })
      .expect(202);

    expect(mockEngagementService.recordEvent).toHaveBeenCalledWith(
      "invoice-1",
      { type: "wallet_launch", target: "payment_uri" },
    );
  });

  it("POST /invoices/:id/events accepts a copy action event with a target", async () => {
    await request(app.getHttpServer())
      .post("/invoices/invoice-1/events")
      .send({ type: "copy", target: "destination_address" })
      .expect(202);

    expect(mockEngagementService.recordEvent).toHaveBeenCalledWith(
      "invoice-1",
      { type: "copy", target: "destination_address" },
    );
  });

  it("rejects an unknown event type", async () => {
    await request(app.getHttpServer())
      .post("/invoices/invoice-1/events")
      .send({ type: "not_a_real_type" })
      .expect(400);
  });

  it("rejects a target outside the allowed list (cannot smuggle arbitrary values)", async () => {
    await request(app.getHttpServer())
      .post("/invoices/invoice-1/events")
      .send({ type: "copy", target: "some-raw-wallet-address" })
      .expect(400);
  });

  it("rejects unknown extra fields (e.g. an attempt to pass merchantId directly)", async () => {
    await request(app.getHttpServer())
      .post("/invoices/invoice-1/events")
      .send({ type: "view", merchantId: "someone-elses-merchant" })
      .expect(400);
  });

  it("propagates a 404 when the invoice does not exist", async () => {
    mockEngagementService.recordEvent.mockRejectedValueOnce(
      new NotFoundException('Invoice with ID "missing" not found'),
    );

    await request(app.getHttpServer())
      .post("/invoices/missing/events")
      .send({ type: "view" })
      .expect(404);
  });
});
