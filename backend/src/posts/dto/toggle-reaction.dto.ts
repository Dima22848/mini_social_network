import { IsEnum } from 'class-validator'
import { ReactionType } from '@prisma/client'

export class ToggleReactionDto {
  @IsEnum(ReactionType)
  type: ReactionType
}