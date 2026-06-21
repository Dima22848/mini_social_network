import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class AttachmentDto {
  @IsIn(['IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'ARCHIVE'])
  type!: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'ARCHIVE'

  @IsString()
  url!: string

  @IsOptional()
  @IsString()
  thumbnailUrl?: string

  @IsOptional()
  @IsString()
  filename?: string

  @IsOptional()
  @IsString()
  mimeType?: string

  @IsOptional()
  @IsInt()
  sizeBytes?: number

  @IsOptional()
  @IsInt()
  width?: number

  @IsOptional()
  @IsInt()
  height?: number

  @IsOptional()
  @IsInt()
  duration?: number
}

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string

  @IsOptional()
  @IsString()
  parentId?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[]
}
