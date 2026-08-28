import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../redis/redis.service";
import { STORAGE_SERVICE, type StorageService } from "../storage/storage.service";
import type { DependencyCheckDto, LiveHealthDto, ReadyHealthDto } from "./health.dto";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  live(): LiveHealthDto {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  async ready(): Promise<ReadyHealthDto> {
    const results = await Promise.all([
      this.checkDependency("postgres", () => this.prisma.ping()),
      this.checkDependency("redis", () => this.redis.ping()),
      this.checkDependency("storage", () => this.storage.checkHealth()),
    ]);
    const checks = Object.fromEntries(results) as Record<
      string,
      DependencyCheckDto
    >;
    const hasUnavailableDependency = Object.values(checks).some(
      ({ status }) => status === "down",
    );

    if (hasUnavailableDependency) {
      throw new ServiceUnavailableException({
        code: "DEPENDENCIES_UNAVAILABLE",
        details: { checks },
        message: "Сервис временно не готов",
      });
    }

    return {
      checks,
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDependency(
    name: string,
    operation: () => Promise<void>,
  ): Promise<[string, DependencyCheckDto]> {
    try {
      await operation();
      return [name, { status: "up" }];
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(`${name} readiness check failed: ${message}`);
      return [name, { status: "down" }];
    }
  }
}
