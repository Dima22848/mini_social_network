import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string

  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(120)
  age?: number

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string
}