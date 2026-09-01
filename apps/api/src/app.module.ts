import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { AdminModule } from "./admin/admin.module";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter";
import { createLoggerParams } from "./common/logging/logger.config";
import { validateEnvironment } from "./config/environment";
import { PrismaModule } from "./database/prisma.module";
import { DataNormalizationModule } from "./data-normalization/data-normalization.module";
import { DealsModule } from "./deals/deals.module";
import { HealthModule } from "./health/health.module";
import { FilesModule } from "./files/files.module";
import { MaxBotModule } from "./max-bot/max-bot.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { ProfileModule } from "./profile/profile.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";
import { SigningModule } from "./signing/signing.module";
import { TemplatesModule } from "./templates/templates.module";
import { TrustModule } from "./trust/trust.module";

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
    DataNormalizationModule,
    DealsModule,
    FilesModule,
    RedisModule,
    StorageModule,
    SigningModule,
    AiModule,
    HealthModule,
    AuthModule,
    MaxBotModule,
    OnboardingModule,
    ProfileModule,
    AdminModule,
    TemplatesModule,
    TrustModule,
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
