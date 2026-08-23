import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { JwtAuthGuard } from "../auth/guard/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

describe("CustomersController", () => {
  let app: INestApplication;

  const mockCustomer = {
    id: "c1",
    name: "Acme Corp",
    email: "billing@acme.com",
  };

  const mockCustomersService = {
    findAll: jest.fn().mockResolvedValue([mockCustomer]),
    search: jest.fn().mockResolvedValue([mockCustomer]),
    getCustomerSummary: jest.fn().mockResolvedValue({
      id: "c1",
      name: "Acme Corp",
      email: "billing@acme.com",
      invoiceCount: 0,
      paidVolume: 0,
      outstandingBalance: 0,
      overdueBalance: 0,
      recentInvoices: [],
    }),
    findOne: jest.fn().mockResolvedValue(mockCustomer),
    create: jest.fn().mockResolvedValue({
      id: "c2",
      name: "New Co",
      email: "hi@newco.com",
    }),
    update: jest.fn().mockResolvedValue({ ...mockCustomer, name: "Updated" }),
    remove: jest.fn().mockResolvedValue({ id: "c1", deleted: true }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        { provide: CustomersService, useValue: mockCustomersService },
        {
          provide: PrismaService,
          useValue: {
            runWithMerchantScope: (_id: string, cb: () => unknown) => cb(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: "user-1", merchantId: "merchant-1" };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("GET /customers returns the merchant's customers", async () => {
    const res = await request(app.getHttpServer())
      .get("/customers")
      .expect(200);

    expect(res.body).toEqual([mockCustomer]);
    expect(mockCustomersService.findAll).toHaveBeenCalledWith(
      "merchant-1",
      undefined,
      50,
    );
  });

  it("GET /customers?search=acme passes the search term through", async () => {
    await request(app.getHttpServer())
      .get("/customers?search=acme")
      .expect(200);

    expect(mockCustomersService.findAll).toHaveBeenCalledWith(
      "merchant-1",
      "acme",
      50,
    );
  });

  it("GET /customers/search?q=acme hits the dedicated typeahead endpoint", async () => {
    await request(app.getHttpServer())
      .get("/customers/search?q=acme&limit=5")
      .expect(200);

    expect(mockCustomersService.search).toHaveBeenCalledWith(
      "merchant-1",
      "acme",
      5,
    );
  });

  it("GET /customers/:id/summary returns the business-metrics summary", async () => {
    const res = await request(app.getHttpServer())
      .get("/customers/c1/summary")
      .expect(200);

    expect(res.body.invoiceCount).toBe(0);
    expect(mockCustomersService.getCustomerSummary).toHaveBeenCalledWith(
      "merchant-1",
      "c1",
    );
  });

  it("GET /customers/:id returns a single customer", async () => {
    const res = await request(app.getHttpServer())
      .get("/customers/c1")
      .expect(200);

    expect(res.body).toEqual(mockCustomer);
  });

  it("POST /customers creates a new customer", async () => {
    const res = await request(app.getHttpServer())
      .post("/customers")
      .send({ name: "New Co", email: "hi@newco.com" })
      .expect(201);

    expect(res.body.name).toBe("New Co");
    expect(mockCustomersService.create).toHaveBeenCalledWith("merchant-1", {
      name: "New Co",
      email: "hi@newco.com",
    });
  });

  it("POST /customers succeeds without an email", async () => {
    await request(app.getHttpServer())
      .post("/customers")
      .send({ name: "No Email Co" })
      .expect(201);
  });

  it("POST /customers rejects a missing name", async () => {
    await request(app.getHttpServer())
      .post("/customers")
      .send({ email: "hi@newco.com" })
      .expect(400);
  });

  it("POST /customers rejects an invalid email", async () => {
    await request(app.getHttpServer())
      .post("/customers")
      .send({ name: "New Co", email: "not-an-email" })
      .expect(400);
  });

  it("PATCH /customers/:id updates a customer", async () => {
    const res = await request(app.getHttpServer())
      .patch("/customers/c1")
      .send({ name: "Updated" })
      .expect(200);

    expect(res.body.name).toBe("Updated");
    expect(mockCustomersService.update).toHaveBeenCalledWith(
      "merchant-1",
      "c1",
      { name: "Updated" },
    );
  });

  it("DELETE /customers/:id deletes a customer", async () => {
    const res = await request(app.getHttpServer())
      .delete("/customers/c1")
      .expect(200);

    expect(res.body).toEqual({ id: "c1", deleted: true });
  });
});
