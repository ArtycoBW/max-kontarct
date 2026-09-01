"use client";

import type { UpdateUserProfileRequest, VerifiedPhone } from "@max-contract/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CircleAlert,
  LockKeyhole,
  Mail,
  MapPin,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/providers/auth-provider";
import { getProfile, updateProfile } from "@/lib/api/profile";
import { getAddressSuggestions, normalizeAddress } from "@/lib/api/data-normalization";
import { queryKeys } from "@/lib/api/query-keys";

const PERSON_NAME = /^[\p{L}][\p{L}\p{M}' -]*$/u;
const profileSchema = z.object({
  address: z.string().trim().max(500, "Не более 500 символов").refine(
    (value) => !value || value.length >= 5,
    "Укажите адрес подробнее",
  ),
  birthDate: z.string().refine(
    (value) => !value || (value >= "1900-01-01" && value <= today()),
    "Укажите корректную дату рождения",
  ),
  email: z
    .string()
    .trim()
    .max(254, "Не более 254 символов")
    .refine(
      (value) => !value || z.string().email().safeParse(value).success,
      "Проверьте адрес электронной почты",
    ),
  firstName: personName("имя"),
  lastName: personName("фамилию"),
  middleName: z
    .string()
    .trim()
    .max(100, "Не более 100 символов")
    .refine((value) => !value || PERSON_NAME.test(value), "Проверьте отчество"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const emptyProfile: ProfileFormValues = {
  address: "",
  birthDate: "",
  email: "",
  firstName: "",
  lastName: "",
  middleName: "",
};

export function ProfileScreen({
  fallbackPhone,
}: {
  fallbackPhone: VerifiedPhone;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const profile = useQuery({
    queryFn: getProfile,
    queryKey: queryKeys.profile.current(),
    retry: false,
  });
  const form = useForm<ProfileFormValues>({
    defaultValues: emptyProfile,
    mode: "onBlur",
    resolver: zodResolver(profileSchema),
  });
  const mutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const address = values.address ? await normalizeAddress(values.address) : null;
      return updateProfile({
        address,
        birthDate: values.birthDate || null,
        email: values.email || null,
        firstName: values.firstName,
        lastName: values.lastName,
        middleName: values.middleName || null,
      } satisfies UpdateUserProfileRequest);
    },
    onSuccess: (nextProfile) => {
      queryClient.setQueryData(queryKeys.profile.current(), nextProfile);
      form.reset(toFormValues(nextProfile));
      setSaved(true);
    },
  });

  useEffect(() => {
    if (profile.data) {
      form.reset(toFormValues(profile.data));
    }
  }, [form, profile.data]);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 3_000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  if (profile.isPending) {
    return <ProfileLoading />;
  }

  if (profile.error || !profile.data) {
    return (
      <div className="screen-content">
        <header className="screen-header">
          <div>
            <p className="screen-eyebrow">Личные данные</p>
            <h1>Профиль</h1>
          </div>
        </header>
        <Card className="profile-query-error">
          <CircleAlert size={24} />
          <div>
            <strong>Не удалось загрузить профиль</strong>
            <p>{profile.error?.message}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => profile.refetch()}>
            <RefreshCw size={15} /> Повторить
          </Button>
        </Card>
      </div>
    );
  }

  const data = profile.data;
  const displayName = [data.firstName, data.lastName].filter(Boolean).join(" ");
  const identity = data.maxUsername
    ? `@${data.maxUsername}`
    : "Аккаунт MAX";
  const phone = data.phone ?? fallbackPhone;

  return (
    <div className="screen-content profile-screen">
      <header className="screen-header">
        <div>
          <p className="screen-eyebrow">Личные данные</p>
          <h1>Профиль</h1>
        </div>
      </header>

      <Card className="profile-card">
        <span className="profile-avatar"><UserRound size={27} /></span>
        <div>
          <span className="profile-connection"><Check size={12} /> MAX подключён</span>
          <h2>{displayName || "Пользователь MAX"}</h2>
          <p>{identity}</p>
        </div>
      </Card>

      {auth.user?.role === "ADMIN" || auth.user?.role === "SUPPORT" ? (
        <Button asChild className="profile-admin-link" variant="outline">
          <Link href="/admin">
            <ShieldCheck size={19} />
            <span>
              <strong>Панель управления</strong>
              <small>
                {auth.user.role === "ADMIN"
                  ? "Пользователи, шаблоны и журнал"
                  : "Просмотр данных и журнала"}
              </small>
            </span>
            <ArrowRight size={18} />
          </Link>
        </Button>
      ) : null}

      <form
        className="profile-form"
        onChange={() => setSaved(false)}
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <div className="profile-form-heading">
          <div>
            <span>Физическое лицо</span>
            <h2>Основные данные</h2>
          </div>
          <ShieldCheck size={20} />
        </div>

        <ProfileField error={form.formState.errors.lastName?.message} inputId="profile-last-name" label="Фамилия">
          <Input
            {...form.register("lastName")}
            aria-invalid={Boolean(form.formState.errors.lastName)}
            autoComplete="family-name"
            id="profile-last-name"
          />
        </ProfileField>
        <ProfileField error={form.formState.errors.firstName?.message} inputId="profile-first-name" label="Имя">
          <Input
            {...form.register("firstName")}
            aria-invalid={Boolean(form.formState.errors.firstName)}
            autoComplete="given-name"
            id="profile-first-name"
          />
        </ProfileField>
        <ProfileField error={form.formState.errors.middleName?.message} inputId="profile-middle-name" label="Отчество">
          <Input
            {...form.register("middleName")}
            aria-invalid={Boolean(form.formState.errors.middleName)}
            autoComplete="additional-name"
            id="profile-middle-name"
            placeholder="Если есть"
          />
        </ProfileField>
        <ProfileField error={form.formState.errors.birthDate?.message} inputId="profile-birth-date" label="Дата рождения">
          <Controller
            control={form.control}
            name="birthDate"
            render={({ field }) => (
              <DatePicker
                aria-invalid={Boolean(form.formState.errors.birthDate)}
                id="profile-birth-date"
                onChange={(value) => {
                  field.onChange(value);
                  setSaved(false);
                }}
                value={field.value}
              />
            )}
          />
        </ProfileField>
        <ProfileField error={form.formState.errors.email?.message} inputId="profile-email" label="Электронная почта">
          <div className="input-with-icon">
            <Mail size={16} />
            <Input
              {...form.register("email")}
              aria-invalid={Boolean(form.formState.errors.email)}
              autoComplete="email"
              id="profile-email"
              inputMode="email"
              placeholder="name@example.ru"
              type="email"
            />
          </div>
        </ProfileField>
        <ProfileField error={form.formState.errors.address?.message} inputId="profile-address" label="Адрес регистрации">
          <Controller
            control={form.control}
            name="address"
            render={({ field }) => (
              <AddressAutocomplete
                invalid={Boolean(form.formState.errors.address)}
                onChange={(value) => {
                  field.onChange(value);
                  setSaved(false);
                }}
                value={field.value}
              />
            )}
          />
        </ProfileField>

        <Card className="verified-contact-card">
          <LockKeyhole size={18} />
          <span>
            <strong>{formatPhone(phone.e164)}</strong>
            <small>
              {phone.source === "MAX"
                ? "Номер подтверждён MAX"
                : "Номер подтверждён"}
            </small>
          </span>
        </Card>

        {mutation.error ? (
          <p className="profile-submit-error" role="alert">
            <CircleAlert size={14} /> {mutation.error.message}
          </p>
        ) : null}
        {saved ? (
          <p className="validation-success" role="status">
            <Check size={14} /> Изменения сохранены
          </p>
        ) : null}
        <Button className="full-width" disabled={mutation.isPending} type="submit">
          <Save size={16} /> {mutation.isPending ? "Сохраняем…" : "Сохранить профиль"}
        </Button>
      </form>
    </div>
  );
}

function ProfileField({
  children,
  error,
  inputId,
  label,
}: {
  children: ReactNode;
  error?: string;
  inputId: string;
  label: string;
}) {
  return (
    <div className="form-field">
      <label htmlFor={inputId}>{label}</label>
      {children}
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}

function ProfileLoading() {
  return (
    <div className="screen-content profile-screen">
      <p className="screen-eyebrow">Личные данные</p>
      <h1 className="profile-loading-title">Профиль</h1>
      <Skeleton className="profile-loading-card" />
      <Skeleton className="profile-loading-form" />
    </div>
  );
}

function AddressAutocomplete({
  invalid,
  onChange,
  value,
}: {
  invalid: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const [focused, setFocused] = useState(false);
  const query = useDeferredValue(value.trim());
  const suggestions = useQuery({
    enabled: focused && query.length >= 3,
    queryFn: () => getAddressSuggestions(query),
    queryKey: queryKeys.normalization.addressSuggestions(query),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <div className="address-autocomplete">
      <div className="input-with-icon">
        <MapPin size={16} />
        <Input
          aria-autocomplete="list"
          aria-expanded={focused && Boolean(suggestions.data?.items.length)}
          aria-invalid={invalid}
          autoComplete="street-address"
          id="profile-address"
          maxLength={500}
          onBlur={() => window.setTimeout(() => setFocused(false), 100)}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Начните вводить адрес"
          role="combobox"
          value={value}
        />
      </div>
      {focused && suggestions.data?.items.length ? (
        <Card className="address-suggestions" role="listbox">
          {suggestions.data.items.map((suggestion) => (
            <button
              key={`${suggestion.value}:${suggestion.fiasId ?? ""}`}
              aria-selected={suggestion.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(suggestion.value);
                setFocused(false);
              }}
              role="option"
              type="button"
            >
              <MapPin size={14} /> {suggestion.value}
            </button>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

function personName(label: string) {
  return z
    .string()
    .trim()
    .min(1, `Укажите ${label}`)
    .max(100, "Не более 100 символов")
    .regex(PERSON_NAME, `Проверьте ${label}`);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toFormValues(profile: {
  address: { value: string } | null;
  birthDate: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
}): ProfileFormValues {
  return {
    address: profile.address?.value ?? "",
    birthDate: profile.birthDate ?? "",
    email: profile.email ?? "",
    firstName: profile.firstName,
    lastName: profile.lastName,
    middleName: profile.middleName ?? "",
  };
}

function formatPhone(e164: string): string {
  const russian = e164.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return russian
    ? `+7 (${russian[1]}) ${russian[2]}-${russian[3]}-${russian[4]}`
    : e164;
}
