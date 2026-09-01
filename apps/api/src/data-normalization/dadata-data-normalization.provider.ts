import type { AddressSuggestion, NormalizedAddress } from "@max-contract/contracts";
import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { DataNormalizationProvider } from "./data-normalization.provider";

interface DadataSuggestion {
  [key: string]: unknown;
  data?: Record<string, unknown>;
  result?: string;
  unrestricted_value?: string;
  value?: string;
}

@Injectable()
export class DadataDataNormalizationProvider implements DataNormalizationProvider {
  private readonly apiToken: string;
  private readonly secretKey: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.apiToken = config.getOrThrow<string>("DADATA_API_TOKEN");
    this.secretKey = config.getOrThrow<string>("DADATA_SECRET_KEY");
    this.timeoutMs = config.getOrThrow<number>("DADATA_TIMEOUT_MS");
  }

  async suggestAddresses(query: string): Promise<AddressSuggestion[]> {
    const response = await this.request<{ suggestions?: DadataSuggestion[] }>(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
      { count: 8, query },
      false,
    );
    return (response.suggestions ?? [])
      .map(toSuggestion)
      .filter((item): item is AddressSuggestion => item !== null);
  }

  async normalizeAddress(address: string): Promise<NormalizedAddress> {
    const response = await this.request<DadataSuggestion[]>(
      "https://cleaner.dadata.ru/api/v1/clean/address",
      [address],
      true,
    );
    const item = response[0];
    if (!item || typeof item.result !== "string" || !item.result.trim()) {
      throw new BadGatewayException({
        code: "ADDRESS_NORMALIZATION_EMPTY",
        message: "Не удалось распознать адрес",
      });
    }
    return toNormalizedAddress(item);
  }

  private async request<T>(url: string, body: unknown, useSecret: boolean): Promise<T> {
    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: {
          Accept: "application/json",
          Authorization: `Token ${this.apiToken}`,
          "Content-Type": "application/json",
          ...(useSecret ? { "X-Secret": this.secretKey } : {}),
        },
        method: "POST",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`DaData HTTP ${response.status}`);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException({
        code: "ADDRESS_PROVIDER_UNAVAILABLE",
        message: "Сервис проверки адресов временно недоступен",
      });
    }
  }
}

function toSuggestion(item: DadataSuggestion): AddressSuggestion | null {
  if (typeof item.value !== "string" || !item.value.trim()) return null;
  const data = item.data ?? {};
  return {
    city: stringValue(data.city_with_type) ?? stringValue(data.settlement_with_type),
    fiasId: stringValue(data.fias_id),
    house: stringValue(data.house),
    postalCode: stringValue(data.postal_code),
    region: stringValue(data.region_with_type),
    street: stringValue(data.street_with_type),
    unrestrictedValue: item.unrestricted_value?.trim() || item.value.trim(),
    value: item.value.trim(),
  };
}

function toNormalizedAddress(item: DadataSuggestion): NormalizedAddress {
  return {
    city: stringValue(item.city_with_type) ?? stringValue(item.settlement_with_type),
    fiasId: stringValue(item.fias_id),
    house: stringValue(item.house),
    kladrId: stringValue(item.kladr_id),
    postalCode: stringValue(item.postal_code),
    qualityCode: stringValue(item.qc_complete),
    region: stringValue(item.region_with_type),
    source: "DADATA",
    street: stringValue(item.street_with_type),
    value: item.result?.trim() ?? "",
  };
}

function stringValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
