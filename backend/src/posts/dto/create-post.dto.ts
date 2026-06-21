import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { FileAssetType } from '@prisma/client'

export class CreatePostAttachmentDto {
  @IsEnum(FileAssetType)
  type: FileAssetType

  @IsString()
  url: string

  @IsOptional()
  @IsString()
  thumbnailUrl?: string | null

  @IsOptional()
  @IsString()
  filename?: string | null

  @IsOptional()
  @IsString()
  mimeType?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50 * 1024 * 1024)
  sizeBytes?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number | null
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  content?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreatePostAttachmentDto)
  attachments?: CreatePostAttachmentDto[]
}