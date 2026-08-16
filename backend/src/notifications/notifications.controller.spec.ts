import { Test, TestingModule } from "@nestjs/testing";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { MerchantRole } from "../common/enums/merchant-role.enum";
import { NotificationPreferencesDto } from "./dto/notification-preferences.dto";

describe("NotificationsController", () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;

  const currentUser = {
    id: "user-1",
    merchantId: "merchant-1",
    role: MerchantRole.OWNER,
    publicKey: "GACN3...",
    tokenVersion: 1,
    isAdmin: false,
    pushNotificationsEnabled: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            getNotificationPreferences: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get(
      NotificationsService,
    ) as jest.Mocked<NotificationsService>;
  });

  it("is defined", () => {
    expect(controller).toBeDefined();
  });

  it("delegates to service passing current user's id and merchantId", async () => {
    const expected: NotificationPreferencesDto = {
      pushNotificationsEnabled: true,
      registeredPushTokensCount: 2,
      preferenceExplicit: true,
      contractVersion: "1.0.0",
    };
    service.getNotificationPreferences.mockResolvedValue(expected);

    const result = await controller.getPreferences(currentUser as any);

    expect(result).toBe(expected);
    expect(service.getNotificationPreferences).toHaveBeenCalledWith(
      "user-1",
      "merchant-1",
    );
    expect(service.getNotificationPreferences).toHaveBeenCalledTimes(1);
  });
});
