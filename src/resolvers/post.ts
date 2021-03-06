import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from 'type-graphql'
import { getConnection } from 'typeorm'

import { Post } from '../entities/Post'
import { isAuth } from '../middleware'
import { MyContext } from '../types'

@InputType()
class PostInput {
  @Field()
  title!: string

  @Field()
  text!: string
}

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  textSnippet(@Root() root: Post) {
    return root.text.slice(0, 50)
  }

  @Query(() => [Post])
  posts(
    @Arg('limit', () => Int) limit: number,
    @Arg('cursor', () => String, { nullable: true }) cursor: string | null
  ): Promise<Post[]> {
    const realLimit = Math.min(50, limit)

    const qb = getConnection()
      .getRepository(Post)
      .createQueryBuilder('p')
      .orderBy('"createdAt"', 'DESC')
      .take(realLimit)

    if (cursor) {
      qb.where('"createdAt" < :cursor', { cursor: new Date(Number(cursor)) })
    }

    return qb.getMany()
  }

  @Query(() => Post, { nullable: true }) // for graph type
  post(@Arg('id', () => Int) id: number): Promise<Post | undefined> {
    return Post.findOne(id)
  }

  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg('input') input: PostInput,
    @Ctx() { req }: MyContext
  ): Promise<Post> {
    return Post.create({
      ...input,
      creatorId: req.session.userId,
    }).save()
  }

  // @Mutation(() => Post, { nullable: true })
  // @UseMiddleware(isAuth)
  // async updatePost(
  //   @Arg('id') id: number,
  //   @Arg('input', () => String, { nullable: true }) input: PostInput
  // ): Promise<Post | null> {
  //   const post = await Post.findOne(id)
  //   if (!post) {
  //     return null
  //   }
  //   if (typeof title !== 'undefined') {
  //     await Post.update({ id }, { title })
  //   }

  //   return post
  // }

  @Mutation(() => Boolean)
  async deletePost(@Arg('id') id: number): Promise<boolean> {
    await Post.delete(id)
    return true
  }
}
