import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import {
  jwtAuthImports,
  jwtAuthProviders,
  signUserToken,
} from "../auth/guard/auth-testing.util";
import { MerchantRole } from "../common/enums/merchant-role.enum";

describe("UsersController – DTO validation", () => {
  let app: INestApplication;
  let module: TestingModule;

  const mockUsersService = {
    addPushToken: jest.fn().mockResolvedValue({ success: true }),
    removePushToken: jest.fn().mockResolvedValue({ success: true }),
    updatePreferences: jest.fn().mockResolvedValue({ success: true }),
    getPreferences: jest
      .fn()
      .mockResolvedValue({ pushNotificationsEnabled: true }),
  };

  const auth = (userId = "user-123") => {
    const token = signUserToken(module as any, {
      id: userId,
      merchantId: "merchant-1",
      role: MerchantRole.OWNER,
    });
    return `Bearer ${token}`;
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [UsersController],
      imports: [...jwtAuthImports],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        ...jwtAuthProviders,
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  /* ------------------------------------------------------------------ */
  /*  POST /users/push-token                                            */
  /* ------------------------------------------------------------------ */

  describe("POST /users/push-token", () => {
    const validToken = "ExponentPushToken[abc-def-123]";

    it("accepts a valid Expo push token", async () => {
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({ token: validToken })
        .expect(201);

      expect(mockUsersService.addPushToken).toHaveBeenCalledWith(
        "user-123",
        validToken,
      );
    });

    it("accepts the shorter ExpoPushToken[…] format", async () => {
      const token = "ExpoPushToken[xyz-789]";
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({ token })
        .expect(201);

      expect(mockUsersService.addPushToken).toHaveBeenCalledWith(
        "user-123",
        token,
      );
    });

    it("trims whitespace before passing to the service", async () => {
      const padded = "  ExponentPushToken[abc]  ";
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({ token: padded })
        .expect(201);

      expect(mockUsersService.addPushToken).toHaveBeenCalledWith(
        "user-123",
        padded.trim(),
      );
    });

    it("rejects a missing token field", async () => {
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({})
        .expect(400);
    });

    it("rejects an empty string token", async () => {
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({ token: "" })
        .expect(400);
    });

    it("rejects a non-string token (number)", async () => {
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({ token: 12345 })
        .expect(400);
    });

    it("rejects a malformed token (no Expo prefix)", async () => {
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({ token: "not-a-real-token" })
        .expect(400);
    });

    it("rejects a token with empty brackets", async () => {
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({ token: "ExponentPushToken[]" })
        .expect(400);
    });

    it("rejects extra unknown fields (forbidNonWhitelisted)", async () => {
      await request(app.getHttpServer())
        .post("/users/push-token")
        .set("Authorization", auth())
        .send({ token: validToken, extra: "field" })
        .expect(400);
    });

    it("rejects unauthenticated requests", async () => {
      await request(app.getHttpServer())
        .post("/users/push-token")
        .send({ token: validToken })
        .expect(401);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  DELETE /users/push-token                                          */
  /* ------------------------------------------------------------------ */

  describe("DELETE /users/push-token", () => {
    const validToken = "ExponentPushToken[abc-def-123]";

    it("accepts a valid token for removal", async () => {
      await request(app.getHttpServer())
        .delete("/users/push-token")
        .set("Authorization", auth())
        .send({ token: validToken })
        .expect(200);

      expect(mockUsersService.removePushToken).toHaveBeenCalledWith(
        "user-123",
        validToken,
      );
    });

    it("rejects a malformed token", async () => {
      await request(app.getHttpServer())
        .delete("/users/push-token")
        .set("Authorization", auth())
        .send({ token: "garbage" })
        .expect(400);
    });

    it("rejects a missing token field", async () => {
      await request(app.getHttpServer())
        .delete("/users/push-token")
        .set("Authorization", auth())
        .send({})
        .expect(400);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  PATCH /users/preferences                                          */
  /* ------------------------------------------------------------------ */

  describe("PATCH /users/preferences", () => {
    it("accepts pushNotificationsEnabled = true", async () => {
      await request(app.getHttpServer())
        .patch("/users/preferences")
        .set("Authorization", auth())
        .send({ pushNotificationsEnabled: true })
        .expect(200);

      expect(mockUsersService.updatePreferences).toHaveBeenCalledWith(
        "user-123",
        true,
      );
    });

    it("accepts pushNotificationsEnabled = false", async () => {
      await request(app.getHttpServer())
        .patch("/users/preferences")
        .set("Authorization", auth())
        .send({ pushNotificationsEnabled: false })
        .expect(200);

      expect(mockUsersService.updatePreferences).toHaveBeenCalledWith(
        "user-123",
        false,
      );
    });

    it("rejects a non-boolean value (string)", async () => {
      await request(app.getHttpServer())
        .patch("/users/preferences")
        .set("Authorization", auth())
        .send({ pushNotificationsEnabled: "yes" })
        .expect(400);
    });

    it("rejects a non-boolean value (number)", async () => {
      await request(app.getHttpServer())
        .patch("/users/preferences")
        .set("Authorization", auth())
        .send({ pushNotificationsEnabled: 1 })
        .expect(400);
    });

    it("rejects extra unknown fields", async () => {
      await request(app.getHttpServer())
        .patch("/users/preferences")
        .set("Authorization", auth())
        .send({ pushNotificationsEnabled: true, email: "hack@evil.com" })
        .expect(400);
    });

    it("returns success without calling service when body is empty", async () => {
      const res = await request(app.getHttpServer())
        .patch("/users/preferences")
        .set("Authorization", auth())
        .send({})
        .expect(200);

      expect(res.body).toEqual({ success: true });
      expect(mockUsersService.updatePreferences).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  GET /users/preferences                                            */
  /* ------------------------------------------------------------------ */

  describe("GET /users/preferences", () => {
    it("returns the user preferences", async () => {
      const res = await request(app.getHttpServer())
        .get("/users/preferences")
        .set("Authorization", auth())
        .expect(200);

      expect(res.body).toEqual({ pushNotificationsEnabled: true });
      expect(mockUsersService.getPreferences).toHaveBeenCalledWith("user-123");
    });

    it("rejects unauthenticated requests", async () => {
      await request(app.getHttpServer()).get("/users/preferences").expect(401);
    });
  });
});
