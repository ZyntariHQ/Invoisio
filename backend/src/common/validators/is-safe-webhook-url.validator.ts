import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { isLoopbackLiteral } from "../security/ip-range-blocklist";

/**
 * Structural (non-DNS) validation for webhook URLs:
 *   - must be a valid absolute URL
 *   - no embedded credentials (user:pass@host)
 *   - scheme must be https, UNLESS the target is localhost/loopback AND
 *     `app.allowLocalWebhooks` is enabled, in which case http is permitted
 *
 * This is a NestJS-DI-aware class-validator constraint so it can consult
 * `ConfigService` for the local-dev escape hatch. For DI to work here,
 * `useContainer(app, { fallbackOnErrors: true })` must be called once in
 * `main.ts` after creating the Nest application - without it this
 * constraint safely fails closed (rejects http entirely) rather than
 * silently allowing it.
 *
 * DNS resolution and IP-range checks are NOT performed here (they're
 * async and must happen again at delivery time regardless) - see
 * `SsrfProtectionService.assertSafeForWrite`, called from
 * `MerchantsService` before persisting.
 */
@ValidatorConstraint({ name: "isSafeWebhookUrl", async: false })
@Injectable()
export class IsSafeWebhookUrlConstraint implements ValidatorConstraintInterface {
  constructor(private readonly configService?: ConfigService) {}

  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== "string") return false;

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }

    if (url.username || url.password) return false;
    if (!url.hostname) return false;

    const allowLocalWebhooks =
      this.configService?.get<boolean>("app.allowLocalWebhooks", false) ??
      false;
    const isLocalTarget = isLoopbackLiteral(url.hostname);

    if (url.protocol === "https:") {
      return !(isLocalTarget && !allowLocalWebhooks);
    }

    if (url.protocol !== "http:") return false;

    // Plain http is only ever permitted for the explicit local-dev case.
    return allowLocalWebhooks && isLocalTarget;
  }

  defaultMessage(_args: ValidationArguments): string {
    return (
      "webhookUrl must be a valid https:// URL with no embedded " +
      "credentials (plain http is only permitted for localhost in " +
      "local development)."
    );
  }
}

export function IsSafeWebhookUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isSafeWebhookUrl",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsSafeWebhookUrlConstraint,
    });
  };
}
