import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";

export const API_PREFIX = "api/v1";

function parseAllowedOrigins(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

type CorsCallback = (error: Error | null, allow?: boolean) => void;

function createCorsOriginValidator(allowedOrigins: Set<string>) {
  return (origin: string | undefined, callback: CorsCallback): void => {
    if (origin === undefined || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  };
}

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const allowedOrigins = parseAllowedOrigins(
    config.getOrThrow<string>("CORS_ORIGINS"),
  );

  app.use(helmet());
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
    }),
  );
  app.enableCors({
    credentials: true,
    origin: createCorsOriginValidator(allowedOrigins),
  });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Max-Контракт API")
    .setDescription("REST API production Mini App")
    .setVersion("1.0")
    .addCookieAuth(
      "max_contract_session",
      undefined,
      "max_contract_session",
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/docs-json",
  });
}
