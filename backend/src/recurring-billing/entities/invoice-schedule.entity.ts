import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity()
export class InvoiceSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  merchantId: string;

  @Column()
  customerId: string;

  @Column()
  amount: number;

  @Column({
    type: "enum",
    enum: ["WEEKLY", "MONTHLY"],
  })
  frequency: "WEEKLY" | "MONTHLY";

  @Column({
    nullable: true,
  })
  lastGeneratedAt: Date;

  @Column()
  nextRunDate: Date;

  @Column({
    unique: true,
  })
  cycleKey: string;

  @CreateDateColumn()
  createdAt: Date;
}
