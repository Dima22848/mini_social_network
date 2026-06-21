import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Transform } from 'class-transformer'

export class ChatsQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsIn(['all', 'nicknames', 'messages'])
  searchIn?: 'all' | 'nicknames' | 'messages'

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20
}
