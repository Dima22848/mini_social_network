import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PasswordService } from './password.service'
import { TokenService } from './token.service'
import { AccessTokenGuard } from './guards/access-token.guard'

@Module({
  controllers: [AuthController],
  providers: [
    AuthService, 
    PasswordService, 
    TokenService,
    AccessTokenGuard,
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}