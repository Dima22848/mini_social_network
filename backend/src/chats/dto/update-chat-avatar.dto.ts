import { IsOptional, IsString } from 'class-validator'

export class UpdateChatAvatarDto {
  @IsOptional()
  @IsString()
  avatarUrl?: string | null
}
