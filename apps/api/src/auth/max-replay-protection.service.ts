import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";

import { RedisService } from "../redis/redis.service";

@Injectable()
export class MaxReplayProtectionService {
  private readonly prefix: string;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.prefix = config.getOrThrow<string>("AUTH_REDIS_PREFIX");
  }

  async claim(
    queryId: string,
    expiresAt: number,
    nowSeconds = Math.floor(Date.now() / 1_000),
  ): Promise<void> {
    const ttlSeconds = Math.max(1, expiresAt - nowSeconds);
    const claimed = await this.redis.setIfAbsent(
      this.key(queryId),
      "1",
      ttlSeconds,
    );

    if (!claimed) {
      throw new UnauthorizedException({
        code: "MAX_INIT_DATA_REPLAYED",
        message: "Данные запуска MAX уже использованы",
      });
    }
  }

  async release(queryId: string): Promise<void> {
    await this.redis.delete(this.key(queryId));
  }

  private key(queryId: string): string {
    const digest = createHash("sha256").update(queryId, "utf8").digest("hex");
    return `${this.prefix}:replay:${digest}`;
  }
}
