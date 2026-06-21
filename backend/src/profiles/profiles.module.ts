import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { TokenService } from 'src/auth/token.service';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [PresenceModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, TokenService],
})
export class ProfilesModule {}
