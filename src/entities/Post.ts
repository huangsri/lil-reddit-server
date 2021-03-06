import { Field, ObjectType } from 'type-graphql'
import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

import { User } from './User'

@ObjectType() // transform to support graphql
@Entity()
export class Post extends BaseEntity {
  @Field() // Expose to graphql schema
  @PrimaryGeneratedColumn()
  id!: number

  @Field()
  @Column()
  title!: string

  @Field()
  @Column()
  text!: string

  @Field()
  @Column({ type: 'int', default: 0 })
  points!: number

  @Field()
  @Column()
  creatorId!: number

  @ManyToOne(() => User, (user) => user.posts)
  creator!: User

  @Field(() => String)
  @CreateDateColumn()
  createdAt!: Date

  @Field(() => String)
  @UpdateDateColumn()
  updatedAt!: Date
}
