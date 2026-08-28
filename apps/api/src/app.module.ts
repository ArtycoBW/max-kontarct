import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter";
import { createLoggerParams } from "./common/logging/logger.config";
import { validateEnvironment } from "./config/environment";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { ProfileModule } from "./profile/profile.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";
import { TemplatesModule } from "./templates/templates.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [".env.local", ".env"],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createLoggerParams,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          limit: config.getOrThrow<number>("THROTTLE_LIMIT"),
          ttl: config.getOrThrow<number>("THROTTLE_TTL_MS"),
        },
      ],
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    HealthModule,
    AuthModule,
    OnboardingModule,
    ProfileModule,
    AdminModule,
    TemplatesModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
