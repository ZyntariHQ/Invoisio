import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { RecurringBillingService } from "./recurring-billing.service";
import { CreateScheduleDto } from "./dto/create-schedule.dto";

/**
 * Recurring billing controller — lets merchants define, list, and cancel
 * recurring invoice rules for their customers.
 */
@Controller("recurring-schedules")
export class RecurringBillingController {
  constructor(
    private readonly recurringBillingService: RecurringBillingService,
  ) {}

  @Auth()
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateScheduleDto) {
    return this.recurringBillingService.createSchedule(
      user.merchantId,
      user.id,
      dto,
    );
  }

  @Auth()
  @Get()
  list(@CurrentUser() user: User) {
    return this.recurringBillingService.listSchedules(user.merchantId);
  }

  @Auth()
  @Delete(":id")
  cancel(@CurrentUser() user: User, @Param("id") id: string) {
    return this.recurringBillingService.cancelSchedule(user.merchantId, id);
  }
}
