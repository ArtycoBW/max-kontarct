"use client";

import type {
  ContractTemplateListItem,
  OnboardingStateResponse,
  TemplateAnswerValidationError,
  TemplateDocumentRequirementResponse,
  VerifiedPhone,
} from "@max-contract/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  FileCheck2,
  Files,
  FolderOpen,
  Handshake,
  Home,
  LockKeyhole,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ProfileScreen } from "@/components/profile/profile-screen";
import {
  parseQuestionnaireSchema,
  TemplateQuestionnaire,
} from "@/components/templates/template-questionnaire";
import { ApiError } from "@/lib/api/client";
import { getOnboardingState } from "@/lib/api/onboarding";
import { queryKeys } from "@/lib/api/query-keys";
import {
  getTemplate,
  getTemplates,
  validateTemplateAnswers,
} from "@/lib/api/templates";
import { normalizeQuestionnaireAnswers } from "@/lib/validation/questionnaire-answers";
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

function FlowHeader({
  eyebrow,
  onBack,
  title,
}: {
  eyebrow: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <header className="flow-header">
      <p className="screen-eyebrow">{eyebrow}</p>
      <div>
        <Button
          aria-label="Назад"
          className="flow-back-button"
          onClick={onBack}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowLeft size={21} />
        </Button>
        <h1>{title}</h1>
      </div>
    </header>
  );
}

function HomeScreen({ onNavigate }: { onNavigate: (tab: AppTab) => void }) {
  return <DealsScreen onNavigate={onNavigate} />;
}

function DealsScreen({ onNavigate }: { onNavigate: (tab: AppTab) => void }) {
  const [showInviteHint, setShowInviteHint] = useState(false);

  return (
    <div className="screen-content dashboard-empty-screen">
      <ScreenHeader
        action={
          <Button
            aria-label="Создать сделку"
            className="jeton-header-action"
            onClick={() => onNavigate("create")}
            size="icon"
            type="button"
            variant="unstyled"
          >
            <Plus size={20} />
          </Button>
        }
        eyebrow="Рабочее пространство"
        title="Мои сделки"
      />

      <div className="dashboard-empty-content">
        <span className="state-icon dashboard-empty-icon">
          <span>
            <FolderOpen size={38} />
            <PenLine size={18} />
          </span>
        </span>
        <h2>У вас пока нет сделок</h2>
        <p>
          Создайте первую сделку — соберём договор, документы и подписи в одном
          процессе.
        </p>
        <Card className="empty-flow-hint">
          <CheckCircle2 size={17} />
          <span>
            <strong>До готового договора — несколько шагов</strong>
            <small>Подскажем, что заполнить и какие документы приложить</small>
          </span>
        </Card>
      </div>

      <div className="dashboard-empty-actions">
        <Button className="full-width" onClick={() => onNavigate("create")}>
          <Plus size={18} /> Создать сделку
        </Button>
        <Button
          className="full-width"
          onClick={() => setShowInviteHint((visible) => !visible)}
          type="button"
          variant="secondary"
        >
          Принять приглашение
        </Button>
        {showInviteHint ? (
          <p className="invitation-hint" role="status">
            Откройте ссылку приглашения из сообщения MAX.
          </p>
        ) : null}
      </div>
    </div>
  );
}

type CreateDealStep = "questionnaire" | "type";

function TemplateTypeIcon({
  size,
  template,
}: {
  size: number;
  template: ContractTemplateListItem;
}) {
  const searchable = `${template.title} ${template.summary}`;
  if (/аренд/i.test(searchable)) return <Building2 size={size} />;
  if (/услуг|консультац/i.test(searchable)) {
    return <BriefcaseBusiness size={size} />;
  }
  if (/постав|товар/i.test(searchable)) return <Files size={size} />;
  if (/подряд|работ/i.test(searchable)) return <PenLine size={size} />;
  if (/за[её]м|деньг/i.test(searchable)) return <WalletCards size={size} />;
  if (/купл|продаж/i.test(searchable)) return <Handshake size={size} />;
  return <CircleHelp size={size} />;
}

function getTemplateDisplayTitle(title: string): string {
  const normalized = title.replace(/^ДЕМО:\s*/i, "").trim();
  return normalized
    ? normalized.charAt(0).toLocaleUpperCase("ru") + normalized.slice(1)
    : "Договор";
}

function getTemplateDisplaySummary(
  template: ContractTemplateListItem,
): string {
  if (!/^Демонстрационная(?:\s|$)/i.test(template.summary.trim())) {
    return template.summary;
  }

  const searchable = `${template.title} ${template.summary}`;
  if (/аренд/i.test(searchable)) return "Договор найма имущества или помещения";
  if (/услуг|консультац/i.test(searchable)) return "Условия оказания услуг и оплаты";
  if (/постав|товар/i.test(searchable)) return "Поставка товара между сторонами";
  if (/подряд|работ/i.test(searchable)) return "Выполнение работ и приёмка результата";
  if (/за[её]м|деньг/i.test(searchable)) return "Передача денег и порядок возврата";
  if (/купл|продаж/i.test(searchable)) return "Продажа имущества между сторонами";
  return "Структура договора и обязательные условия";
}

function CreateDealScreen({ onBack }: { onBack: () => void }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState("");
  const [step, setStep] = useState<CreateDealStep>("type");
  const templates = useQuery({
    queryFn: getTemplates,
    queryKey: queryKeys.templates.list(),
  });
  const effectiveSelectedSlug =
    selectedSlug || templates.data?.items[0]?.slug || "";
  const selectedTemplate = templates.data?.items.find(
    ({ slug }) => slug === effectiveSelectedSlug,
  );
  const visibleTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    if (!normalizedQuery) return templates.data?.items ?? [];
    return (templates.data?.items ?? []).filter(({ summary, title }) =>
      `${title} ${summary}`.toLocaleLowerCase("ru").includes(normalizedQuery),
    );
  }, [query, templates.data?.items]);
  const template = useQuery({
    enabled: effectiveSelectedSlug.length > 0,
    queryFn: () => getTemplate(effectiveSelectedSlug),
    queryKey: queryKeys.templates.detail(effectiveSelectedSlug),
  });
  const definition = useMemo(
    () =>
      template.data
        ? parseQuestionnaireSchema(
            template.data.currentVersion.questionnaireSchema,
          )
        : null,
    [template.data],
  );
  const questionnaireAnswers = useMemo(
    () => ({
      ...Object.fromEntries(
        (definition?.fields ?? [])
          .filter((field) => field.type === "boolean")
          .map((field) => [field.key, false]),
      ),
      ...answers,
    }),
    [answers, definition],
  );
  const validation = useMutation({
    mutationFn: (payload: {
      answers: Record<string, unknown>;
      versionId: string;
    }) =>
      validateTemplateAnswers(effectiveSelectedSlug, {
        answers: payload.answers,
        templateVersionId: payload.versionId,
      }),
  });

  const selectTemplate = (slug: string) => {
    if (slug === effectiveSelectedSlug) return;
    validation.reset();
    setAnswers({});
    setFieldErrors({});
    setSelectedSlug(slug);
  };

  const changeAnswer = (key: string, value: unknown) => {
    setAnswers((current) => {
      if (value === undefined) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: value };
    });
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    validation.reset();
  };

  const submitQuestionnaire = async (event: FormEvent) => {
    event.preventDefault();
    if (!definition || !template.data) return;

    const normalized = normalizeQuestionnaireAnswers(
      definition,
      questionnaireAnswers,
    );
    setFieldErrors(normalized.errors);
    if (Object.keys(normalized.errors).length > 0) return;

    try {
      await validation.mutateAsync({
        answers: normalized.answers,
        versionId: template.data.currentVersion.id,
      });
    } catch (error) {
      setFieldErrors(extractTemplateFieldErrors(error));
    }
  };

  if (step === "type") {
    return (
      <div className="screen-content create-deal-screen">
        <FlowHeader
          eyebrow="Шаг 1 из 4"
          onBack={onBack}
          title="Выберите тип сделки"
        />
        <p className="screen-copy">
          Подберём структуру договора и уточняющие вопросы.
        </p>

        <div className="deal-type-search">
          <Search size={17} aria-hidden="true" />
          <Input
            aria-label="Поиск типа сделки"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти тип сделки"
            value={query}
          />
        </div>

        {templates.isPending ? (
          <Card className="form-message" role="status">
            <strong>Загружаем типы сделок</strong>
            <span>Получаем опубликованные шаблоны договоров.</span>
          </Card>
        ) : null}

        {templates.isError ? (
          <RequestErrorCard
            message={templates.error.message}
            onRetry={() => templates.refetch()}
          />
        ) : null}

        {templates.data?.items.length === 0 ? (
          <Card className="form-message">
            <strong>Шаблоны договоров не найдены</strong>
            <span>Обновите экран или обратитесь в поддержку.</span>
          </Card>
        ) : null}

        <div className="template-type-list">
          {visibleTemplates.map((item) => {
            const selected = effectiveSelectedSlug === item.slug;
            return (
              <Button
                aria-pressed={selected}
                className={cn(
                  "template-type-option",
                  selected && "is-selected",
                )}
                key={item.id}
                onClick={() => selectTemplate(item.slug)}
                type="button"
                variant="unstyled"
              >
                <span className="template-type-icon">
                  <TemplateTypeIcon size={18} template={item} />
                </span>
                <span>
                  <strong>{getTemplateDisplayTitle(item.title)}</strong>
                  <small>{getTemplateDisplaySummary(item)}</small>
                </span>
                {selected ? <Check size={16} /> : <ArrowRight size={15} />}
              </Button>
            );
          })}
        </div>

        {templates.data && visibleTemplates.length === 0 ? (
          <Card className="form-message">
            <strong>Ничего не найдено</strong>
            <span>Измените запрос, чтобы увидеть доступные типы сделок.</span>
          </Card>
        ) : null}

        <div className="create-flow-action">
          <Button
            className="full-width"
            disabled={
              !visibleTemplates.some(
                ({ slug }) => slug === effectiveSelectedSlug,
              )
            }
            onClick={() => setStep("questionnaire")}
            type="button"
          >
            Продолжить
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-content create-deal-screen">
      <FlowHeader
        eyebrow="Шаг 2 из 4"
        onBack={() => setStep("type")}
        title="Параметры сделки"
      />
      <p className="screen-copy">
        Ответьте на вопросы — по ним будет подготовлена структура договора.
      </p>

      <form className="deal-form" onSubmit={submitQuestionnaire} noValidate>
        {selectedTemplate ? (
          <SelectedTemplateSummary template={selectedTemplate} />
        ) : null}

        {template.isPending && effectiveSelectedSlug ? (
          <Card className="form-message" role="status">
            <strong>Загружаем анкету</strong>
            <span>Получаем актуальные вопросы по выбранному договору.</span>
          </Card>
        ) : null}

        {template.isError ? (
          <RequestErrorCard
            message={template.error.message}
            onRetry={() => template.refetch()}
          />
        ) : null}

        {template.data && definition ? (
          <>
            <TemplateQuestionnaire
              answers={questionnaireAnswers}
              definition={definition}
              errors={fieldErrors}
              onChange={changeAnswer}
            />
            <TemplateDocuments
              requirements={
                template.data.currentVersion.documentRequirements
              }
            />
          </>
        ) : null}

        {template.data && !definition ? (
          <Card className="form-message is-error">
            <strong>Не удалось открыть анкету</strong>
            <span>Повторите загрузку или обратитесь в поддержку.</span>
          </Card>
        ) : null}

        {validation.isError && Object.keys(fieldErrors).length === 0 ? (
          <RequestErrorCard message={validation.error.message} />
        ) : null}

        {validation.data ? (
          <div className="validation-success" role="status">
            <Check size={16} /> Анкета заполнена и проверена.
          </div>
        ) : null}

        {template.data && definition ? (
          <Button
            className="full-width"
            disabled={validation.isPending}
            type="submit"
          >
            {validation.isPending ? "Проверяем анкету" : "Проверить анкету"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}

function SelectedTemplateSummary({
  template,
}: {
  template: ContractTemplateListItem;
}) {
  return (
    <Card className="selected-template-summary">
      <TemplateTypeIcon size={19} template={template} />
      <span>
        <strong>{getTemplateDisplayTitle(template.title)}</strong>
        <small>{getTemplateDisplaySummary(template)}</small>
      </span>
    </Card>
  );
}

function TemplateDocuments({
  requirements,
}: {
  requirements: TemplateDocumentRequirementResponse[];
}) {
  return (
    <Card className="template-documents">
      <div className="template-documents-heading">
        <FileCheck2 size={18} />
        <span>
          <strong>Документы по шаблону</strong>
          <small>Состав определён выбранной версией</small>
        </span>
      </div>
      {requirements.length > 0 ? (
        <ul>
          {requirements.map((requirement) => (
            <li key={requirement.id}>
              <span>
                <strong>{getDocumentDisplayTitle(requirement)}</strong>
                {requirement.description ? (
                  <small>{getDocumentDisplayDescription(requirement)}</small>
                ) : null}
              </span>
              <em>{requirement.required ? "Обязательный" : "Дополнительный"}</em>
            </li>
          ))}
        </ul>
      ) : (
        <p>Дополнительные документы не требуются.</p>
      )}
    </Card>
  );
}

function getDocumentDisplayTitle(
  requirement: TemplateDocumentRequirementResponse,
): string {
  return getTemplateDisplayTitle(requirement.title);
}

function getDocumentDisplayDescription(
  requirement: TemplateDocumentRequirementResponse,
): string {
  if (!/^Демонстрационное(?:\s|$)/i.test(requirement.description ?? "")) {
    return requirement.description ?? "";
  }
  if (/identity|passport/i.test(requirement.key)) {
    return "Паспорт или иной документ, удостоверяющий личность.";
  }
  if (/property|ownership/i.test(requirement.key)) {
    return "Документ, подтверждающий право на имущество.";
  }
  return "Документ, подтверждающий сведения по договору.";
}

function RequestErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="form-message is-error" role="alert">
      <strong>Не удалось выполнить запрос</strong>
      <span>{message}</span>
      {onRetry ? (
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          Повторить
        </Button>
      ) : null}
    </Card>
  );
}

function extractTemplateFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !isRecord(error.details)) return {};
  const errors = error.details.errors;
  if (!Array.isArray(errors)) return {};

  return Object.fromEntries(
    errors
      .filter(isTemplateAnswerValidationError)
      .map((item) => [item.path, item.message]),
  );
}

function isTemplateAnswerValidationError(
  value: unknown,
): value is TemplateAnswerValidationError {
  return (
    isRecord(value) &&
    typeof value.message === "string" &&
    typeof value.path === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (active === "create") {
    return <CreateDealScreen onBack={() => onNavigate("deals")} />;
  }
  if (active === "documents") return <DocumentsScreen />;
  return <ProfileScreen fallbackPhone={phone} />;
}

function StartScreen({
  onStart,
  showEnvironmentBadge,
}: {
  onStart: () => void;
  showEnvironmentBadge: boolean;
}) {
  return (
    <main className="app-viewport">
      <section className="mini-app start-screen" aria-label="Начало работы">
        {showEnvironmentBadge ? (
          <span className="environment-badge">ТЕСТ</span>
        ) : null}
        <div className="start-screen-layout">
          <header className="start-screen-header">
            <span className="start-screen-brand" aria-label="Макс-Контракт">
              <span className="start-screen-brand-mark">
                <PenLine size={17} />
              </span>
              <span>
                МАКС
                <br />
                КОНТРАКТ
              </span>
            </span>
            <span className="start-screen-sequence">01 / 04</span>
          </header>

          <div className="start-screen-media">
            <Image
              alt="Документы для подготовки частной сделки"
              fill
              priority
              sizes="(max-width: 430px) 100vw, 430px"
              src="/images/onboarding-start.webp"
            />
            <span className="start-screen-shade" aria-hidden="true" />
            <span className="start-screen-media-note">
              Ясность · Контроль · Подпись
            </span>
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="start-screen-card"
              initial={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <p>Частные сделки без лишней сложности</p>
              <h1>
                Условия, которые
                <br />
                ведут к сделке.
              </h1>
              <span>
                Подготовим договор, соберём документы и проведём обе стороны до
                подписи.
              </span>
            </motion.div>
          </div>

          <footer className="start-screen-footer">
            <span>Частные сделки</span>
            <Button
              aria-label="Начать работу с Макс-Контракт"
              className="start-screen-action"
              onClick={onStart}
              type="button"
              variant="unstyled"
            >
              <strong>Начать работу</strong>
              <span>
                <ArrowRight size={18} />
              </span>
            </Button>
          </footer>
        </div>
      </section>
    </main>
  );
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
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <StartScreen
        onStart={() => setStarted(true)}
        showEnvironmentBadge={showEnvironmentBadge}
      />
    );
  }

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
        {active !== "create" ? (
          <BottomNavigation active={active} onChange={setActive} />
        ) : null}
      </section>
    </main>
  );
}
