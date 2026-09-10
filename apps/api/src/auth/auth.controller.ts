import type { AuthSessionResponse } from "@max-contract/contracts";
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { AuthService } from "./auth.service";
import type { AuthenticatedRequest, RequestWithId } from "./auth.types";
import { MaxAuthDto } from "./dto/max-auth.dto";
import { SessionAuthGuard } from "./session-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("max")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async authenticateMax(
    @Body() body: MaxAuthDto,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.auth.authenticateMax(body.initData, request.id);
    this.setSessionCookie(response, result.sessionToken);
    return result.response;
  }

  @Post("dev")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async authenticateDevelopment(
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.auth.authenticateDevelopment(request.id);
    this.setSessionCookie(response, result.sessionToken);
    return result.response;
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionAuthGuard)
  getMe(@Req() request: AuthenticatedRequest): AuthSessionResponse {
    return { user: request.auth.user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionAuthGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request.auth, request.id);
    response.clearCookie(
      this.auth.getCookieName(),
      this.auth.getClearCookieOptions(),
    );
    this.clearLegacySessionCookie(response);
  }

  private setSessionCookie(response: Response, token: string): void {
    this.clearLegacySessionCookie(response);
    response.cookie(
      this.auth.getCookieName(),
      token,
      this.auth.getCookieOptions(),
    );
  }

  private clearLegacySessionCookie(response: Response): void {
    const options = this.auth.getClearCookieOptions();
    if (options.partitioned) {
      // A new partitioned cookie must not coexist with an old unpartitioned
      // cookie of the same name (the Cookie header does not identify its jar).
      response.clearCookie(this.auth.getCookieName(), { ...options, partitioned: false });
    }
  }
}
