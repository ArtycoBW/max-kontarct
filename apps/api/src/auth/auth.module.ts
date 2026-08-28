import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MaxInitDataVerifier } from "./max-init-data.verifier";
import { MaxReplayProtectionService } from "./max-replay-protection.service";
import { RolesGuard } from "./roles.guard";
import { SessionAuthGuard } from "./session-auth.guard";

@Module({
  controllers: [AuthController],
  exports: [AuthService, RolesGuard, SessionAuthGuard],
  providers: [
    AuthService,
    MaxInitDataVerifier,
    MaxReplayProtectionService,
    RolesGuard,
    SessionAuthGuard,
  ],
})
export class AuthModule {}
