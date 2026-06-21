import { IsBoolean } from 'class-validator'

export class ToggleChatNotificationsDto {
  @IsBoolean()
  enabled!: boolean
}
