"use client";

import type {
  AiClarificationQuestion,
  AiClarificationSessionResponse,
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
  ChevronsDown,
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
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  answerAiClarification,
  getTemplate,
  getTemplates,
  startAiClarification,
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

// The approved closing composition is source frame 154 from the design prototype.
const START_SCREEN_FRAME_COUNT = 154;
const startScreenFramePath = (index: number) =>
  `/images/start-screen/frame-${String(index + 1).padStart(3, "0")}.webp`;
const startScreenFrameCache: HTMLImageElement[] = [];
let startScreenPreloadStarted = false;

function preloadStartScreenFrames(): void {
  if (typeof window === "undefined" || startScreenPreloadStarted) return;
  startScreenPreloadStarted = true;

  const preloadBatch = (start: number) => {
    const end = Math.min(START_SCREEN_FRAME_COUNT, start + 15);
    for (let index = start; index < end; index += 1) {
      const image = new window.Image();
      image.decoding = "async";
      image.src = startScreenFramePath(index);
      startScreenFrameCache.push(image);
    }
    if (end < START_SCREEN_FRAME_COUNT) {
      window.setTimeout(() => preloadBatch(end), 60);
    }
  };

  preloadBatch(0);
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

function FlowHeader({
  action,
  eyebrow,
  onBack,
  title,
}: {
  action?: React.ReactNode;
  eyebrow: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <header className="flow-header">
      <p className="screen-eyebrow">{eyebrow}</p>
      <div className="flow-header-row">
        <div className="flow-header-title">
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
        {action}
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

type CreateDealStep = "clarification" | "questionnaire" | "ready" | "type";

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
  const [clarificationAnswers, setClarificationAnswers] = useState<
    Record<string, unknown>
  >({});
  const [clarificationError, setClarificationError] = useState("");
  const [clarificationSession, setClarificationSession] =
    useState<AiClarificationSessionResponse | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
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
  const clarificationStart = useMutation({
    mutationFn: (payload: {
      answers: Record<string, unknown>;
      versionId: string;
    }) =>
      startAiClarification(effectiveSelectedSlug, {
        answers: payload.answers,
        templateVersionId: payload.versionId,
      }),
  });
  const clarificationAnswer = useMutation({
    mutationFn: (payload: {
      answers: Record<string, unknown>;
      sessionId: string;
    }) =>
      answerAiClarification(effectiveSelectedSlug, payload.sessionId, {
        answers: payload.answers,
      }),
  });

  const resetClarification = () => {
    clarificationStart.reset();
    clarificationAnswer.reset();
    setClarificationAnswers({});
    setClarificationError("");
    setClarificationSession(null);
    setQuestionIndex(0);
  };

  const selectTemplate = (slug: string) => {
    if (slug === effectiveSelectedSlug) return;
    validation.reset();
    resetClarification();
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
    resetClarification();
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
      const validated = await validation.mutateAsync({
        answers: normalized.answers,
        versionId: template.data.currentVersion.id,
      });
      const session = await clarificationStart.mutateAsync({
        answers: validated.answers,
        versionId: validated.snapshot.templateVersionId,
      });
      openClarificationSession(session);
    } catch (error) {
      setFieldErrors(extractTemplateFieldErrors(error));
    }
  };

  const openClarificationSession = (
    session: AiClarificationSessionResponse,
  ) => {
    setClarificationSession(session);
    setClarificationAnswers({});
    setClarificationError("");
    setQuestionIndex(0);
    setStep(session.status === "READY_TO_GENERATE" ? "ready" : "clarification");
  };

  const changeClarificationAnswer = (key: string, value: unknown) => {
    setClarificationAnswers((current) => ({ ...current, [key]: value }));
    setClarificationError("");
  };

  const submitClarificationQuestion = async (skip = false) => {
    if (!clarificationSession) return;
    const question = clarificationSession.questions[questionIndex];
    if (!question) return;

    const prepared = prepareClarificationAnswer(
      question,
      clarificationAnswers[question.id],
      skip,
    );
    if (prepared.error) {
      setClarificationError(prepared.error);
      return;
    }

    const nextAnswers = { ...clarificationAnswers };
    if (prepared.omit) delete nextAnswers[question.id];
    else nextAnswers[question.id] = prepared.value;
    setClarificationAnswers(nextAnswers);

    if (questionIndex < clarificationSession.questions.length - 1) {
      setQuestionIndex((current) => current + 1);
      setClarificationError("");
      return;
    }

    try {
      const session = await clarificationAnswer.mutateAsync({
        answers: nextAnswers,
        sessionId: clarificationSession.id,
      });
      openClarificationSession(session);
    } catch {
      // Ошибка запроса отображается в карточке под вопросом.
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
          <RequestErrorCard
            message="Каталог типов сделок не загрузился"
            onRetry={() => templates.refetch()}
          />
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

        {templates.data &&
        templates.data.items.length > 0 &&
        visibleTemplates.length === 0 ? (
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

  if (step === "clarification" && clarificationSession) {
    const question = clarificationSession.questions[questionIndex];
    if (question) {
      return (
        <AiClarificationScreen
          answer={clarificationAnswers[question.id]}
          error={clarificationError}
          isPending={clarificationAnswer.isPending}
          onAnswer={(value) => changeClarificationAnswer(question.id, value)}
          onBack={() => {
            if (questionIndex > 0) {
              setQuestionIndex((current) => current - 1);
              setClarificationError("");
              return;
            }
            resetClarification();
            setStep("questionnaire");
          }}
          onNext={() => void submitClarificationQuestion(false)}
          onSkip={() => void submitClarificationQuestion(true)}
          question={question}
          questionIndex={questionIndex}
          requestError={
            clarificationAnswer.isError
              ? clarificationAnswer.error.message
              : undefined
          }
          total={clarificationSession.questions.length}
        />
      );
    }
  }

  if (step === "ready") {
    return (
      <div className="screen-content create-deal-screen clarification-ready-screen">
        <FlowHeader
          eyebrow="Шаг 3 из 4"
          onBack={() => {
            resetClarification();
            setStep("questionnaire");
          }}
          title="Условия собраны"
        />
        <div className="clarification-ready-content">
          <span className="state-icon">
            <CheckCircle2 size={31} />
          </span>
          <h2>Можно готовить договор</h2>
          <p>
            Анкета и уточнения сохранены. Данных достаточно для подготовки
            проекта договора.
          </p>
        </div>
        <div className="create-flow-action">
          <Button className="full-width" onClick={onBack} type="button">
            К сделкам
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

        {(validation.isError || clarificationStart.isError) &&
        Object.keys(fieldErrors).length === 0 ? (
          <RequestErrorCard
            message={
              clarificationStart.isError
                ? clarificationStart.error.message
                : validation.error?.message ?? "Не удалось проверить анкету"
            }
          />
        ) : null}

        {validation.data ? (
          <div className="validation-success" role="status">
            <Check size={16} /> Анкета заполнена и проверена.
          </div>
        ) : null}

        {template.data && definition ? (
          <Button
            className="full-width"
            disabled={validation.isPending || clarificationStart.isPending}
            type="submit"
          >
            {validation.isPending
              ? "Проверяем анкету"
              : clarificationStart.isPending
                ? "Подготавливаем вопросы"
                : "Продолжить"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}

function AiClarificationScreen({
  answer,
  error,
  isPending,
  onAnswer,
  onBack,
  onNext,
  onSkip,
  question,
  questionIndex,
  requestError,
  total,
}: {
  answer: unknown;
  error: string;
  isPending: boolean;
  onAnswer: (value: unknown) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  question: AiClarificationQuestion;
  questionIndex: number;
  requestError?: string;
  total: number;
}) {
  const errorId = `${question.id}-clarification-error`;
  return (
    <div className="screen-content create-deal-screen ai-clarification-screen">
      <FlowHeader
        action={<span className="ai-model-badge">Помощник</span>}
        eyebrow={`Вопрос ${questionIndex + 1} из ${total}`}
        onBack={onBack}
        title="Уточним детали"
      />
      <p className="screen-copy">
        Ответы помогут сделать условия точнее и понятнее обеим сторонам.
      </p>
      <div
        aria-label={`Пройдено ${questionIndex + 1} из ${total}`}
        className="clarification-progress"
        role="progressbar"
        aria-valuemax={total}
        aria-valuemin={1}
        aria-valuenow={questionIndex + 1}
      >
        <span
          style={{ width: `${((questionIndex + 1) / total) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          initial={{ opacity: 0, y: 10 }}
          key={question.id}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="ai-question-card">
            <div className="ai-question-heading">
              <h2>
                {question.label}
                {question.required ? <span aria-hidden="true"> *</span> : null}
              </h2>
              {question.description ? <p>{question.description}</p> : null}
            </div>
            <AiQuestionControl
              answer={answer}
              errorId={error ? errorId : undefined}
              onAnswer={onAnswer}
              question={question}
            />
            {error ? (
              <span className="field-error" id={errorId} role="alert">
                <CircleAlert size={13} /> {error}
              </span>
            ) : null}
          </Card>
        </motion.div>
      </AnimatePresence>

      {requestError ? (
        <RequestErrorCard message={requestError} onRetry={onNext} />
      ) : null}

      {!question.required ? (
        <Button
          className="clarification-skip"
          disabled={isPending}
          onClick={onSkip}
          type="button"
          variant="ghost"
        >
          Пропустить вопрос
        </Button>
      ) : null}

      <div className="create-flow-action">
        <Button
          className="full-width"
          disabled={isPending}
          onClick={onNext}
          type="button"
        >
          {isPending
            ? "Сохраняем ответы"
            : questionIndex === total - 1
              ? "Завершить"
              : "Продолжить"}
        </Button>
      </div>
    </div>
  );
}

function AiQuestionControl({
  answer,
  errorId,
  onAnswer,
  question,
}: {
  answer: unknown;
  errorId?: string;
  onAnswer: (value: unknown) => void;
  question: AiClarificationQuestion;
}) {
  if (question.type === "single_choice") {
    return (
      <div className="ai-options">
        {question.options.map((option) => (
          <Button
            aria-describedby={errorId}
            aria-pressed={answer === option.value}
            className={cn(
              "ai-option",
              answer === option.value && "is-selected",
            )}
            key={option.value}
            onClick={() => onAnswer(option.value)}
            type="button"
            variant="unstyled"
          >
            <span>{option.label}</span>
            {answer === option.value ? <Check size={16} /> : null}
          </Button>
        ))}
      </div>
    );
  }

  if (question.type === "boolean") {
    return (
      <div className="ai-options is-two-column">
        {[
          { label: "Да", value: true },
          { label: "Нет", value: false },
        ].map((option) => (
          <Button
            aria-describedby={errorId}
            aria-pressed={answer === option.value}
            className={cn(
              "ai-option is-boolean",
              answer === option.value && "is-selected",
            )}
            key={option.label}
            onClick={() => onAnswer(option.value)}
            type="button"
            variant="unstyled"
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
  }

  if (question.type === "date") {
    const currentYear = new Date().getFullYear();
    return (
      <DatePicker
        aria-invalid={Boolean(errorId)}
        allowFuture
        fromYear={currentYear - 100}
        id={question.id}
        onChange={onAnswer}
        toYear={currentYear + 50}
        value={typeof answer === "string" ? answer : ""}
      />
    );
  }

  if (question.type === "number") {
    return (
      <Input
        aria-describedby={errorId}
        aria-invalid={Boolean(errorId)}
        data-number-input="true"
        id={question.id}
        inputMode="decimal"
        onChange={(event) => onAnswer(event.target.value)}
        placeholder="Введите число"
        type="text"
        value={
          typeof answer === "number" || typeof answer === "string" ? answer : ""
        }
      />
    );
  }

  return (
    <Textarea
      aria-describedby={errorId}
      aria-invalid={Boolean(errorId)}
      id={question.id}
      maxLength={1_000}
      onChange={(event) => onAnswer(event.target.value)}
      placeholder="Введите ответ"
      value={typeof answer === "string" ? answer : ""}
    />
  );
}

function prepareClarificationAnswer(
  question: AiClarificationQuestion,
  rawValue: unknown,
  skip: boolean,
): { error?: string; omit?: boolean; value?: unknown } {
  if (skip) {
    return question.required
      ? { error: "Ответьте на обязательный вопрос" }
      : { omit: true };
  }

  const empty =
    rawValue === undefined ||
    rawValue === null ||
    (typeof rawValue === "string" && rawValue.trim() === "");
  if (empty) {
    return question.required
      ? { error: "Ответьте на обязательный вопрос" }
      : { omit: true };
  }

  if (question.type === "single_choice") {
    return typeof rawValue === "string" &&
      question.options.some(({ value }) => value === rawValue)
      ? { value: rawValue }
      : { error: "Выберите один из вариантов" };
  }
  if (question.type === "boolean") {
    return typeof rawValue === "boolean"
      ? { value: rawValue }
      : { error: "Выберите да или нет" };
  }
  if (question.type === "number") {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") {
      return { error: "Укажите число" };
    }
    const normalized = String(rawValue).trim().replace(",", ".");
    if (!/^-?(?:\d+|\d*\.\d+)$/.test(normalized)) {
      return { error: "Укажите число без лишних символов" };
    }
    const number = Number(normalized);
    return Number.isFinite(number)
      ? { value: number }
      : { error: "Укажите корректное число" };
  }
  if (question.type === "date") {
    return typeof rawValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
      ? { value: rawValue }
      : { error: "Укажите дату" };
  }
  if (typeof rawValue !== "string") return { error: "Введите ответ" };
  const value = rawValue.trim();
  return value.length <= 1_000
    ? { value }
    : { error: "Сократите ответ до 1000 символов" };
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
  const rootRef = useRef<HTMLDivElement>(null);
  const frameImageRef = useRef<HTMLImageElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const progressValueRef = useRef<HTMLElement>(null);
  const progressChapterRef = useRef<HTMLSpanElement>(null);

  const updateParallax = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 12;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 9;
    root.style.setProperty("--start-screen-x", `${x.toFixed(2)}px`);
    root.style.setProperty("--start-screen-y", `${y.toFixed(2)}px`);
  };
  const resetParallax = () => {
    rootRef.current?.style.setProperty("--start-screen-x", "0px");
    rootRef.current?.style.setProperty("--start-screen-y", "0px");
  };

  useEffect(() => {
    const root = rootRef.current;
    const frameImage = frameImageRef.current;
    const scroller = root?.parentElement;
    if (!root || !frameImage || !scroller) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let targetProgress = 0;
    let displayedProgress = 0;
    let displayedFrame = -1;

    const measure = () => {
      const viewportHeight = scroller.clientHeight;
      root.style.height = `${Math.round(viewportHeight * 4.05)}px`;
      root.style.setProperty(
        "--start-screen-viewport-height",
        `${viewportHeight}px`,
      );
    };
    const renderFrame = () => {
      animationFrame = 0;
      const distance = targetProgress - displayedProgress;
      displayedProgress =
        Math.abs(distance) < 0.0006
          ? targetProgress
          : displayedProgress + distance * 0.085;
      const percent = Math.round(displayedProgress * 100);
      const chapter =
        displayedProgress < 0.34
          ? "УСЛОВИЯ"
          : displayedProgress < 0.68
            ? "СОГЛАСОВАНИЕ"
            : "ПОДПИСЬ";
      const hintOpacity = Math.max(0, 1 - displayedProgress * 9);
      const nextFrame = mediaQuery.matches
        ? 0
        : Math.min(
            START_SCREEN_FRAME_COUNT - 1,
            Math.round(displayedProgress * (START_SCREEN_FRAME_COUNT - 1)),
          );

      root.style.setProperty(
        "--start-screen-progress",
        displayedProgress.toFixed(4),
      );
      root.style.setProperty(
        "--start-screen-hint-opacity",
        hintOpacity.toFixed(3),
      );
      progressRef.current?.setAttribute("aria-valuenow", String(percent));
      if (progressValueRef.current) {
        progressValueRef.current.textContent = String(percent).padStart(2, "0");
      }
      if (progressChapterRef.current) {
        progressChapterRef.current.textContent = chapter;
      }
      if (nextFrame !== displayedFrame) {
        displayedFrame = nextFrame;
        frameImage.src = startScreenFramePath(nextFrame);
      }
      if (Math.abs(targetProgress - displayedProgress) >= 0.0006) {
        requestRender();
      }
    };
    function requestRender() {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    }
    const updateTarget = () => {
      const maxScroll = Math.max(1, root.offsetHeight - scroller.clientHeight);
      targetProgress = Math.min(1, Math.max(0, scroller.scrollTop / maxScroll));
      requestRender();
    };
    const resizeObserver = new ResizeObserver(() => {
      measure();
      updateTarget();
    });

    scroller.scrollTop = 0;
    measure();
    preloadStartScreenFrames();
    renderFrame();
    resizeObserver.observe(scroller);
    scroller.addEventListener("scroll", updateTarget, { passive: true });
    mediaQuery.addEventListener("change", updateTarget);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      scroller.removeEventListener("scroll", updateTarget);
      mediaQuery.removeEventListener("change", updateTarget);
    };
  }, []);

  return (
    <main className="app-viewport">
      <section className="mini-app start-screen" aria-label="Начало работы">
        {showEnvironmentBadge ? (
          <span className="environment-badge">ТЕСТ</span>
        ) : null}
        <div className="start-screen-scroll">
          <div className="start-screen-cinematic" ref={rootRef}>
            <div
              className="start-screen-stage"
              onPointerLeave={resetParallax}
              onPointerMove={updateParallax}
            >
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

              <div className="start-screen-media" aria-hidden="true">
                <div className="start-screen-media-plane">
                  {/* The frame sequence is intentionally controlled imperatively for scroll scrubbing. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    className="start-screen-frame"
                    decoding="sync"
                    draggable={false}
                    fetchPriority="high"
                    ref={frameImageRef}
                    src={startScreenFramePath(0)}
                  />
                </div>
                <span className="start-screen-shade" />
                <span className="start-screen-glass" />
                <span className="start-screen-rule" />
                <span className="start-screen-media-note">
                  Ясность · Контроль · Подпись
                </span>
              </div>

              <section className="start-screen-card">
                <span className="start-screen-kicker">
                  Частные сделки без лишней сложности
                </span>
                <h1>
                  {["Условия, которые", "ведут к сделке."].map(
                    (line, lineIndex) => (
                      <motion.span
                        animate={{ opacity: 1, y: 0 }}
                        initial={{ opacity: 0, y: 18 }}
                        key={line}
                        transition={{
                          delay: 0.12 + lineIndex * 0.08,
                          duration: 0.7,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        {line}
                      </motion.span>
                    ),
                  )}
                </h1>
                <motion.p
                  animate={{ opacity: 1 }}
                  initial={{ opacity: 0 }}
                  transition={{ delay: 0.34, duration: 0.6 }}
                >
                  Подготовим договор, соберём документы и проведём обе стороны
                  до подписи.
                </motion.p>
              </section>

              <div className="start-screen-scroll-cue" aria-hidden="true">
                <span>Листайте вниз</span>
                <ChevronsDown size={15} strokeWidth={1.8} />
              </div>

              <footer className="start-screen-footer">
                <div
                  aria-label="Прогресс просмотра"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={0}
                  className="start-screen-progress"
                  ref={progressRef}
                  role="progressbar"
                >
                  <span
                    className="start-screen-progress-chapter"
                    ref={progressChapterRef}
                  >
                    УСЛОВИЯ
                  </span>
                  <span className="start-screen-progress-track" aria-hidden="true">
                    <i />
                  </span>
                  <strong ref={progressValueRef}>00</strong>
                </div>
                <Button
                  aria-label="Начать работу с Макс-Контракт"
                  className="start-screen-action"
                  onClick={onStart}
                  type="button"
                  variant="unstyled"
                >
                  <span className="start-screen-action-label">Начать работу</span>
                  <span className="start-screen-action-arrow">
                    <ArrowRight size={18} />
                  </span>
                </Button>
              </footer>
            </div>
          </div>
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
