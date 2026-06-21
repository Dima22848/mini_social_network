import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateGroupChatDto {
  @IsString()
  @MaxLength(80)
  title!: string

  @IsOptional()
  @IsString()
  avatarUrl?: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  memberIds!: string[]
}
