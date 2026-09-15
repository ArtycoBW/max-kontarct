import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DealMessagesService } from "./deal-messages.service";

class MessageQuery {
  @IsOptional() @IsUUID() before?: string;
}
class SendMessageDto {
  @IsUUID() clientId!: string;
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
  @IsIn(["MESSAGE", "CHANGE_REQUEST"]) kind!: "MESSAGE" | "CHANGE_REQUEST";
}

@Controller("deals/:dealId/messages")
@UseGuards(SessionAuthGuard)
export class DealMessagesController {
  constructor(private readonly messages: DealMessagesService) {}
  @Get()
  list(@Param("dealId", new ParseUUIDPipe()) dealId: string, @Query() query: MessageQuery, @Req() request: AuthenticatedRequest) {
    return this.messages.list(dealId, request.auth.user.id, query.before);
  }
  @Post()
  send(@Param("dealId", new ParseUUIDPipe()) dealId: string, @Body() body: SendMessageDto, @Req() request: AuthenticatedRequest) {
    return this.messages.send(dealId, request.auth.user.id, body);
  }
}
