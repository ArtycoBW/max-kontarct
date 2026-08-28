import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";

import { HealthService } from "./health.service";
import { LiveHealthDto, ReadyHealthDto } from "./health.dto";

@ApiTags("health")
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  @ApiOkResponse({ type: LiveHealthDto })
  live(): LiveHealthDto {
    return this.health.live();
  }

  @Get("ready")
  @ApiOkResponse({ type: ReadyHealthDto })
  @ApiServiceUnavailableResponse({
    description: "Одна или несколько инфраструктурных зависимостей недоступны",
  })
  ready(): Promise<ReadyHealthDto> {
    return this.health.ready();
  }
}
