import { Logger } from "@nestjs/common";
import {
  MailProvider,
  MailSendResult,
  SendMailInput,
} from "./mail-provider.interface";

export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger(ConsoleMailProvider.name);

  async send(input: SendMailInput): Promise<MailSendResult> {
    this.logger.log(
      `Email mock send: to=${input.to}, subject="${input.subject}"`,
    );

    return {
      messageId: `console-${Date.now()}`,
      accepted: [input.to],
      rejected: [],
    };
  }
}
