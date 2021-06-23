import {
  Arg,
  Ctx,
  Field,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from 'type-graphql'
import argon2 from 'argon2'

import { MyContext } from '../types'
import { User } from '../entities/User'
import { COOKIE_NAME, FORGET_PASSWORD_PREFIX } from '../constants'
import { UsernamePasswordInput } from './UsernamePasswordInput'
import { validateRegister } from '../utils/validateRegister'
import { sendEmail } from '../utils/sendEmail'
import { v4 } from 'uuid'
import { getConnection } from 'typeorm'

@ObjectType()
class FieldError {
  @Field()
  field!: string

  @Field()
  message!: string
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[]

  @Field(() => User, { nullable: true })
  user?: User
}

@Resolver()
export class UserResolver {
  @Mutation(() => UserResponse)
  async changePassword(
    @Arg('token') token: string,
    @Arg('newPassword') newPassword: string,
    @Ctx() { redis, req }: MyContext
  ): Promise<UserResponse> {
    if (newPassword.length <= 2) {
      return {
        errors: [
          {
            field: 'newPassword',
            message: 'too short (greater than 2)',
          },
        ],
      }
    }

    const key = FORGET_PASSWORD_PREFIX + token
    const userId = await redis.get(key)
    if (!userId) {
      return {
        errors: [
          {
            field: 'token',
            message: 'token expired',
          },
        ],
      }
    }

    const userIdNum = Number(userId)
    const user = await User.findOne(userIdNum)
    if (!user) {
      return {
        errors: [
          {
            field: 'token',
            message: 'user no longer exists',
          },
        ],
      }
    }

    await User.update(
      { id: userIdNum },
      { password: await argon2.hash(newPassword) }
    )
    await redis.del(key)

    // login user after change password
    req.session.userId = user.id

    return { user }
  }

  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg('email') email: string,
    @Ctx() { redis }: MyContext
  ) {
    const user = await User.findOne({ where: { email } })
    if (!user) {
      // no email

      return true
    }

    const token = v4()
    await redis.set(
      FORGET_PASSWORD_PREFIX + token,
      user.id,
      'ex',
      1000 * 60 * 60 * 24
    )

    await sendEmail(
      email,
      `<a href="http://localhost:3000/change-password/${token}">reset password</a>`
    )

    return true
  }

  @Query(() => User, { nullable: true })
  me(@Ctx() { req }: MyContext) {
    // you are not login
    if (!req.session.userId) {
      return null
    }

    return User.findOne(req.session.userId)
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg('options') options: UsernamePasswordInput,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options)
    if (errors) {
      return { errors }
    }

    const hashedPassword = await argon2.hash(options.password)
    let user
    try {
      const result = await getConnection()
        .createQueryBuilder()
        .insert()
        .into(User)
        .values({
          email: options.email,
          username: options.username,
          password: hashedPassword,
        })
        .returning('*')
        .execute()

      user = result.raw[0]
    } catch (error) {
      if (error.code === '23505' || error.detail.includes('already exists')) {
        return {
          errors: [
            {
              field: 'username',
              message: 'already taken',
            },
          ],
        }
      }
    }

    req.session.userId = user.id

    return { user: user }
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg('usernameOrEmail') usernameOrEmail: string,
    @Arg('password') password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const user = await User.findOne({
      where: usernameOrEmail.includes('@')
        ? { email: usernameOrEmail }
        : { username: usernameOrEmail },
    })

    if (!user) {
      return {
        errors: [{ field: 'usernameOrEmail', message: "doesn't exist" }],
      }
    }

    const valid = await argon2.verify(user.password, password)
    if (!valid) {
      return {
        errors: [{ field: 'password', message: 'incorrect' }],
      }
    }

    req.session.userId = user.id

    return { user }
  }

  @Mutation(() => Boolean)
  async logout(@Ctx() { req, res }: MyContext): Promise<boolean> {
    return new Promise((resolve) =>
      req.session.destroy((err) => {
        res.clearCookie(COOKIE_NAME)

        if (err) {
          console.log(err)
          return resolve(false)
        }

        resolve(true)
      })
    )
  }
}
