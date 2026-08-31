"use client";

import { CircleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  QuestionnaireDefinition,
  QuestionnaireField,
  QuestionnaireFieldType,
  QuestionnaireRule,
} from "@/lib/validation/questionnaire-answers";

export function TemplateQuestionnaire({
  answers,
  definition,
  errors,
  onChange,
}: {
  answers: Record<string, unknown>;
  definition: QuestionnaireDefinition;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="questionnaire-fields">
      {definition.fields.map((field) => (
        <QuestionnaireFieldControl
          answers={answers}
          definition={definition}
          error={errors[field.key]}
          field={field}
          key={field.key}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function QuestionnaireFieldControl({
  answers,
  definition,
  error,
  field,
  onChange,
}: {
  answers: Record<string, unknown>;
  definition: QuestionnaireDefinition;
  error?: string;
  field: QuestionnaireField;
  onChange: (key: string, value: unknown) => void;
}) {
  const errorId = `${field.key}-error`;
  const labelId = `${field.key}-label`;
  const value = answers[field.key];
  const label = (
    <>
      {field.title}
      {isFieldRequired(field, definition, answers) ? (
        <span aria-hidden="true"> *</span>
      ) : null}
    </>
  );

  if (field.type === "boolean") {
    return (
      <Card className="questionnaire-switch">
        <span>
          <strong id={labelId}>{label}</strong>
          {field.description ? <small>{field.description}</small> : null}
        </span>
        <Switch
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-labelledby={labelId}
          checked={value === true}
          onCheckedChange={(checked) => onChange(field.key, checked)}
        />
        <FieldError id={errorId} message={error} />
      </Card>
    );
  }

  if (field.enum) {
    return (
      <div className="form-field">
        <label htmlFor={field.key} id={labelId}>{label}</label>
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(nextValue) => onChange(field.key, nextValue)}
        >
          <SelectTrigger
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            aria-labelledby={labelId}
          >
            <SelectValue placeholder="Выберите значение" />
          </SelectTrigger>
          <SelectContent position="popper">
            {field.enum.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription text={field.description} />
        <FieldError id={errorId} message={error} />
      </div>
    );
  }

  if (field.type === "string" && field.format === "date") {
    const boundaries = getDateBoundaries(definition.rules, answers, field.key);
    return (
      <div className="form-field">
        <label htmlFor={field.key} id={labelId}>{label}</label>
        <DatePicker
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          allowFuture
          fromYear={new Date().getFullYear() - 20}
          id={field.key}
          maximumValue={boundaries.maximumValue}
          minimumValue={boundaries.minimumValue}
          onChange={(nextValue) => onChange(field.key, nextValue)}
          toYear={new Date().getFullYear() + 20}
          value={typeof value === "string" ? value : ""}
        />
        <FieldDescription text={field.description} />
        <FieldError id={errorId} message={error} />
      </div>
    );
  }

  if (field.type === "string" && (field.maxLength ?? 0) >= 160) {
    const stringValue = typeof value === "string" ? value : "";
    return (
      <div className="form-field">
        <label htmlFor={field.key}>{label}</label>
        <Textarea
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          id={field.key}
          maxLength={field.maxLength}
          onChange={(event) => onChange(field.key, event.target.value)}
          value={stringValue}
        />
        {field.maxLength ? (
          <span className="field-meta">
            {stringValue.length}/{field.maxLength}
          </span>
        ) : null}
        <FieldDescription text={field.description} />
        <FieldError id={errorId} message={error} />
      </div>
    );
  }

  const isNumber = field.type === "number" || field.type === "integer";
  return (
    <div className="form-field">
      <label htmlFor={field.key}>{label}</label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        data-number-input={isNumber ? "true" : undefined}
        id={field.key}
        inputMode={
          field.type === "integer" ? "numeric" : isNumber ? "decimal" : undefined
        }
        maxLength={field.maxLength}
        minLength={field.minLength}
        onChange={(event) => onChange(field.key, event.target.value)}
        type={field.format === "email" ? "email" : "text"}
        value={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
      />
      <FieldDescription text={field.description} />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function FieldDescription({ text }: { text?: string }) {
  return text ? <span className="field-description">{text}</span> : null;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id} role="alert">
      <CircleAlert size={13} /> {message}
    </span>
  ) : null;
}

export function parseQuestionnaireSchema(
  schema: Record<string, unknown>,
): QuestionnaireDefinition | null {
  if (schema.type !== "object" || !isRecord(schema.properties)) {
    return null;
  }

  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === "string")
      : [],
  );
  const fieldsByKey = new Map<string, QuestionnaireField>();

  for (const [key, rawField] of Object.entries(schema.properties)) {
    if (
      !isRecord(rawField) ||
      !isFieldType(rawField.type) ||
      typeof rawField.title !== "string"
    ) {
      return null;
    }
    const enumValues = Array.isArray(rawField.enum)
      ? rawField.enum.filter((value): value is string => typeof value === "string")
      : undefined;

    fieldsByKey.set(key, {
      description:
        typeof rawField.description === "string" ? rawField.description : undefined,
      enum: enumValues,
      format: typeof rawField.format === "string" ? rawField.format : undefined,
      key,
      maxLength: numberKeyword(rawField.maxLength),
      maximum: numberKeyword(rawField.maximum),
      minLength: numberKeyword(rawField.minLength),
      minimum: numberKeyword(rawField.minimum),
      pattern: typeof rawField.pattern === "string" ? rawField.pattern : undefined,
      required: required.has(key),
      title: rawField.title,
      type: rawField.type,
    });
  }

  const fieldOrder = parseFieldOrder(schema["x-fieldOrder"], fieldsByKey);
  const rules = parseRules(schema["x-rules"], fieldsByKey);

  return {
    fields: fieldOrder.map((key) => fieldsByKey.get(key)!),
    rules,
    title: typeof schema.title === "string" ? schema.title : null,
  };
}

function parseFieldOrder(
  rawOrder: unknown,
  fields: Map<string, QuestionnaireField>,
): string[] {
  if (!Array.isArray(rawOrder)) return [...fields.keys()];
  const ordered = rawOrder.filter(
    (key): key is string => typeof key === "string" && fields.has(key),
  );
  const unique = [...new Set(ordered)];
  return unique.length === fields.size ? unique : [...fields.keys()];
}

function parseRules(
  rawRules: unknown,
  fields: Map<string, QuestionnaireField>,
): QuestionnaireDefinition["rules"] {
  if (!Array.isArray(rawRules)) return [];
  const rules: QuestionnaireRule[] = [];
  for (const rule of rawRules) {
    if (!isRecord(rule) || typeof rule.kind !== "string") continue;
    if (
      rule.kind === "dateOrder" &&
      typeof rule.startField === "string" &&
      typeof rule.endField === "string" &&
      fields.has(rule.startField) &&
      fields.has(rule.endField)
    ) {
      rules.push({
        endField: rule.endField,
        kind: "dateOrder",
        message: typeof rule.message === "string" ? rule.message : undefined,
        startField: rule.startField,
      });
      continue;
    }
    if (
      rule.kind === "requiredWhen" &&
      typeof rule.field === "string" &&
      typeof rule.dependsOn === "string" &&
      fields.has(rule.field) &&
      fields.has(rule.dependsOn) &&
      ["boolean", "number", "string"].includes(typeof rule.equals)
    ) {
      rules.push({
        dependsOn: rule.dependsOn,
        equals: rule.equals as boolean | number | string,
        field: rule.field,
        kind: "requiredWhen",
        message: typeof rule.message === "string" ? rule.message : undefined,
      });
    }
  }
  return rules;
}

function getDateBoundaries(
  rules: QuestionnaireDefinition["rules"],
  answers: Record<string, unknown>,
  fieldKey: string,
): { maximumValue?: string; minimumValue?: string } {
  const today = toLocalDateOnly(new Date());
  const result: { maximumValue?: string; minimumValue?: string } = {
    minimumValue: today,
  };
  for (const rule of rules) {
    if (rule.kind !== "dateOrder") continue;
    const startValue = answers[rule.startField];
    const endValue = answers[rule.endField];
    if (rule.endField === fieldKey && typeof startValue === "string") {
      result.minimumValue = startValue > today ? startValue : today;
    }
    if (
      rule.startField === fieldKey &&
      typeof endValue === "string" &&
      endValue >= today
    ) {
      result.maximumValue = endValue;
    }
  }
  return result;
}

function toLocalDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isFieldRequired(
  field: QuestionnaireField,
  definition: QuestionnaireDefinition,
  answers: Record<string, unknown>,
): boolean {
  return field.required || definition.rules.some(
    (rule) =>
      rule.kind === "requiredWhen" &&
      rule.field === field.key &&
      answers[rule.dependsOn] === rule.equals,
  );
}

function isFieldType(value: unknown): value is QuestionnaireFieldType {
  return (
    value === "boolean" ||
    value === "integer" ||
    value === "number" ||
    value === "string"
  );
}

function numberKeyword(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
