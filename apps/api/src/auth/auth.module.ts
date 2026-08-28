import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MaxInitDataVerifier } from "./max-init-data.verifier";
import { MaxReplayProtectionService } from "./max-replay-protection.service";
import { SessionAuthGuard } from "./session-auth.guard";

@Module({
  controllers: [AuthController],
  exports: [AuthService, SessionAuthGuard],
  providers: [
    AuthService,
    MaxInitDataVerifier,
    MaxReplayProtectionService,
    SessionAuthGuard,
  ],
})
export class AuthModule {}
