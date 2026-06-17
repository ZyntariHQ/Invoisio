import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";

import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MerchantMember } from "../../merchant/entities/merchant-member.entity";

@Injectable()
export class MerchantMembershipGuard implements CanActivate {
  constructor(
    @InjectRepository(MerchantMember)
    private readonly merchantMemberRepo: Repository<MerchantMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const userId = request.user.id;
    const merchantId = request.params.merchantId;

    const membership = await this.merchantMemberRepo.findOne({
      where: {
        userId,
        merchantId,
      },
    });

    if (!membership) {
      throw new ForbiddenException("Not a member of merchant");
    }

    request.membership = membership;

    return true;
  }
}
