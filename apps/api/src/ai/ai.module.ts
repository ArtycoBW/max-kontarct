import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AI_PROVIDER, type AiProvider } from "./ai-provider";
import { AiOutputValidator } from "./ai-output.validator";
import { AiService } from "./ai.service";
import { FakeAiProvider } from "./fake-ai.provider";
import { PiiRedactor } from "./pii-redactor";
import { YANDEX_AI_FETCH, YandexAiProvider } from "./yandex-ai.provider";

@Global()
@Module({
  exports: [AI_PROVIDER, AiService],
  providers: [
    AiOutputValidator,
    AiService,
    FakeAiProvider,
    PiiRedactor,
    YandexAiProvider,
    {
      provide: YANDEX_AI_FETCH,
      useValue: globalThis.fetch.bind(globalThis),
    },
    {
      inject: [ConfigService, FakeAiProvider, YandexAiProvider],
      provide: AI_PROVIDER,
      useFactory: (
        config: ConfigService,
        fakeProvider: FakeAiProvider,
        yandexProvider: YandexAiProvider,
      ): AiProvider =>
        config.getOrThrow<string>("AI_PROVIDER") === "yandex"
          ? yandexProvider
          : fakeProvider,
    },
  ],
})
export class AiModule {}
