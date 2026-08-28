import type {
  UpdateUserProfileRequest,
  UserProfileResponse,
} from "@max-contract/contracts";
import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfileService } from "./profile.service";

@Controller("profile")
@UseGuards(SessionAuthGuard)
@ApiTags("profile")
@ApiCookieAuth("max_contract_session")
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOperation({ summary: "Получить профиль текущего физлица" })
  @ApiOkResponse({ description: "Профиль и подтверждённый контакт" })
  getProfile(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserProfileResponse> {
    return this.profiles.getProfile(request.auth.user.id);
  }

  @Patch()
  @ApiOperation({ summary: "Сохранить профиль текущего физлица" })
  @ApiOkResponse({ description: "Обновлённый профиль" })
  updateProfile(
    @Body() body: UpdateProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserProfileResponse> {
    return this.profiles.updateProfile(
      request.auth.user.id,
      body satisfies UpdateUserProfileRequest,
      request.id,
    );
  }
}
