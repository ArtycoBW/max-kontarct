import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AuthModule } from "../auth/auth.module";
import { DadataDataNormalizationProvider } from "./dadata-data-normalization.provider";
import { DataNormalizationController } from "./data-normalization.controller";
import { DATA_NORMALIZATION_PROVIDER } from "./data-normalization.provider";
import { DataNormalizationService } from "./data-normalization.service";
import { FakeDataNormalizationProvider } from "./fake-data-normalization.provider";

@Module({
  controllers: [DataNormalizationController],
  exports: [DATA_NORMALIZATION_PROVIDER, DataNormalizationService],
  imports: [AuthModule],
  providers: [
    DataNormalizationService,
    {
      inject: [ConfigService],
      provide: DATA_NORMALIZATION_PROVIDER,
      useFactory: (config: ConfigService) =>
        config.getOrThrow<string>("DATA_NORMALIZATION_PROVIDER") === "dadata"
          ? new DadataDataNormalizationProvider(config)
          : new FakeDataNormalizationProvider(),
    },
  ],
})
export class DataNormalizationModule {}
