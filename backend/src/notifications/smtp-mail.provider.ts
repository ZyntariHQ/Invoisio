import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import {
  MailProvider,
  MailSendResult,
  SendMailInput,
} from "./mail-provider.interface";

export class SmtpMailProvider implements MailProvider {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from =
      this.configService.get<string>("EMAIL_FROM") ||
      "Invoisio <no-reply@invoisio.app>";

    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>("SMTP_HOST"),
      port: Number(this.configService.get<string | number>("SMTP_PORT") ?? 587),
      secure:
        String(
          this.configService.get<string | boolean>("SMTP_SECURE") ?? "false",
        ) === "true",
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(input: SendMailInput): Promise<MailSendResult> {
    const result = await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return {
      messageId: result.messageId,
      accepted: result.accepted as string[],
      rejected: result.rejected as string[],
    };
  }
}
