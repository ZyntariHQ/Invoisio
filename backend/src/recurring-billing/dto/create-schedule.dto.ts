import { IsEnum, IsNumber, IsString } from "class-validator";

export class CreateScheduleDto {
  @IsString()
  merchantId: string;

  @IsString()
  customerId: string;

  @IsNumber()
  amount: number;

  @IsEnum(["WEEKLY", "MONTHLY"])
  frequency: string;
}
