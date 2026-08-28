import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  controllers: [ProfileController],
  imports: [AuthModule],
  providers: [ProfileService],
})
export class ProfileModule {}
