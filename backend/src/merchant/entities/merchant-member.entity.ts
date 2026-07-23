import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

import { MerchantRole } from "../../common/enums/merchant-role.enum";

@Entity("merchant_members")
export class MerchantMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  merchantId: string;

  @Column()
  userId: string;

  @Column({
    type: "enum",
    enum: MerchantRole,
  })
  role: MerchantRole;
}
