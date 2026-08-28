"use client";

import type {
  OnboardingStateResponse,
  VerifiedPhone,
} from "@max-contract/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  Files,
  FileSignature,
  FolderOpen,
  Home,
  LockKeyhole,
  PenLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/auth-provider";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { getReadiness } from "@/lib/api/health";
import { getOnboardingState } from "@/lib/api/onboarding";
import { queryKeys } from "@/lib/api/query-keys";
import {
  dealDraftSchema,
  type DealDraftInput,
} from "@/lib/validation/deal-draft";
import { cn } from "@/lib/utils";

type AppTab = "home" | "deals" | "create" | "documents" | "profile";
type Icon = LucideIcon;

const navigation: Array<{
  id: AppTab;
  icon: Icon;
  label: string;
}> = [
  { id: "home", icon: Home, label: "Главная" },
  { id: "deals", icon: BriefcaseBusiness, label: "Сделки" },
  { id: "create", icon: Plus, label: "Создать" },
  { id: "documents", icon: Files, label: "Документы" },
  { id: "profile", icon: UserRound, label: "Профиль" },
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-label="Макс-Контракт">
      <span className="brand-mark-icon" aria-hidden="true">
        <FileSignature size={18} />
      </span>
      <span className="brand-mark-copy">
        <span>МАКС</span>
        <span>КОНТРАКТ</span>
      </span>
    </span>
  );
}

function ReadinessBadge() {
  const readiness = useQuery({
    queryFn: getReadiness,
    queryKey: queryKeys.health.ready(),
    refetchInterval: 60_000,
  });

  if (readiness.isPending) {
    return (
      <span className="service-status is-pending" role="status">
        <span /> Проверяем сервис
      </span>
    );
  }

  if (readiness.isError) {
    return (
      <Button
        type="button"
        variant="unstyled"
        className="service-status is-error"
        onClick={() => readiness.refetch()}
      >
        <CircleAlert size={13} /> Нет связи · повторить
      </Button>
    );
  }

  return (
    <span className="service-status is-ready" role="status">
      <span /> Сервис готов
    </span>
  );
}

function ScreenHeader({
  action,
  eyebrow,
  title,
}: {
  action?: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="screen-header">
      <div>
        <p className="screen-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

function HomeScreen({ onNavigate }: { onNavigate: (tab: AppTab) => void }) {
  return (
    <div className="screen-content">
      <div className="shell-topline">
        <BrandMark />
        <ReadinessBadge />
      </div>
      <ScreenHeader eyebrow="Частные сделки" title="Всё важное — в одном процессе" />
      <p className="screen-copy">
        Подготовьте условия, соберите документы и проведите обе стороны до
        подписи без лишней сложности.
      </p>

      <motion.section
        className="editorial-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
      >
        <span>Ясность / контроль / подпись</span>
        <div>
          <strong>01</strong>
          <p>
            понятный
            <br /> сценарий сделки
          </p>
        </div>
        <i aria-hidden="true" />
      </motion.section>

      <div className="feature-list">
        {[
          [PenLine, "Быстро", "Шаблоны и подсказки помогают начать"],
          [ShieldCheck, "Безопасно", "Доступ только у участников сделки"],
          [FileCheck2, "Под контролем", "Статусы и документы всегда на виду"],
        ].map(([FeatureIcon, label, copy]) => {
          const ItemIcon = FeatureIcon as Icon;
          return (
            <div className="feature-row" key={label as string}>
              <span className="icon-tile">
                <ItemIcon size={17} />
              </span>
              <span>
                <strong>{label as string}</strong>
                <small>{copy as string}</small>
              </span>
            </div>
          );
        })}
      </div>

      <Button className="full-width" onClick={() => onNavigate("create")}>
        Создать первую сделку <ChevronRight size={17} />
      </Button>
    </div>
  );
}

function DealsScreen({ onNavigate }: { onNavigate: (tab: AppTab) => void }) {
  const [filter, setFilter] = useState("all");
  const filters = [
    { id: "all", label: "Все · 0" },
    { id: "draft", label: "Черновики" },
    { id: "signed", label: "Подписаны" },
  ];

  return (
    <div className="screen-content">
      <div className="shell-topline">
        <ReadinessBadge />
        <Button
          className="round-action"
          type="button"
          variant="unstyled"
          aria-label="Уведомления"
        >
          <Bell size={17} />
        </Button>
      </div>
      <ScreenHeader eyebrow="Рабочее пространство" title="Мои сделки" />

      <section className="portfolio-card">
        <span>Портфель / сейчас</span>
        <div>
          <strong>00</strong>
          <p>
            сделок
            <br /> в работе
          </p>
        </div>
        <i aria-hidden="true" />
      </section>

      <div className="filter-row" aria-label="Фильтры сделок">
        {filters.map(({ id, label }) => (
          <Button
            type="button"
            variant="unstyled"
            key={id}
            className={cn("filter-chip", filter === id && "is-active")}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card className="empty-deals">
        <span className="state-icon">
          <FolderOpen size={31} />
        </span>
        <h2>Сделок пока нет</h2>
        <p>
          Создайте первый договор — подскажем, что заполнить и какие документы
          подготовить.
        </p>
        <Button onClick={() => onNavigate("create")}>
          <Plus size={17} /> Создать сделку
        </Button>
      </Card>

      <div className="quick-actions">
        <Button
          type="button"
          variant="unstyled"
          onClick={() => onNavigate("create")}
        >
          <PenLine size={19} />
          <strong>Новая сделка</strong>
          <small>Заполнить условия</small>
        </Button>
        <Button
          type="button"
          variant="unstyled"
          onClick={() => onNavigate("documents")}
        >
          <Files size={19} />
          <strong>Документы</strong>
          <small>Открыть хранилище</small>
        </Button>
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <span className="field-error" id={id} role="alert">
      <CircleAlert size={13} /> {message}
    </span>
  );
}

function CreateDealScreen() {
  const [validated, setValidated] = useState(false);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<DealDraftInput>({
    defaultValues: { description: "", title: "", type: "rent" },
    resolver: zodResolver(dealDraftSchema),
  });
  const description = useWatch({ control, name: "description" });
  const descriptionLength = description.length;

  const onSubmit = () => {
    setValidated(true);
  };

  return (
    <div className="screen-content">
      <ScreenHeader eyebrow="Новая сделка · шаг 1" title="Опишите договорённость" />
      <p className="screen-copy">
        Пишите обычными словами: укажите стороны, предмет сделки, сумму и сроки.
      </p>

      <form className="deal-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="form-field">
          <label id="deal-type-label">Тип сделки</label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                name={field.name}
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  setValidated(false);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  aria-labelledby="deal-type-label"
                  aria-describedby={errors.type ? "type-error" : undefined}
                  aria-invalid={Boolean(errors.type)}
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder="Выберите тип сделки" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="rent">Аренда</SelectItem>
                  <SelectItem value="services">Услуги</SelectItem>
                  <SelectItem value="sale">Купля-продажа</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id="type-error" message={errors.type?.message} />
        </div>

        <label className="form-field">
          <span>Название</span>
          <Input
            placeholder="Например, аренда офиса"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "title-error" : undefined}
            {...register("title", { onChange: () => setValidated(false) })}
          />
          <FieldError id="title-error" message={errors.title?.message} />
        </label>

        <label className="form-field">
          <span>Краткое описание</span>
          <Textarea
            placeholder="Что передаётся, на какой срок и на каких условиях"
            maxLength={500}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? "description-error" : undefined}
            {...register("description", {
              onChange: () => setValidated(false),
            })}
          />
          <span className="field-meta">{descriptionLength}/500</span>
          <FieldError id="description-error" message={errors.description?.message} />
        </label>

        <Card className="form-hint">
          <ShieldCheck size={18} />
          <span>
            <strong>Данные пока не отправляются</strong>
            <small>
              На этом этапе проверяем интерфейс и локальную валидацию формы.
            </small>
          </span>
        </Card>

        {validated ? (
          <div className="validation-success" role="status">
            <Check size={16} /> Данные формы прошли проверку.
          </div>
        ) : null}

        <Button className="full-width" disabled={isSubmitting} type="submit">
          Проверить форму
        </Button>
      </form>
    </div>
  );
}

function DocumentsScreen() {
  return (
    <div className="screen-content">
      <ScreenHeader eyebrow="Защищённое хранилище" title="Документы" />
      <p className="screen-copy">
        Здесь хранятся файлы выбранной сделки. Доступ есть только у её участников.
      </p>
      <Card className="center-state">
        <span className="state-icon">
          <Files size={31} />
        </span>
        <h2>Пока нет документов</h2>
        <p>Состав документов определяется выбранным типом договора.</p>
      </Card>
      <Card className="security-note">
        <LockKeyhole size={18} />
        <span>
          <strong>Приватное хранение</strong>
          <small>Доступ проверяется сервером перед каждым скачиванием.</small>
        </span>
      </Card>
    </div>
  );
}

function BottomNavigation({
  active,
  onChange,
}: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  return (
    <nav className="bottom-navigation" aria-label="Навигация приложения">
      {navigation.map(({ icon: NavIcon, id, label }) => (
        <Button
          type="button"
          variant="unstyled"
          key={id}
          className={cn(
            "navigation-item",
            active === id && "is-active",
            id === "create" && "is-create",
          )}
          onClick={() => onChange(id)}
          aria-current={active === id ? "page" : undefined}
        >
          <span>
            <NavIcon size={id === "create" ? 22 : 20} />
          </span>
          <small>{label}</small>
        </Button>
      ))}
    </nav>
  );
}

function ActiveScreen({
  active,
  onNavigate,
  phone,
}: {
  active: AppTab;
  onNavigate: (tab: AppTab) => void;
  phone: VerifiedPhone;
}) {
  if (active === "home") return <HomeScreen onNavigate={onNavigate} />;
  if (active === "deals") return <DealsScreen onNavigate={onNavigate} />;
  if (active === "create") return <CreateDealScreen />;
  if (active === "documents") return <DocumentsScreen />;
  return <ProfileScreen fallbackPhone={phone} />;
}

function AuthenticationLoading({
  copy = "Проверяем сессию и данные запуска приложения.",
  eyebrow = "Безопасный вход",
  title = "Подключаем MAX",
}: {
  copy?: string;
  eyebrow?: string;
  title?: string;
} = {}) {
  return (
    <main className="app-viewport">
      <section className="mini-app loading-screen" aria-label="Вход через MAX">
        <div className="auth-loading">
          <span className="auth-loading-mark">
            <ShieldCheck size={24} />
          </span>
          <p className="screen-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{copy}</p>
          <span className="auth-loading-line" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}

function AuthenticationError({
  error,
  onRetry,
  title = "Не удалось войти через MAX",
}: {
  error: Error | null;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <main className="app-viewport">
      <section className="mini-app error-screen">
        <div className="center-state auth-error">
          <span className="state-icon is-error">
            <CircleAlert size={31} />
          </span>
          <h1>{title}</h1>
          <p>{error?.message ?? "Повторите попытку через несколько секунд."}</p>
          <Button onClick={onRetry}>
            <RefreshCw size={17} /> Повторить
          </Button>
        </div>
      </section>
    </main>
  );
}

export function MiniAppShell({
  showEnvironmentBadge,
}: {
  showEnvironmentBadge: boolean;
}) {
  const auth = useAuth();

  if (auth.isPending) {
    return <AuthenticationLoading />;
  }

  if (auth.error || !auth.user) {
    return <AuthenticationError error={auth.error} onRetry={auth.retry} />;
  }

  return (
    <AuthenticatedMiniApp showEnvironmentBadge={showEnvironmentBadge} />
  );
}

function AuthenticatedMiniApp({
  showEnvironmentBadge,
}: {
  showEnvironmentBadge: boolean;
}) {
  const queryClient = useQueryClient();
  const onboarding = useQuery({
    queryFn: getOnboardingState,
    queryKey: ["onboarding", "state"],
    retry: false,
  });

  if (onboarding.isPending) {
    return (
      <AuthenticationLoading
        copy="Проверяем согласия и подтверждение телефона."
        eyebrow="Настройка профиля"
        title="Проверяем профиль"
      />
    );
  }

  if (onboarding.error || !onboarding.data) {
    return (
      <AuthenticationError
        error={onboarding.error}
        onRetry={() => void onboarding.refetch()}
        title="Не удалось проверить профиль"
      />
    );
  }

  if (!onboarding.data.completed) {
    return (
      <OnboardingFlow
        onStateChange={(nextState: OnboardingStateResponse) =>
          queryClient.setQueryData(["onboarding", "state"], nextState)
        }
        showEnvironmentBadge={showEnvironmentBadge}
        state={onboarding.data}
      />
    );
  }

  return (
    <AppWorkspace
      phone={onboarding.data.phone!}
      showEnvironmentBadge={showEnvironmentBadge}
    />
  );
}

function AppWorkspace({
  phone,
  showEnvironmentBadge,
}: {
  phone: VerifiedPhone;
  showEnvironmentBadge: boolean;
}) {
  const [active, setActive] = useState<AppTab>("deals");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [active]);

  return (
    <main className="app-viewport">
      <section className="mini-app" aria-label="Макс-Контракт">
        {showEnvironmentBadge ? (
          <span className="environment-badge">ТЕСТ</span>
        ) : null}
        <div className="mini-app-scroll" ref={scrollRef}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="screen-motion"
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <ActiveScreen
                active={active}
                onNavigate={setActive}
                phone={phone}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <BottomNavigation active={active} onChange={setActive} />
      </section>
    </main>
  );
}
