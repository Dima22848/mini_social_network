import { Transform } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class PostsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number
}