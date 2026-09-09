import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { MaxContactVerifier } from "./max-contact.verifier";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";
import { LegalDocumentsController } from "./legal-documents.controller";

@Module({
  controllers: [OnboardingController, LegalDocumentsController],
  imports: [AuthModule],
  providers: [MaxContactVerifier, OnboardingService],
})
export class OnboardingModule {}
