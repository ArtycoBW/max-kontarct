import type {
  MaxContactRequest,
  OnboardingStateResponse,
  RecordConsentsRequest,
} from "@max-contract/contracts";
import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { MaxContactDto } from "./dto/max-contact.dto";
import { RecordConsentsDto } from "./dto/record-consents.dto";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
@UseGuards(SessionAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  getState(
    @Req() request: AuthenticatedRequest,
  ): Promise<OnboardingStateResponse> {
    return this.onboarding.getState(request.auth.user.id);
  }

  @Post("consents")
  recordConsents(
    @Body() body: RecordConsentsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OnboardingStateResponse> {
    return this.onboarding.recordConsents(
      request.auth.user.id,
      body satisfies RecordConsentsRequest,
      request.id,
    );
  }

  @Post("phone/max")
  verifyMaxPhone(
    @Body() body: MaxContactDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OnboardingStateResponse> {
    return this.onboarding.verifyMaxPhone(
      request.auth.user,
      body satisfies MaxContactRequest,
      request.id,
    );
  }

  @Post("phone/dev")
  verifyDevelopmentPhone(
    @Req() request: AuthenticatedRequest,
  ): Promise<OnboardingStateResponse> {
    return this.onboarding.verifyDevelopmentPhone(
      request.auth.user.id,
      request.id,
    );
  }
}
