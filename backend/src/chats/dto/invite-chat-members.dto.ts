import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator'

export class InviteChatMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  memberIds!: string[]
}
