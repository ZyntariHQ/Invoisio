import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NotificationsService } from "./notifications.service";
import { PrismaModule } from "../prisma/prisma.module";
import { ConsoleMailProvider } from "./console-mail.provider";
import { MAIL_PROVIDER } from "./mail-provider.interface";
import { SmtpMailProvider } from "./smtp-mail.provider";

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    NotificationsService,
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>("EMAIL_PROVIDER", "console");
        return provider === "smtp"
          ? new SmtpMailProvider(configService)
          : new ConsoleMailProvider();
      },
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
