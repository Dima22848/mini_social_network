import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Transform } from 'class-transformer'

export class FriendsQueryDto {
  @IsOptional()
  @IsIn(['all', 'online', 'requests'])
  tab?: 'all' | 'online' | 'requests'

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsIn(['name', 'interaction'])
  sort?: 'name' | 'interaction'

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}

export class SubscriptionsQueryDto {
  @IsOptional()
  @IsIn(['followers', 'following'])
  tab?: 'followers' | 'following'

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsIn(['new', 'active'])
  sort?: 'new' | 'active'

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
