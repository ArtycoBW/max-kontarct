"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronsDown,
  CircleHelp,
  CircleX,
  Clock3,
  Copy,
  Compass,
  Download,
  Eye,
  FileCheck2,
  Files,
  FileText,
  FolderOpen,
  FolderKanban,
  Handshake,
  History,
  Home,
  Hourglass,
  KeyRound,
  LockKeyhole,
  LayoutGrid,
  MapPin,
  MoreHorizontal,
  PenLine,
  Phone,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  SquarePlus,
  UploadCloud,
  UserRound,
  UserCircle2,
  UserRoundPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { counterparty, deal, documents, user } from "@/lib/mock-data";
import { getNextFlowScreen, MAIN_FLOW } from "@/lib/flows";
import { SCREENS } from "@/lib/screens";
import type { ConceptSlug, ScreenId } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ActionFooter,
  AppButton,
  AppCard,
  AppInput,
  AppTextarea,
  ConceptSelect,
  DetailRow,
  DocumentRow,
  FormField,
  ScreenHeader,
  ScreenScaffold,
  StateIcon,
} from "@/components/prototype/screen-primitives";
import { FieldValidation } from "@/components/prototype/field-validation";
import { MaxMessengerIcon } from "@/components/prototype/max-messenger-icon";
import { LogoMark } from "@/components/prototype/logo-mark";
import { PrototypeConceptProvider } from "@/components/prototype/prototype-concept-context";

interface ScreenProps {
  concept: ConceptSlug;
  screenId: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  preview?: boolean;
}

const SPLASH_FRAME_COUNT = 226;
const splashFramePath = (index: number) => `/media/splash/scroll-frames-v2/frame-${String(index + 1).padStart(3, "0")}.webp`;
const splashFrameCache: HTMLImageElement[] = [];
let splashFramePreloadStarted = false;

function preloadSplashFrames() {
  if (typeof window === "undefined" || splashFramePreloadStarted) return;
  splashFramePreloadStarted = true;
  const preloadBatch = (start: number) => {
    const end = Math.min(SPLASH_FRAME_COUNT, start + 15);
    for (let index = start; index < end; index += 1) {
      const image = new Image();
      image.decoding = "async";
      image.src = splashFramePath(index);
      splashFrameCache.push(image);
    }
    if (end < SPLASH_FRAME_COUNT) window.setTimeout(() => preloadBatch(end), 60);
  };
  preloadBatch(0);
}

function ThemeNavGlyph({ concept, id, Icon, active }: { concept: ConceptSlug; id: string; Icon: typeof Home; active: boolean }) {
  if (concept === "jeton") return <Icon size={id === "create" ? 22 : 20} strokeWidth={active ? 2.35 : 1.8} />;
  if (concept === "caldera" || concept === "auros") {
    const glyphs = concept === "caldera" ? {
      home: LayoutGrid,
      deals: FolderKanban,
      create: SquarePlus,
      docs: BookOpenText,
      profile: UserRound,
    } : {
      home: Compass,
      deals: ScrollText,
      create: PlusCircle,
      docs: BookOpenText,
      profile: UserCircle2,
    };
    const Glyph = glyphs[id as keyof typeof glyphs] ?? Icon;
    return <Glyph size={id === "create" ? 21 : 19} strokeWidth={active ? 2.1 : 1.65} />;
  }
  const paths: Record<string, React.ReactNode> = {
    home: <><circle cx="12" cy="12" r="8" /><path d="m8 13 4-5 4 5-4 3Z" /></>,
    deals: <><path d="M4 8h16v11H4Z" /><path d="M9 8V5h6v3M4 12h16" /></>,
    create: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></>,
    docs: <><path d="M6 4h10l3 3v13H6Z" /><path d="M9 11h7M9 15h7" /></>,
    profile: <><circle cx="12" cy="9" r="4" /><path d="M5 21c1-5 3-7 7-7s6 2 7 7" /></>,
  };
  return <svg className="theme-nav-symbol" viewBox="0 0 24 24" aria-hidden="true">{paths[id]}</svg>;
}

function BottomNav({ concept, active = "deals", onNavigate }: { concept: ConceptSlug; active?: "home" | "deals" | "docs" | "profile"; onNavigate: (screen: ScreenId) => void }) {
  const items = [
    { id: "home", label: "Главная", icon: Home, screen: "dashboard" as ScreenId },
    { id: "deals", label: "Сделки", icon: BriefcaseBusiness, screen: "dashboard" as ScreenId },
    { id: "create", label: "Создать", icon: Plus, screen: "deal-type" as ScreenId },
    { id: "docs", label: "Документы", icon: Files, screen: "deal-documents" as ScreenId },
    { id: "profile", label: "Профиль", icon: UserRound, screen: "profile" as ScreenId },
  ];
  return (
    <nav className={cn("app-bottom-nav", `app-bottom-nav--${concept}`)} aria-label="Навигация приложения">
      {items.map(({ id, label, icon: Icon, screen }) => (
        <button key={id} type="button" className={cn("app-nav-item", active === id && "active")} onClick={() => onNavigate(screen)}>
          <span className={cn("app-nav-icon", id === "create" && "app-nav-create")}><ThemeNavGlyph concept={concept} id={id} Icon={Icon} active={active === id} /></span>
          <span className="app-nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}

function BackHeader({ title, eyebrow, onBack, action }: { title: string; eyebrow?: string; onBack: () => void; action?: React.ReactNode }) {
  return <ScreenHeader title={title} eyebrow={eyebrow} onBack={onBack} action={action} />;
}

function DealSummary({ onNavigate, compact = false }: { onNavigate: (screen: ScreenId) => void; compact?: boolean }) {
  return (
    <button type="button" onClick={() => onNavigate("deal-card")} className={cn("app-card deal-summary-card relative grid w-full gap-3 overflow-hidden p-3 text-left", compact && "is-compact")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-[var(--app-muted)]">{deal.number}</span>
        <span className="status-pill rounded-full bg-[color-mix(in_srgb,var(--app-success)_12%,transparent)] px-2 py-1 text-[9px] font-bold text-[var(--app-success)]">Подписан</span>
      </div>
      <h3 className="text-[15px] font-extrabold">{deal.title}</h3>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div><span className="block text-[var(--app-muted)]">Сумма</span><strong className="mt-1 block text-[12px]">{deal.amount}</strong></div>
        <div><span className="block text-[var(--app-muted)]">Срок</span><strong className="mt-1 block text-[12px]">{deal.term}</strong></div>
      </div>
      {!compact && <span className="deal-summary-link flex items-center justify-between text-[11px] font-bold text-[var(--app-control-active)]">Открыть сделку <ArrowRight size={14} /></span>}
    </button>
  );
}

function StatusRow({ label, detail, status = "done" }: { label: string; detail?: string; status?: "done" | "active" | "warn" | "idle" }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className={cn("status-dot mt-1", status === "done" && "done", status === "active" && "active", status === "warn" && "warn")} />
      <div className="min-w-0"><div className="text-[11px] font-bold">{label}</div>{detail && <div className="mt-1 text-[10px] leading-relaxed text-[var(--app-muted)]">{detail}</div>}</div>
    </div>
  );
}

function CenterState({
  icon,
  title,
  copy,
  tone = "primary",
  action,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  tone?: "primary" | "success" | "danger" | "warning";
  action?: React.ReactNode;
}) {
  return (
    <div className="center-state flex min-h-full flex-col items-center justify-center px-7 py-12 text-center">
      <StateIcon tone={tone}>{icon}</StateIcon>
      <h1 className="screen-title mt-9">{title}</h1>
      <p className="screen-copy mt-4 max-w-[272px]">{copy}</p>
      {action && <div className="mt-8 grid w-full gap-2">{action}</div>}
    </div>
  );
}

function ScreenBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("screen-body", className)}>{children}</div>;
}

function AddressDirectoryHint({ confirmed, onChoose }: { confirmed: boolean; onChoose: () => void }) {
  return (
    <button type="button" className={cn("directory-suggestion", confirmed && "is-confirmed")} onClick={onChoose} aria-pressed={confirmed}>
      <MapPin size={15} />
      <span><strong>{confirmed ? "Адрес найден в справочнике" : "Выбрать адрес из справочника"}</strong><small>г. Москва, ул. Тверская, д. 12</small></span>
      {confirmed ? <Check size={15} /> : <ArrowRight size={15} />}
    </button>
  );
}

const dealTypes = [
  ["Аренда", "Помещение, техника, транспорт", Building2],
  ["Оказание услуг", "Работы, услуги, консультации", BriefcaseBusiness],
  ["Поставка", "Товары и оборудование", Files],
  ["Подряд", "Строительные и иные работы", PenLine],
  ["Займ", "Денежные средства", WalletCards],
  ["Купля-продажа", "Имущество и товары", Handshake],
  ["Другое", "Иные договоры", CircleHelp],
] as const;

function normalizeRussianPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("8")) return `7${digits.slice(1, 11)}`;
  if (digits.startsWith("7")) return digits.slice(0, 11);
  return `7${digits}`.slice(0, 11);
}

function formatRussianPhone(value: string) {
  const digits = normalizeRussianPhoneDigits(value);
  if (!digits) return "";
  const area = digits.slice(1, 4);
  const first = digits.slice(4, 7);
  const second = digits.slice(7, 9);
  const third = digits.slice(9, 11);
  let formatted = "+7";
  if (area) formatted += ` (${area}${area.length === 3 ? ")" : ""}`;
  if (first) formatted += ` ${first}`;
  if (second) formatted += `-${second}`;
  if (third) formatted += `-${third}`;
  return formatted;
}

function compactRussianPhoneMask(value: string) {
  const digits = normalizeRussianPhoneDigits(value);
  const area = digits.slice(1, 4);
  const lastFour = digits.slice(-4);
  return `+7 (${area}) ${lastFour.slice(0, 2)} ${lastFour.slice(2)}`;
}

export function PrototypeScreen({ concept, screenId, onNavigate, preview = false }: ScreenProps) {
  const currentIndex = SCREENS.findIndex((item) => item.id === screenId);
  const mainIndex = MAIN_FLOW.indexOf(screenId);
  const next = () => onNavigate(getNextFlowScreen(screenId));
  const back = () => onNavigate(mainIndex > 0 ? MAIN_FLOW[mainIndex - 1] : SCREENS[Math.max(0, currentIndex - 1)].id);
  const view = renderScreen(screenId, { concept, onNavigate, next, back, preview });

  return (
    <PrototypeConceptProvider concept={concept}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screenId}
          className="h-full"
          data-screen={screenId}
          initial={{ opacity: 0, y: preview ? 0 : 14, scale: preview ? 1 : .992 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: preview ? 0 : -8, scale: preview ? 1 : .996 }}
          transition={{ duration: preview ? 0 : .32, ease: [0.22, 1, 0.36, 1] }}
        >
          {view}
        </motion.div>
      </AnimatePresence>
    </PrototypeConceptProvider>
  );
}

type RenderContext = {
  concept: ConceptSlug;
  onNavigate: (screen: ScreenId) => void;
  next: () => void;
  back: () => void;
  preview: boolean;
};

function renderScreen(screenId: ScreenId, context: RenderContext): React.ReactNode {
  const { concept, onNavigate, next, back, preview } = context;
  const screens: Record<ScreenId, React.ReactNode> = {
    splash: <SplashScreen concept={concept} onNext={next} />,
    welcome: <WelcomeScreen concept={concept} onNext={next} onOpenDeals={() => onNavigate("dashboard")} />,
    consents: <ConsentsScreen onNext={next} onBack={back} preview={preview} />,
    phone: <PhoneScreen onNext={next} onBack={back} />,
    dashboard: <DashboardScreen concept={concept} onNavigate={onNavigate} />,
    "dashboard-empty": <DashboardEmptyScreen concept={concept} onNext={next} onNavigate={onNavigate} />,
    "deal-type": <DealTypeScreen onNext={next} onBack={back} />,
    "deal-description": <DealDescriptionScreen onNext={next} onBack={back} />,
    "deal-parameters": <DealParametersScreen concept={concept} onNext={next} onBack={back} />,
    "ai-questions": <AiQuestionsScreen concept={concept} onNext={next} onBack={back} preview={preview} />,
    "ai-generation": <AiGenerationScreen concept={concept} onNext={next} preview={preview} />,
    "initiator-data": <PartyDataScreen type="initiator" onNext={next} onBack={back} />,
    "counterparty-data": <PartyDataScreen type="counterparty" onNext={next} onBack={back} />,
    invitation: <InvitationScreen onNext={next} onBack={back} />,
    "invitation-waiting": <InvitationWaitingScreen onNext={next} onBack={back} />,
    "counterparty-connected": <ConnectedScreen onNext={next} />,
    "required-documents": <RequiredDocumentsScreen onNext={next} onBack={back} />,
    "document-upload": <UploadScreen onNext={next} onBack={back} preview={preview} />,
    "upload-success": <UploadSuccessScreen onNext={next} />,
    "evidence-files": <EvidenceScreen onNext={next} onBack={back} />,
    "verification-status": <VerificationScreen onNext={next} onBack={back} preview={preview} />,
    warnings: <WarningsScreen onNext={next} onBack={back} />,
    "contract-preview": <ContractPreviewScreen onNext={next} onBack={back} />,
    "contract-full": <ContractFullScreen onNext={next} onBack={back} />,
    "terms-approval": <TermsApprovalScreen onNext={next} onBack={back} />,
    "ready-to-sign": <ReadyToSignScreen onNext={next} />,
    "pep-agreement": <PepScreen onNext={next} onBack={back} />,
    otp: <OtpScreen onNext={next} onBack={back} preview={preview} />,
    "signed-by-one-party": <SignedOneScreen onNext={next} />,
    completed: <CompletedScreen onNext={next} />,
    "deal-card": <DealCardScreen concept={concept} onNavigate={onNavigate} />,
    "deal-timeline": <DealTimelineScreen onBack={() => onNavigate("deal-card")} />,
    "deal-documents": <DealDocumentsScreen concept={concept} onNavigate={onNavigate} />,
    "pdf-viewer": <PdfViewerScreen onBack={() => onNavigate("deal-documents")} />,
    profile: <ProfileScreen concept={concept} onNavigate={onNavigate} />,
    "saved-requisites": <RequisitesScreen onBack={() => onNavigate("profile")} />,
    settings: <SettingsScreen onBack={() => onNavigate("profile")} />,
    loading: <GenericStateScreen kind="loading" onNavigate={onNavigate} />,
    error: <GenericStateScreen kind="error" onNavigate={onNavigate} />,
    "empty-state": <GenericStateScreen kind="empty" onNavigate={onNavigate} />,
    "success-state": <GenericStateScreen kind="success" onNavigate={onNavigate} />,
    "expired-link": <GenericStateScreen kind="expired" onNavigate={onNavigate} />,
    "no-access": <GenericStateScreen kind="access" onNavigate={onNavigate} />,
  };
  return screens[screenId];
}

function SplashScreen({ concept, onNext }: { concept: ConceptSlug; onNext: () => void }) {
  const index = ({ jeton: "01", caldera: "02", contractbook: "03", auros: "04" } as const)[concept];
  const rootRef = useRef<HTMLDivElement>(null);
  const frameImageRef = useRef<HTMLImageElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const progressValueRef = useRef<HTMLElement>(null);
  const progressChapterRef = useRef<HTMLSpanElement>(null);
  const copy = ({
    jeton: {
      kicker: "Частные сделки без лишней сложности",
      title: ["Условия, которые", "ведут к сделке."],
      body: "Подготовим договор, соберём документы и проведём обе стороны до подписи.",
      note: "Ясность · Контроль · Подпись",
    },
    caldera: {
      kicker: "Рабочее пространство сделки",
      title: ["Сделка.", "По существу."],
      body: "Один процесс для условий, документов, согласования и результата.",
      note: "4 этапа · 1 понятный процесс",
    },
    contractbook: {
      kicker: "Закрытый контур Макс-Контракт",
      title: ["Всё согласовано.", "Всё под контролем."],
      body: "Спокойное пространство, где обе стороны видят статус и следующий шаг.",
      note: "Доступ только участникам",
    },
    auros: {
      kicker: "Макс-Контракт · Частные сделки",
      title: ["Договориться", "спокойно."],
      body: "Точные условия, собранные документы и подпись - в одной ясной последовательности.",
      note: "Подготовка · Согласование · Подпись",
    },
  } as const)[concept];

  const updateParallax = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - .5) * 12;
    const y = ((event.clientY - bounds.top) / bounds.height - .5) * 9;
    root.style.setProperty("--splash-x", `${x.toFixed(2)}px`);
    root.style.setProperty("--splash-y", `${y.toFixed(2)}px`);
  };
  const resetParallax = () => {
    rootRef.current?.style.setProperty("--splash-x", "0px");
    rootRef.current?.style.setProperty("--splash-y", "0px");
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
      root.style.setProperty("--splash-viewport-height", `${viewportHeight}px`);
    };

    const updateTarget = () => {
      const maxScroll = Math.max(1, root.offsetHeight - scroller.clientHeight);
      targetProgress = Math.min(1, Math.max(0, scroller.scrollTop / maxScroll));
      requestRender();
    };

    const renderFrame = () => {
      animationFrame = 0;
      const distance = targetProgress - displayedProgress;
      displayedProgress = Math.abs(distance) < .0006
        ? targetProgress
        : displayedProgress + distance * .085;
      const percent = Math.round(displayedProgress * 100);
      const chapter = displayedProgress < .34 ? "УСЛОВИЯ" : displayedProgress < .68 ? "СОГЛАСОВАНИЕ" : "ПОДПИСЬ";
      const hintOpacity = Math.max(0, 1 - displayedProgress * 9);
      const nextFrame = mediaQuery.matches
        ? 0
        : Math.min(SPLASH_FRAME_COUNT - 1, Math.round(displayedProgress * (SPLASH_FRAME_COUNT - 1)));

      root.style.setProperty("--scroll-progress", displayedProgress.toFixed(4));
      root.style.setProperty("--scroll-hint-opacity", hintOpacity.toFixed(3));
      progressRef.current?.setAttribute("aria-valuenow", String(percent));
      if (progressValueRef.current) progressValueRef.current.textContent = String(percent).padStart(2, "0");
      if (progressChapterRef.current) progressChapterRef.current.textContent = chapter;
      if (nextFrame !== displayedFrame) {
        displayedFrame = nextFrame;
        frameImage.src = splashFramePath(nextFrame);
      }
      if (Math.abs(targetProgress - displayedProgress) >= .0006) requestRender();
    };

    function requestRender() {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(renderFrame);
    };

    const resizeObserver = new ResizeObserver(() => {
      measure();
      updateTarget();
    });

    measure();
    preloadSplashFrames();
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
    <ScreenScaffold className={cn("cinematic-splash-screen", `cinematic-splash-screen--${concept}`)}>
      <div
        ref={rootRef}
        className={cn("cinematic-splash", `cinematic-splash--${concept}`)}
      >
        <div className="cinematic-splash__stage" onPointerMove={updateParallax} onPointerLeave={resetParallax}>
          <header className="cinematic-splash__header">
            <LogoMark />
            <span className="cinematic-splash__sequence">{index} / 04</span>
          </header>

          <div className="cinematic-splash__media" aria-hidden="true">
            <div className="cinematic-splash__media-plane">
              <img
                ref={frameImageRef}
                className="cinematic-splash__frame"
                src={splashFramePath(0)}
                alt=""
                draggable={false}
                decoding="sync"
                fetchPriority="high"
              />
            </div>
            <span className="cinematic-splash__shade" />
            <span className="cinematic-splash__glass" />
            <span className="cinematic-splash__rule" />
            <span className="cinematic-splash__media-note">{copy.note}</span>
          </div>

          <section className="cinematic-splash__content">
            <span className="cinematic-splash__kicker">{copy.kicker}</span>
            <h1>{copy.title.map((line, lineIndex) => (
              <motion.span
                key={line}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: .7, delay: .12 + lineIndex * .08, ease: [0.22, 1, 0.36, 1] }}
              >{line}</motion.span>
            ))}</h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .6, delay: .34 }}>{copy.body}</motion.p>
          </section>

          <div className="cinematic-splash__scroll-cue" aria-hidden="true">
            <span>Листайте вниз</span>
            <ChevronsDown size={15} strokeWidth={1.8} />
          </div>

          <footer className="cinematic-splash__footer">
            <div
              ref={progressRef}
              className="cinematic-splash__progress"
              role="progressbar"
              aria-label="Прогресс просмотра"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={0}
            >
              <span ref={progressChapterRef} className="cinematic-splash__progress-chapter">УСЛОВИЯ</span>
              <span className="cinematic-splash__progress-track" aria-hidden="true"><i /></span>
              <strong ref={progressValueRef}>00</strong>
            </div>
            <button type="button" className="cinematic-splash__cta" onClick={onNext} aria-label="Начать работу с Макс-Контракт">
              <span className="cinematic-splash__start">Начать работу</span>
              <span className="cinematic-splash__arrow"><ArrowRight size={18} /></span>
            </button>
          </footer>
        </div>
      </div>
    </ScreenScaffold>
  );
}

function WelcomeScreen({ concept, onNext, onOpenDeals }: { concept: ConceptSlug; onNext: () => void; onOpenDeals: () => void }) {
  const features = concept === "jeton" ? [
    { icon: PenLine, label: "Быстро", value: "Готовые шаблоны и подсказки ускоряют подготовку" },
    { icon: ShieldCheck, label: "Безопасно", value: "Данные и документы доступны только сторонам" },
    { icon: Users, label: "Удобно", value: "Согласование и подпись в одном процессе" },
  ] : concept === "caldera" ? [
    { icon: CheckCircle2, label: "Понятный процесс", value: "От идеи до подписи" },
    { icon: ShieldCheck, label: "Надёжная защита", value: "Контроль на каждом этапе" },
    { icon: FileCheck2, label: "Юридическая сила", value: "Условия без лишней сложности" },
  ] : concept === "contractbook" ? [
    { icon: LockKeyhole, label: "Личное пространство", value: "Одна защищённая среда для всей сделки" },
    { icon: ShieldCheck, label: "Спокойный контроль", value: "Статусы и решения без визуального шума" },
    { icon: Clock3, label: "Одно главное действие", value: "Следующий шаг всегда очевиден" },
  ] : [
    { icon: FileCheck2, label: "Только главное", value: "Условия собраны в строгую структуру" },
    { icon: ShieldCheck, label: "Точный контроль", value: "Статусы и подтверждения всегда на виду" },
    { icon: Users, label: "Один процесс", value: "Согласование и подпись без лишних экранов" },
  ];
  return (
    <ScreenScaffold footer={<ActionFooter><AppButton className="w-full" onClick={onNext}>Продолжить</AppButton><button type="button" className="secondary-link text-[10px] text-[var(--app-muted)]" onClick={onOpenDeals}>Уже есть сделка? Открыть</button></ActionFooter>}>
      <ScreenBody>
        <div className="welcome-topline mb-9 flex justify-end"><button type="button" onClick={onNext} className="text-[10px] font-semibold text-[var(--app-control-active)]">Пропустить</button></div>
        {concept === "caldera" && <div className="welcome-product-art" aria-hidden="true"><header><span>Макс-Контракт</span><span>1 из 3</span></header><div><span className="welcome-product-icon"><FileCheck2 size={22} /></span><span><strong>Договор аренды</strong><small>Структура готова к проверке</small></span><CheckCircle2 size={18} /></div><footer><span>Условия</span><span>Документы</span><span>Подпись</span></footer></div>}
        {concept === "auros" && <div className="welcome-editorial-art" aria-hidden="true"><div><span>Частная сделка</span><strong>01</strong></div><p>Ясные условия.<br />Спокойное решение.</p><footer><span>Подготовка</span><FileCheck2 size={20} /></footer></div>}
        <div className="screen-eyebrow mb-3">{concept === "caldera" ? "Рабочее пространство сделки" : concept === "contractbook" ? "Макс-Контракт / частные сделки" : concept === "auros" ? "Макс-Контракт · частные сделки" : "Макс-Контракт"}</div>
        <h1 className="screen-title max-w-[330px]">{concept === "caldera" ? "Все условия - в одном месте" : concept === "contractbook" ? "Спокойный контроль сделки." : concept === "auros" ? "Спокойный способ договориться" : "Заключайте сделки легко и надёжно"}</h1>
        <p className="screen-copy mt-4">Подготовим договор, соберём документы и проведём обе стороны по понятному сценарию.</p>
        {concept === "caldera" ? <AppCard className="welcome-product-features mt-8 grid gap-1 p-2">{features.map(({ icon: Icon, label, value }) => <DetailRow key={label} icon={<Icon size={17} />} label={label} value={value} accent />)}</AppCard> : concept === "jeton" ? <div className="mt-7 grid gap-2">{features.map(({ icon: Icon, label, value }) => <DetailRow key={label} icon={<Icon size={17} />} label={label} value={value} accent />)}</div> : concept === "auros" ? <div className="welcome-editorial-features mt-8 grid gap-2">{features.map(({ icon: Icon, label, value }, index) => <AppCard key={label} tint={index === 0}><span className="welcome-feature-number">0{index + 1}</span><DetailRow icon={<Icon size={17} />} label={label} value={value} accent /></AppCard>)}</div> : <div className="mt-8 grid gap-3">{features.map(({ icon: Icon, label, value }, index) => <AppCard key={label} tint={index === 0}><DetailRow icon={<Icon size={17} />} label={label} value={value} accent /></AppCard>)}</div>}
      </ScreenBody>
    </ScreenScaffold>
  );
}

function ConsentsScreen({ onNext, onBack, preview }: { onNext: () => void; onBack: () => void; preview: boolean }) {
  const [privacy, setPrivacy] = useState(preview);
  const [terms, setTerms] = useState(preview);
  const [notifications, setNotifications] = useState(false);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" disabled={!privacy || !terms} onClick={onNext}>Принять и продолжить</AppButton>}>
      <ScreenBody>
        <BackHeader title="Согласия" eyebrow="Шаг 1 из 2" onBack={onBack} />
        <p className="screen-copy">Для начала работы подтвердите обязательные условия. Настройки можно изменить позже.</p>
        <div className="mt-6 grid gap-3">
          {[
            ["Обработка персональных данных", "Данные используются только для работы сервиса", privacy, setPrivacy, true, ShieldCheck],
            ["Условия использования", "Правила работы Макс‑Контракт", terms, setTerms, true, FileText],
            ["Уведомления о статусах", "Можно отключить в настройках", notifications, setNotifications, false, Bell],
          ].map(([label, copy, checked, setter, required, Icon]) => {
            const ConsentIcon = Icon as typeof ShieldCheck;
            return (
            <AppCard key={label as string} className="consent-card flex items-start gap-3 p-4">
              <span className="app-icon-tile grid size-9 shrink-0 place-items-center rounded-xl"><ConsentIcon size={17} /></span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (setter as (value: boolean) => void)(!(checked as boolean))}>
                <span className="consent-title text-[11px] font-bold">{label as string}{required && <span className="text-[var(--app-primary)]"> *</span>}</span>
                <span className="mt-1 block text-[10px] leading-relaxed text-[var(--app-muted)]">{copy as string}</span>
              </button>
              <Switch checked={checked as boolean} onCheckedChange={setter as (value: boolean) => void} className="data-[state=checked]:bg-[var(--app-control-active)]" />
            </AppCard>
          );})}
        </div>
      </ScreenBody>
    </ScreenScaffold>
  );
}

function PhoneScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [phone, setPhone] = useState(() => formatRussianPhone(user.phone));
  const isValid = phone.replace(/\D/g, "").length >= 11;
  return (
    <ScreenScaffold footer={<ActionFooter><AppButton className="w-full" disabled={!isValid} onClick={() => { toast.success("Код отправлен"); onNext(); }}>Получить код</AppButton><AppButton variant="ghost" className="w-full" onClick={() => { setPhone(""); toast("Введите номер вручную"); }}>Ввести вручную</AppButton></ActionFooter>}>
      <ScreenBody>
        <BackHeader title="Ваш номер телефона" eyebrow="Безопасный вход" onBack={onBack} />
        <p className="screen-copy">Отправим код подтверждения. Номер не передаётся третьим лицам.</p>
        <div className="my-10 grid place-items-center"><StateIcon><Phone size={34} /></StateIcon></div>
        <FormField label="Номер телефона"><AppInput className="text-[16px] font-bold" inputMode="tel" maxLength={18} value={phone} onChange={(event) => setPhone(formatRussianPhone(event.target.value))} />{!isValid && <FieldValidation message="Введите номер в формате +7 (999) 000-00-00" />}</FormField>
        <div className="mt-4 flex gap-2 rounded-[var(--app-radius-input)] bg-[var(--app-surface-soft)] p-3 text-[10px] leading-relaxed text-[var(--app-muted)]"><LockKeyhole size={15} className="shrink-0 text-[var(--app-icon)]" /> Код придёт в сообщении от Макс‑Контракт.</div>
      </ScreenBody>
    </ScreenScaffold>
  );
}

function DashboardScreen({ concept, onNavigate }: { concept: ConceptSlug; onNavigate: (screen: ScreenId) => void }) {
  const [filter, setFilter] = useState("Все · 3");
  return (
    <ScreenScaffold bottomNav={<BottomNav concept={concept} onNavigate={onNavigate} active="deals" />}>
      <ScreenBody className={cn("dashboard-screen-body", `dashboard-screen-body--${concept}`)}>
        <ScreenHeader title="Мои сделки" eyebrow="Добрый день, Алексей" action={<button type="button" onClick={() => toast("Новых уведомлений нет")} className="header-action grid size-9 place-items-center rounded-full bg-[var(--app-surface-soft)] text-[var(--app-icon)]" aria-label="Уведомления"><Bell size={16} /></button>} />
        {concept === "jeton" && <section className="dashboard-overview dashboard-overview--jeton"><span>Портфель / август</span><div><strong>03</strong><p>сделки<br />под контролем</p></div><i aria-hidden="true" /></section>}
        {concept === "caldera" && <section className="dashboard-overview dashboard-overview--product"><header><span>Сводка на сегодня</span><ShieldCheck size={16} /></header><div><strong>3</strong><span><b>Активные сделки</b><small>Все этапы идут по плану</small></span></div><footer><span className="is-mint">2 на проверке</span><span className="is-violet">1 на подписи</span></footer></section>}
        {concept === "contractbook" && <section className="dashboard-overview dashboard-overview--mercury"><div><span>ЛИЧНОЕ ПРОСТРАНСТВО СДЕЛОК</span><ShieldCheck size={16} /></div><strong>120 000 ₽</strong><footer><span>Объём активных сделок</span><small>3 процесса</small></footer></section>}
        {concept === "auros" && <section className="dashboard-overview dashboard-overview--editorial"><div><span>Портфель договоров</span><strong>3</strong><p>активные сделки</p></div><aside><span><i className="is-coral" />На согласовании <b>2</b></span><span><i className="is-green" />Готово к подписи <b>1</b></span><small>Обновлено сегодня, 09:41</small></aside></section>}
        <div className="dashboard-filters mb-5 flex gap-2 overflow-hidden" aria-label="Фильтры сделок">{["Все · 3", "Черновики", "Подписаны"].map((item) => <button type="button" key={item} onClick={() => setFilter(item)} className={cn("app-chip", filter === item && "active")} aria-pressed={filter === item}>{item}</button>)}</div>
        <div className="dashboard-primary-deal">{filter === "Черновики" ? <AppCard tint><StatusRow label="Аренда переговорной" detail="Черновик · обновлён вчера" status="idle" /></AppCard> : <DealSummary onNavigate={onNavigate} />}</div>
        <div className="dashboard-quick-actions mt-3 grid grid-cols-2 gap-3">
          <button type="button" className="app-card interactive-card p-4 text-left" onClick={() => onNavigate("deal-type")}><Plus size={18} className="mb-4 text-[var(--app-icon)]" /><div className="text-[11px] font-bold">Новая сделка</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">Создать договор</div></button>
          <button type="button" className="app-card interactive-card p-4 text-left" onClick={() => onNavigate("counterparty-data")}><UserRoundPlus size={18} className="mb-4 text-[var(--app-icon)]" /><div className="text-[11px] font-bold">Пригласить</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">Добавить сторону</div></button>
        </div>
        <section className="dashboard-recent"><h2 className="screen-section-title mt-6">Недавние</h2><AppCard className="grid gap-1 p-2"><DetailRow icon={<FileCheck2 size={16} />} label="Акт приёма-передачи" value="Обновлён сегодня, 11:30" /><DetailRow icon={<History size={16} />} label="История аренды" value="8 событий" onClick={() => onNavigate("deal-timeline")} /></AppCard></section>
      </ScreenBody>
    </ScreenScaffold>
  );
}

function DashboardEmptyScreen({ concept, onNext, onNavigate }: { concept: ConceptSlug; onNext: () => void; onNavigate: (screen: ScreenId) => void }) {
  const emptyIcon = concept === "caldera"
    ? <span className="relative"><FolderKanban size={38} /><Plus size={17} strokeWidth={2.5} className="absolute -bottom-1 -right-3 text-[var(--app-primary)]" /></span>
    : concept === "jeton"
      ? <span className="relative"><FolderOpen size={38} /><PenLine size={18} className="absolute -bottom-1 -right-3" /></span>
      : concept === "auros" ? <BookOpenText size={38} /> : <FolderOpen size={38} />;
  return (
    <ScreenScaffold bottomNav={<BottomNav concept={concept} onNavigate={onNavigate} active="deals" />}>
      <ScreenBody className="dashboard-empty-screen">
        <ScreenHeader title="Мои сделки" eyebrow="Рабочее пространство" action={<button type="button" onClick={onNext} className="header-action grid size-10 place-items-center rounded-full bg-[var(--app-primary)] text-[var(--app-primary-fg)]" aria-label="Создать сделку"><Plus size={20} /></button>} />
        <div className="dashboard-empty-content">
          <StateIcon>{emptyIcon}</StateIcon>
          <h2 className="screen-title mt-6">У вас пока нет сделок</h2>
          <p className="screen-copy mt-3 max-w-[300px] text-center">Создайте первую сделку - соберём договор, документы и подписи в одном процессе.</p>
          <div className="empty-flow-hint"><CheckCircle2 size={17} /><span><strong>До готового договора - несколько шагов</strong><small>Подскажем, что заполнить и какие документы приложить</small></span></div>
        </div>
        <div className="dashboard-empty-actions"><AppButton onClick={onNext}><Plus size={18} /> Создать сделку</AppButton><AppButton variant="secondary" onClick={() => toast("Приглашение можно открыть по ссылке")}>Принять приглашение</AppButton></div>
      </ScreenBody>
    </ScreenScaffold>
  );
}

function DealTypeScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [selected, setSelected] = useState("Аренда");
  const [query, setQuery] = useState("");
  const visibleTypes = dealTypes.filter(([title, copy]) => `${title} ${copy}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={onNext}>Продолжить</AppButton>}>
      <ScreenBody>
        <BackHeader title="Выберите тип сделки" eyebrow="Шаг 1 из 4" onBack={onBack} />
        <p className="screen-copy">Подберём структуру договора и уточняющие вопросы.</p>
        <div className="deal-type-search relative mt-5"><Search size={17} aria-hidden="true" /><AppInput aria-label="Поиск типа сделки" placeholder="Найти тип сделки" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="mt-3 grid gap-2.5">{visibleTypes.map(([title, copy, Icon]) => <button type="button" key={title} onClick={() => setSelected(title)} className={cn("app-card deal-type-option interactive-card flex items-center gap-3 p-3 text-left", selected === title && "is-selected")} aria-pressed={selected === title}><span className="app-icon-tile grid size-10 place-items-center rounded-xl"><Icon size={18} /></span><span className="min-w-0 flex-1"><strong className="block text-[12px]">{title}</strong><span className="mt-1 block text-[9px] leading-snug text-[var(--app-muted)]">{copy}</span></span>{selected === title ? <Check size={16} className="shrink-0 text-[var(--app-control-active)]" /> : <ArrowRight size={15} className="shrink-0 text-[var(--app-muted)]" />}</button>)}</div>
        {visibleTypes.length === 0 && <AppCard tint className="mt-3 p-4 text-[11px] leading-relaxed">Готового типа нет. Опишите задачу своими словами на следующем шаге.</AppCard>}
        <button type="button" className="secondary-link mt-4 inline-flex items-center gap-2 text-[11px] font-semibold text-[var(--app-control-active)]" onClick={() => { setSelected("Другое"); setQuery(""); }}><PenLine size={15} /> Описать свою задачу</button>
      </ScreenBody>
    </ScreenScaffold>
  );
}

function DealDescriptionScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [description, setDescription] = useState("Аренда офиса площадью 50 м² на 12 месяцев. Помещение передаётся с мебелью и доступом к переговорной.");
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={onNext}>Сохранить и продолжить</AppButton>}>
      <ScreenBody><BackHeader title="Опишите сделку" eyebrow="Шаг 2 из 4" onBack={onBack} /><p className="screen-copy">Пишите своими словами - детали уточним дальше.</p><div className="mt-6 grid gap-4"><FormField label="Название сделки"><AppInput defaultValue={deal.title} /></FormField><FormField label="Краткое описание"><AppTextarea className="deal-description-textarea" value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /><span className="text-right text-[9px] text-[var(--app-muted)]">{description.length}/500</span></FormField><AppCard tint className="flex gap-3 p-4"><PenLine size={18} className="shrink-0 text-[var(--app-icon)]" /><div><div className="text-[11px] font-bold">Можно без юридических терминов</div><p className="mt-1 text-[10px] leading-relaxed text-[var(--app-muted)]">Помощник предложит структуру, а вы проверите каждый пункт.</p></div></AppCard></div></ScreenBody>
    </ScreenScaffold>
  );
}

function DealParametersScreen({ concept, onNext, onBack }: { concept: ConceptSlug; onNext: () => void; onBack: () => void }) {
  const [place, setPlace] = useState("г. Москва, ул. Тверская, д. 12");
  const [placeConfirmed, setPlaceConfirmed] = useState(true);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={onNext}>Продолжить</AppButton>}>
      <ScreenBody><BackHeader title="Параметры сделки" eyebrow="Шаг 3 из 4" onBack={onBack} /><p className="screen-copy">Укажите ключевые коммерческие условия.</p><div className="mt-6 grid grid-cols-2 gap-4"><FormField label="Дата начала"><AppInput defaultValue={deal.startDate} /></FormField><FormField label="Дата окончания"><AppInput defaultValue={deal.endDate} /></FormField><FormField label="Сумма"><AppInput defaultValue="120 000" /></FormField><FormField label="Валюта"><ConceptSelect concept={concept} defaultValue="RUB" options={[{ value: "RUB", label: "₽ Рубли" }, { value: "EUR", label: "€ Евро" }]} /></FormField><div className="col-span-2"><FormField label="Периодичность оплаты"><ConceptSelect concept={concept} defaultValue="monthly" options={[{ value: "monthly", label: "Ежемесячно" }, { value: "once", label: "Единовременно" }]} /></FormField></div><div className="col-span-2"><FormField label="Место исполнения"><AppInput value={place} onChange={(event) => { setPlace(event.target.value); setPlaceConfirmed(false); }} /></FormField><AddressDirectoryHint confirmed={placeConfirmed} onChoose={() => { setPlace("г. Москва, ул. Тверская, д. 12"); setPlaceConfirmed(true); }} /></div></div><div className="mt-6 progress-track"><div className="progress-fill w-3/4" /></div><div className="mt-2 text-[9px] text-[var(--app-muted)]">3 из 4 разделов заполнено</div></ScreenBody>
    </ScreenScaffold>
  );
}

function AiQuestionsScreen({ concept, onNext, onBack, preview }: { concept: ConceptSlug; onNext: () => void; onBack: () => void; preview: boolean }) {
  const questions = [
    { title: "Кто оплачивает коммунальные услуги?", options: ["Арендатор", "Арендодатель", "Поровну"] },
    { title: "Нужен ли обеспечительный платёж?", options: ["Да, за 1 месяц", "Нет", "Указать позже"] },
    { title: "Кто отвечает за текущий ремонт?", options: ["Арендатор", "Арендодатель", "По согласованию"] },
    { title: "Разрешена ли субаренда?", options: ["Нет", "С согласия", "Да"] },
  ];
  const [step, setStep] = useState(preview ? 1 : 0);
  const [selected, setSelected] = useState(questions[step].options[0]);
  const advance = () => { if (step === questions.length - 1) onNext(); else { setStep((value) => value + 1); setSelected(questions[step + 1].options[0]); } };
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={advance}>{step === questions.length - 1 ? "Сформировать договор" : "Следующий вопрос"} <ArrowRight size={16} /></AppButton>}>
      <ScreenBody><BackHeader title="Уточним детали" eyebrow={`Вопрос ${step + 1} из ${questions.length}`} onBack={onBack} action={<span className="ai-model-badge">Помощник</span>} /><p className="screen-copy">Ответы помогут сделать условия точнее и понятнее обеим сторонам.</p><div className="my-6 progress-track"><div className="progress-fill" style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div><AnimatePresence mode="wait"><motion.div key={step} initial={{ opacity: 0, x: concept === "contractbook" ? 10 : 0, y: concept === "contractbook" ? 0 : 10 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, x: concept === "contractbook" ? -8 : 0, y: concept === "contractbook" ? 0 : -8 }} transition={{ duration: .28, ease: [0.22, 1, 0.36, 1] }}><AppCard tint className="ai-question-card p-5"><div className="mb-5 text-[16px] font-extrabold leading-tight">{questions[step].title}</div><div className="ai-options grid gap-2">{questions[step].options.map((option) => <button type="button" key={option} className={cn("app-card ai-option interactive-card p-3 text-left text-[11px]", selected === option && "is-selected")} aria-pressed={selected === option} onClick={() => setSelected(option)}>{option}</button>)}</div></AppCard></motion.div></AnimatePresence><button type="button" className="secondary-link mt-5 text-[10px] text-[var(--app-muted)]" onClick={advance}>Пропустить вопрос</button></ScreenBody>
    </ScreenScaffold>
  );
}

function AiGenerationScreen({ concept, onNext, preview }: { concept: ConceptSlug; onNext: () => void; preview: boolean }) {
  const [progress, setProgress] = useState(preview ? 68 : 8);
  const stages = ["Анализируем ответы", "Подбираем структуру договора", "Формируем условия", "Проверяем документ", "Готово"];
  useEffect(() => {
    if (preview) return;
    const interval = window.setInterval(() => setProgress((value) => {
      const nextValue = Math.min(100, value + 4);
      if (nextValue === 100) window.clearInterval(interval);
      return nextValue;
    }), 85);
    return () => window.clearInterval(interval);
  }, [preview]);
  const stage = Math.min(stages.length - 1, Math.floor(progress / 22));
  const progressVisual = concept === "jeton" ? (
    <div className="ai-document-visual">
      <FileText size={58} strokeWidth={1.25} />
      <span className="ai-document-pen"><PenLine size={22} strokeWidth={1.7} /></span>
      <strong>{progress}%</strong>
    </div>
  ) : concept === "contractbook" ? (
    <div className="mercury-generation-visual">
      <div><FileText size={31} strokeWidth={1.5} /><span>{progress}%</span></div>
      <strong>{progress >= 100 ? "Документ готов" : "Собираем структуру договора"}</strong>
      <div className="mercury-generation-track"><i style={{ width: `${progress}%` }} /></div>
    </div>
  ) : concept === "auros" ? (
    <div className="editorial-generation-visual">
      <header><span>Проект договора</span><FileText size={18} /></header>
      <strong>{progress}%</strong>
      <div><i style={{ width: `${progress}%` }} /></div>
      <small>{progress >= 100 ? "Документ готов" : "Собираем условия и приложения"}</small>
    </div>
  ) : concept === "caldera" ? (
    <div className="product-generation-visual">
      <span className="product-generation-icon"><FileText size={25} /></span>
      <span><small>Подготовка документа</small><strong>{progress}%</strong></span>
      <div><i style={{ width: `${progress}%` }} /></div>
      <p>{progress >= 100 ? "Проект готов к проверке" : "Сверяем ответы и структуру"}</p>
    </div>
  ) : (
    <div className="ai-progress-ring" style={{ "--progress": progress } as React.CSSProperties}>
      <div className="ai-progress-content">
        <strong className="ai-progress-value">{progress}%</strong>
        <span className="ai-progress-label">{progress >= 100 ? "Готово" : "Формируем документ"}</span>
      </div>
    </div>
  );
  return (
    <ScreenScaffold footer={progress >= 100 ? <AppButton className="w-full" onClick={onNext}>Проверить данные <ArrowRight size={16} /></AppButton> : undefined}>
      <ScreenBody className="generation-screen"><ScreenHeader title="Генерация договора" eyebrow="Шаг 4 из 4" /><p className="screen-copy">Готовим проект на основе ваших ответов. Обычно это занимает меньше минуты.</p><div className="mt-5 progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div><div className="generation-visual">{progressVisual}</div><AppCard className="generation-stages grid gap-0">{stages.map((label, index) => <StatusRow key={label} label={label} status={index < stage ? "done" : index === stage ? "active" : "idle"} />)}</AppCard><div className="generation-privacy flex items-start gap-2 rounded-[var(--app-radius-input)] bg-[var(--app-surface-soft)] p-3 text-[11px] leading-relaxed text-[var(--app-muted)]"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-[var(--app-icon)]" /><span>Ответы и документы доступны только участникам сделки.</span></div></ScreenBody>
    </ScreenScaffold>
  );
}

function PartyDataScreen({ type, onNext, onBack }: { type: "initiator" | "counterparty"; onNext: () => void; onBack: () => void }) {
  const isInitiator = type === "initiator";
  const [address, setAddress] = useState("г. Москва, ул. Тверская, д. 12");
  const [addressConfirmed, setAddressConfirmed] = useState(true);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={onNext}>{isInitiator ? "Сохранить данные" : "Создать приглашение"}</AppButton>}>
      <ScreenBody><BackHeader title={isInitiator ? "Ваши данные" : "Контрагент"} eyebrow="Стороны сделки" onBack={onBack} /><p className="screen-copy">{isInitiator ? "Проверьте данные, которые попадут в договор." : "Укажите минимум - остальное контрагент заполнит сам."}</p><div className="mt-6 grid gap-4"><FormField label="ФИО"><AppInput defaultValue={isInitiator ? user.name : counterparty.name} /></FormField><FormField label="Телефон"><AppInput defaultValue={isInitiator ? user.phone : counterparty.phone} /></FormField><FormField label="Электронная почта"><AppInput defaultValue={isInitiator ? user.email : counterparty.email} /></FormField>{isInitiator && <><div><FormField label="Адрес регистрации"><AppInput value={address} onChange={(event) => { setAddress(event.target.value); setAddressConfirmed(false); }} /></FormField><AddressDirectoryHint confirmed={addressConfirmed} onChoose={() => { setAddress("г. Москва, ул. Тверская, д. 12"); setAddressConfirmed(true); }} /></div><AppCard tint className="flex items-center gap-3 p-4"><WalletCards size={18} className="text-[var(--app-icon)]" /><div className="flex-1"><div className="text-[11px] font-bold">Реквизиты сохранены</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">Можно использовать в следующих сделках</div></div><CheckCircle2 size={16} className="text-[var(--app-success)]" /></AppCard></>}</div></ScreenBody>
    </ScreenScaffold>
  );
}

function InvitationScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const copyLink = async () => { try { await navigator.clipboard.writeText("https://max-contract.example/invite/7f4c2a"); toast.success("Ссылка скопирована"); } catch { toast("Ссылка готова к копированию"); } };
  return (
    <ScreenScaffold footer={<ActionFooter><AppButton className="w-full" onClick={() => { toast.success("Приглашение отправлено в MAX"); window.setTimeout(onNext, 450); }}><Send size={16} /> Отправить в MAX</AppButton><AppButton variant="secondary" className="w-full" onClick={copyLink}><Copy size={15} /> Скопировать ссылку</AppButton></ActionFooter>}>
      <ScreenBody className="invitation-screen"><BackHeader title="Пригласите контрагента" eyebrow="Шаг 1 из 2" onBack={onBack} /><p className="screen-copy">Мария получит безопасную ссылку и сможет проверить условия.</p><div className="my-6 grid place-items-center"><StateIcon><MaxMessengerIcon className="size-12" /></StateIcon></div><AppCard tint><div className="mb-4 flex items-center gap-3"><Avatar className="size-11"><AvatarFallback className="bg-[var(--app-control-active)] text-[var(--app-control-fg)]">{counterparty.initials}</AvatarFallback></Avatar><div><div className="text-[15px] font-bold">{counterparty.name}</div><div className="mt-1 text-[12px] text-[var(--app-muted)]">{counterparty.phone}</div></div></div><div className="divider mb-4" /><div className="flex items-center gap-2 text-[12px] text-[var(--app-muted)]"><Clock3 size={16} /> Ссылка действует 72 часа</div></AppCard><button type="button" onClick={copyLink} className="invite-link-card"><span><span className="invite-link-label">Ссылка для приглашения</span><strong>Безопасная ссылка готова</strong></span><Copy size={18} /></button><div className="invite-safety"><ShieldCheck size={17} /><span>Ссылка защищена и предназначена только для Марии</span></div></ScreenBody>
    </ScreenScaffold>
  );
}

function InvitationWaitingScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <ScreenScaffold footer={<ActionFooter><AppButton className="w-full" onClick={onNext}>Показать подключение</AppButton><AppButton variant="ghost" className="w-full" onClick={() => toast.success("Приглашение отправлено повторно")}>Отправить ещё раз</AppButton></ActionFooter>}>
      <ScreenBody><BackHeader title="Ждём контрагента" eyebrow="Приглашение отправлено" onBack={onBack} /><div className="my-8"><StateIcon><Hourglass size={34} /></StateIcon></div><p className="screen-copy text-center">Сообщим, когда Мария откроет приглашение и заполнит данные.</p><AppCard className="mt-7"><StatusRow label="Приглашение создано" detail="Сегодня, 11:42" status="done" /><StatusRow label="Отправлено в MAX" detail="Доставлено" status="done" /><StatusRow label="Ожидаем подключения" detail="Ссылка активна ещё 71 ч 58 мин" status="active" /></AppCard></ScreenBody>
    </ScreenScaffold>
  );
}

function ConnectedScreen({ onNext }: { onNext: () => void }) {
  return <ScreenScaffold><CenterState icon={<CheckCircle2 size={38} />} tone="success" title="Контрагент подключился" copy="Мария Соколова заполнила данные. Обе стороны готовы перейти к документам." action={<><AppCard className="text-left"><DetailRow icon={<UserRound size={17} />} label={counterparty.name} value="Телефон подтверждён" /></AppCard><AppButton onClick={onNext}>Перейти к документам</AppButton></>} /></ScreenScaffold>;
}

function RequiredDocumentsScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={onNext}>Начать загрузку</AppButton>}>
      <ScreenBody><BackHeader title="Нужные документы" eyebrow="Шаблон · Аренда помещения" onBack={onBack} /><p className="screen-copy">Список сформирован для выбранного типа сделки. Для другого шаблона комплект документов изменится.</p><div className="mt-6 grid gap-3"><AppCard tint><DetailRow icon={<FileText size={17} />} label="Паспорт" value="Разворот с фото и регистрация" accent /></AppCard><AppCard><DetailRow icon={<Building2 size={17} />} label="Выписка из ЕГРН" value="Не старше 30 дней" accent /></AppCard><AppCard><DetailRow icon={<Files size={17} />} label="План помещения" value="Если есть - рекомендуем приложить" accent /></AppCard></div><Alert className="mt-6 border-[var(--app-border)] bg-[var(--app-surface-soft)] text-[var(--app-text)]"><ShieldCheck size={16} /><AlertTitle className="text-[11px]">Проверьте персональные данные</AlertTitle><AlertDescription className="text-[10px] text-[var(--app-muted)]">Не загружайте лишние страницы или документы третьих лиц.</AlertDescription></Alert></ScreenBody>
    </ScreenScaffold>
  );
}

function UploadScreen({ onNext, onBack, preview }: { onNext: () => void; onBack: () => void; preview: boolean }) {
  const [fileName, setFileName] = useState(preview ? "Паспорт - Алексей Иванов" : "");
  const [progress, setProgress] = useState(preview ? 72 : 0);
  const handleFile = (file?: File) => { if (!file) return; setFileName(file.name); setProgress(12); const interval = window.setInterval(() => setProgress((value) => { if (value >= 100) { window.clearInterval(interval); return 100; } return Math.min(100, value + 12); }), 120); };
  return (
    <ScreenScaffold footer={<AppButton className="w-full" disabled={!fileName || progress < 100} onClick={onNext}>Продолжить</AppButton>}>
      <ScreenBody><BackHeader title="Загрузите документы" eyebrow="1 из 3" onBack={onBack} /><p className="screen-copy">Добавьте читаемый файл - он появится в материалах сделки.</p><label className="mt-6 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-[var(--app-radius-card)] border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] p-6 text-center hover:border-[var(--app-control-active)]"><input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => handleFile(event.target.files?.[0])} /><span className="grid size-16 place-items-center rounded-full bg-[var(--app-icon-surface)] text-[var(--app-icon)]"><UploadCloud size={28} /></span><strong className="mt-4 text-[13px]">Выберите файл</strong><span className="mt-2 text-[10px] leading-relaxed text-[var(--app-muted)]">Документ или изображение до 20 МБ</span></label>{fileName && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><AppCard className="mt-4"><div className="flex items-center gap-3"><FileText size={18} className="text-[var(--app-icon)]" /><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold">{fileName}</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">{progress < 100 ? `Загрузка · ${progress}%` : "Загружено"}</div></div>{progress === 100 && <CheckCircle2 size={17} className="text-[var(--app-success)]" />}</div><Progress value={progress} className="mt-3 h-1.5 bg-[var(--app-border)] [&>div]:bg-[var(--app-control-active)]" /></AppCard></motion.div>}</ScreenBody>
    </ScreenScaffold>
  );
}

function UploadSuccessScreen({ onNext }: { onNext: () => void }) {
  return <ScreenScaffold><CenterState icon={<FileCheck2 size={38} />} tone="success" title="Документы загружены" copy="Добавили 3 файла. Теперь можно приложить фотографии и другие подтверждения." action={<><AppCard className="text-left"><StatusRow label="3 файла добавлено" detail="Общий размер 5,1 МБ" status="done" /></AppCard><AppButton onClick={onNext}>Добавить подтверждения</AppButton></>} /></ScreenScaffold>;
}

function EvidenceScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [added, setAdded] = useState(false);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={onNext}>Отправить на проверку</AppButton>}>
      <ScreenBody><BackHeader title="Файлы и доказательства" eyebrow="Дополнительно" onBack={onBack} /><p className="screen-copy">Фотографии помещения и акт осмотра помогут зафиксировать состояние на старте.</p><div className="mt-6 grid gap-3">{documents.slice(1).map((doc) => <DocumentRow key={doc.name} {...doc} />)}{added && <DocumentRow name="Фото помещения - 6 файлов" meta="Изображения · 8,6 МБ" status="Добавлено" />}</div><button type="button" onClick={() => setAdded(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-card)] border border-dashed border-[var(--app-border)] p-5 text-[11px] font-bold text-[var(--app-control-active)]"><Plus size={16} /> Добавить файл или фото</button><p className="mt-5 text-[9px] leading-relaxed text-[var(--app-muted)]">Материалы хранятся вместе со сделкой, доступны обеим сторонам и могут использоваться при разрешении спора.</p></ScreenBody>
    </ScreenScaffold>
  );
}

function VerificationScreen({ onNext, onBack, preview }: { onNext: () => void; onBack: () => void; preview: boolean }) {
  const [progress, setProgress] = useState(preview ? 66 : 20);
  useEffect(() => { if (preview) return; const timer = window.setInterval(() => setProgress((value) => { const nextValue = Math.min(100, value + 10); if (nextValue === 100) window.clearInterval(timer); return nextValue; }), 180); return () => window.clearInterval(timer); }, [preview]);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" disabled={progress < 100} onClick={onNext}>Посмотреть результат</AppButton>}>
      <ScreenBody><BackHeader title="Проверяем документы" eyebrow="Внутренняя проверка" onBack={onBack} /><p className="screen-copy">Сопоставляем файлы с данными сделки и отмечаем, что стоит перепроверить.</p><div className="my-7"><div className="mb-3 flex items-end justify-between"><strong className="text-[32px]">{progress}%</strong><span className="text-[10px] text-[var(--app-muted)]">около минуты</span></div><Progress value={progress} className="h-2 bg-[var(--app-border)] [&>div]:bg-[var(--app-primary)]" /></div><AppCard><StatusRow label="Формат и читаемость" detail="Файлы открываются" status="done" /><StatusRow label="Реквизиты сторон" detail={progress > 55 ? "Данные сопоставлены" : "Проверяем поля"} status={progress > 55 ? "done" : "active"} /><StatusRow label="Документы на помещение" detail={progress > 85 ? "Комплект собран" : "В очереди"} status={progress > 85 ? "done" : "idle"} /><StatusRow label="Финальная проверка" detail="Результат требует внимания пользователя" status={progress === 100 ? "warn" : "idle"} /></AppCard></ScreenBody>
    </ScreenScaffold>
  );
}

function WarningsScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" disabled={!confirmed} onClick={onNext}>Понятно, продолжить</AppButton>}>
      <ScreenBody><BackHeader title="Что важно проверить" eyebrow="Результат" onBack={onBack} /><Alert className="border-[#efb55c] bg-[#fff6e6] text-[#573506]"><AlertTriangle size={17} /><AlertTitle className="text-[12px]">Нужна проверка пользователем</AlertTitle><AlertDescription className="text-[10px] leading-relaxed">В выписке из ЕГРН дата выдачи старше рекомендованных 30 дней.</AlertDescription></Alert><div className="mt-5 grid gap-3"><AppCard><StatusRow label="Телефон подтверждён" detail="Одноразовым кодом" status="done" /><StatusRow label="Документы загружены" detail="3 документа и 6 фото" status="done" /><StatusRow label="Реквизиты сторон" detail="Сопоставлены с данными сделки" status="done" /><StatusRow label="Внутренняя проверка" detail="Ожидается решение пользователя" status="active" /></AppCard><AppCard tint className="p-4 text-[10px] leading-relaxed text-[var(--app-muted)]">Проверьте отмеченный пункт и подтвердите актуальность документа.</AppCard></div><label className="mt-5 flex items-start gap-3 text-[10px] leading-relaxed"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(Boolean(value))} className="mt-0.5 border-[var(--app-border)] data-[state=checked]:border-[var(--app-control-active)] data-[state=checked]:bg-[var(--app-control-active)]" /><span>Я увидел предупреждение и самостоятельно проверю актуальность документов.</span></label></ScreenBody>
    </ScreenScaffold>
  );
}

function ContractPreviewScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={onNext}>Открыть полный текст</AppButton>}>
      <ScreenBody><BackHeader title="Проект договора" eyebrow={deal.number} onBack={onBack} action={<button type="button" onClick={() => toast("Доступны экспорт и отправка проекта")} className="header-action grid size-9 place-items-center rounded-full bg-[var(--app-surface-soft)] text-[var(--app-icon)]" aria-label="Действия с договором"><MoreHorizontal size={17} /></button>} /><AppCard tint className="mb-4"><div className="flex items-center gap-3"><FileText size={24} className="text-[var(--app-icon)]" /><div><div className="text-[13px] font-bold">Договор аренды</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">Черновик · 8 страниц</div></div></div></AppCard><div className="grid grid-cols-2 gap-3"><AppCard className="p-4"><span className="text-[9px] text-[var(--app-muted)]">Арендная плата</span><strong className="mt-2 block text-[14px]">{deal.amount}</strong></AppCard><AppCard className="p-4"><span className="text-[9px] text-[var(--app-muted)]">Срок</span><strong className="mt-2 block text-[14px]">{deal.term}</strong></AppCard></div><AppCard className="mt-3 grid gap-1 p-3"><DetailRow icon={<Users size={16} />} label="Стороны" value={`${user.name} · ${counterparty.name}`} /><DetailRow icon={<MapPin size={16} />} label="Объект" value={deal.address} /><DetailRow icon={<CalendarDays size={16} />} label="Начало аренды" value={deal.startDate} /></AppCard><AppCard className="mt-3 p-4"><div className="screen-section-title">Ключевые условия</div><ul className="grid gap-2 pl-4 text-[10px] leading-relaxed text-[var(--app-muted)]"><li>Оплата до 5-го числа каждого месяца</li><li>Обеспечительный платёж - 1 месяц</li><li>Субаренда только с письменного согласия</li></ul></AppCard></ScreenBody>
    </ScreenScaffold>
  );
}

function ContractFullScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [section, setSection] = useState("Основное");
  const sections = [
    ["1", "1. Предмет договора", "Арендодатель передаёт, а Арендатор принимает во временное владение и пользование офисное помещение по адресу: Москва, ул. Петровка, 18.", "Основное"],
    ["2", "2. Срок и стоимость", "Срок аренды составляет 12 месяцев. Арендная плата - 120 000 ₽ в месяц, оплата до 5-го числа.", "Основное"],
    ["3", "3. Права и обязанности", "Стороны обязуются бережно использовать помещение, своевременно сообщать об обстоятельствах и соблюдать согласованные условия.", "Обязанности"],
    ["4", "4. Ответственность", "Ответственность сторон определяется договором и применимым законодательством Российской Федерации.", "Ответственность"],
    ["5", "5. Заключительные положения", "Изменения действительны после подтверждения обеими сторонами. Экземпляр подписанного договора доступен в карточке сделки.", "Ответственность"],
  ];
  const visibleSections = sections.filter((item) => item[3] === section);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" onClick={onNext}>Перейти к согласованию</AppButton>}>
      <ScreenBody><BackHeader title="Договор аренды" eyebrow="Полный текст · 8 страниц" onBack={onBack} action={<button type="button" onClick={() => toast.success("Документ подготовлен к скачиванию")} className="header-action grid size-9 place-items-center rounded-full bg-[var(--app-surface-soft)]" aria-label="Скачать договор"><Download size={16} /></button>} /><div className="mb-4 flex gap-2 overflow-hidden" aria-label="Разделы договора">{["Основное", "Обязанности", "Ответственность"].map((item) => <button type="button" key={item} onClick={() => setSection(item)} className={cn("app-chip", section === item && "active")} aria-pressed={section === item}>{item}</button>)}</div><AnimatePresence mode="wait"><motion.div key={section} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: .22 }}><Accordion type="multiple" defaultValue={visibleSections.map((item) => item[0])} className="grid gap-2">{visibleSections.map(([value, title, copy]) => <AccordionItem key={value} value={value} className="app-card border-[var(--app-border)] px-4"><AccordionTrigger className="py-4 text-left text-[11px] font-bold hover:no-underline">{title}</AccordionTrigger><AccordionContent className="pb-4 text-[10px] leading-[1.65] text-[var(--app-muted)]">{copy}</AccordionContent></AccordionItem>)}</Accordion></motion.div></AnimatePresence><p className="mt-5 text-center text-[9px] text-[var(--app-muted)]">Проверьте условия перед согласованием</p></ScreenBody>
    </ScreenScaffold>
  );
}

function TermsApprovalScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [approved, setApproved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" disabled={!approved || !confirmed} onClick={onNext}>Подтвердить условия</AppButton>}>
      <ScreenBody><BackHeader title="Согласование условий" eyebrow="Финальная проверка" onBack={onBack} /><p className="screen-copy">Проверьте основные параметры перед отправкой контрагенту.</p><div className="mt-6 grid gap-3"><AppCard><StatusRow label="Предмет договора" detail="Аренда офиса, Москва" status="done" /><StatusRow label="Сумма и порядок оплаты" detail={`${deal.amount} ежемесячно`} status="done" /><StatusRow label="Срок действия" detail={`${deal.startDate} - ${deal.endDate}`} status="done" /></AppCard><label className="app-card flex items-start gap-3 p-4 text-[10px] leading-relaxed"><Checkbox checked={approved} onCheckedChange={(value) => setApproved(Boolean(value))} className="mt-0.5 data-[state=checked]:border-[var(--app-control-active)] data-[state=checked]:bg-[var(--app-control-active)]" />Условия договора мне понятны и соответствуют договорённостям.</label><label className="app-card flex items-start gap-3 p-4 text-[10px] leading-relaxed"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(Boolean(value))} className="mt-0.5 data-[state=checked]:border-[var(--app-control-active)] data-[state=checked]:bg-[var(--app-control-active)]" />Данные и реквизиты сторон проверены.</label></div></ScreenBody>
    </ScreenScaffold>
  );
}

function ReadyToSignScreen({ onNext }: { onNext: () => void }) {
  return <ScreenScaffold><CenterState icon={<PenLine size={36} />} title="Готово к подписанию" copy="Обе стороны согласовали условия. Подпишите договор простой электронной подписью." action={<><AppCard className="text-left"><StatusRow label={user.name} detail="Условия подтверждены" status="done" /><StatusRow label={counterparty.name} detail="Условия подтверждены" status="done" /></AppCard><AppButton onClick={onNext}>Перейти к подписи</AppButton></>} /></ScreenScaffold>;
}

function PepScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <ScreenScaffold footer={<AppButton className="w-full" disabled={!accepted} onClick={onNext}>Получить код подписи</AppButton>}>
      <ScreenBody><BackHeader title="Простая электронная подпись" eyebrow="ПЭП" onBack={onBack} /><p className="screen-copy">Подтвердите подписание одноразовым кодом из сообщения.</p><div className="my-7 grid place-items-center"><StateIcon><KeyRound size={34} /></StateIcon></div><Accordion type="single" collapsible defaultValue="how"><AccordionItem value="how" className="app-card px-4"><AccordionTrigger className="py-4 text-[11px] font-bold hover:no-underline">Как это работает</AccordionTrigger><AccordionContent className="text-[10px] leading-relaxed text-[var(--app-muted)]">Код связан с номером телефона и конкретной версией договора. В истории сохраняются дата, время и результат подтверждения.</AccordionContent></AccordionItem><AccordionItem value="legal" className="app-card mt-2 px-4"><AccordionTrigger className="py-4 text-[11px] font-bold hover:no-underline">Юридическое значение</AccordionTrigger><AccordionContent className="text-[10px] leading-relaxed text-[var(--app-muted)]">Стороны заранее договариваются считать код простой электронной подписью в рамках этой сделки.</AccordionContent></AccordionItem></Accordion><label className="mt-5 flex items-start gap-3 text-[10px] leading-relaxed"><Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(Boolean(value))} className="mt-0.5 data-[state=checked]:border-[var(--app-control-active)] data-[state=checked]:bg-[var(--app-control-active)]" />Я согласен использовать код как простую электронную подпись.</label></ScreenBody>
    </ScreenScaffold>
  );
}

function OtpScreen({ onNext, onBack, preview }: { onNext: () => void; onBack: () => void; preview: boolean }) {
  const [digits, setDigits] = useState(preview ? ["2", "8", "4", ""] : ["", "", "", ""]);
  const [error, setError] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const setDigit = (index: number, value: string) => { const digit = value.replace(/\D/g, "").slice(-1); const nextDigits = [...digits]; nextDigits[index] = digit; setDigits(nextDigits); setError(false); if (digit && index < 3) refs.current[index + 1]?.focus(); };
  return (
    <ScreenScaffold footer={<ActionFooter><AppButton className="w-full" disabled={digits.some((digit) => !digit)} onClick={() => { toast.success("Подпись подтверждена"); onNext(); }}>Подписать договор</AppButton><AppButton variant="ghost" className="w-full" onClick={() => setError(true)}>Показать ошибку кода</AppButton></ActionFooter>}>
      <ScreenBody className="otp-screen"><BackHeader title="Введите код" eyebrow="Подписание договора" onBack={onBack} /><p className="screen-copy otp-delivery-copy"><span>Отправили 4 цифры на номер</span><strong className="otp-phone-mask">{compactRussianPhoneMask(user.phone)}</strong></p><div className="mt-9 flex justify-center gap-3">{digits.map((digit, index) => <input key={index} ref={(node) => { refs.current[index] = node; }} className={cn("h-16 w-14 rounded-[var(--app-radius-input)] border bg-[var(--app-surface)] text-center text-[24px] font-bold outline-none", error ? "border-[var(--app-danger)]" : "border-[var(--app-border)] focus:border-[var(--app-control-active)]")} value={digit} inputMode="numeric" maxLength={1} onChange={(event) => setDigit(index, event.target.value)} onKeyDown={(event) => { if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus(); }} aria-label={`Цифра ${index + 1}`} />)}</div>{error && <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center justify-center gap-2 text-[10px] text-[var(--app-danger)]"><CircleX size={14} /> Код не подошёл. Попробуйте ещё раз.</motion.div>}<div className="mt-8 text-center"><button className="text-[11px] font-bold text-[var(--app-control-active)]" onClick={() => toast.success("Новый код отправлен")}>Отправить новый код</button><div className="mt-2 text-[9px] text-[var(--app-muted)]">Доступно через 00:38</div></div><AppCard tint className="mt-8 flex gap-3 p-4"><LockKeyhole size={16} className="shrink-0 text-[var(--app-icon)]" /><p className="text-[9px] leading-relaxed text-[var(--app-muted)]">Код действует 5 минут и подтверждает эту версию договора.</p></AppCard></ScreenBody>
    </ScreenScaffold>
  );
}

function SignedOneScreen({ onNext }: { onNext: () => void }) {
  return <ScreenScaffold><CenterState icon={<CheckCircle2 size={38} />} tone="success" title="Вы подписали договор" copy="Теперь ждём подпись Марии. Мы сообщим, когда сделка будет завершена." action={<><AppCard className="text-left"><StatusRow label={user.name} detail="Подписано сегодня, 12:06" status="done" /><StatusRow label={counterparty.name} detail="Ожидаем подпись" status="active" /></AppCard><AppButton onClick={onNext}>Показать завершение</AppButton><AppButton variant="ghost" onClick={() => toast.success("Напоминание отправлено")}>Напомнить контрагенту</AppButton></>} /></ScreenScaffold>;
}

function CompletedScreen({ onNext }: { onNext: () => void }) {
  return <ScreenScaffold><CenterState icon={<motion.span initial={{ scale: .5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 240 }}><Check size={42} strokeWidth={3} /></motion.span>} tone="success" title="Сделка завершена" copy="Договор подписан обеими сторонами простой электронной подписью и сохранён вместе с материалами сделки." action={<><AppCard className="text-left"><div className="flex items-center gap-3"><FileCheck2 size={22} className="text-[var(--app-success)]" /><div className="flex-1"><div className="text-[11px] font-bold">Договор аренды</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">8 страниц · 1,2 МБ</div></div><button onClick={() => toast.success("Документ готов к скачиванию")} aria-label="Скачать подписанный договор"><Download size={17} /></button></div><div className="divider my-3" /><div className="flex items-start gap-2 text-[9px] leading-relaxed text-[var(--app-muted)]"><ShieldCheck size={15} className="mt-0.5 shrink-0" />Договор и вложения доступны участникам и могут использоваться при разрешении спора.</div></AppCard><AppButton onClick={onNext}>Перейти к сделке</AppButton><AppButton variant="secondary" onClick={() => toast.success("Документ готов к скачиванию")}><Download size={15} /> Скачать договор</AppButton></>} /></ScreenScaffold>;
}

function DealCardScreen({ concept, onNavigate }: { concept: ConceptSlug; onNavigate: (screen: ScreenId) => void }) {
  return (
    <ScreenScaffold bottomNav={<BottomNav concept={concept} onNavigate={onNavigate} active="deals" />}>
      <ScreenBody><BackHeader title={deal.title} eyebrow={deal.number} onBack={() => onNavigate("dashboard")} action={<button type="button" onClick={() => toast("Доступны экспорт, копирование и архив")} className="header-action grid size-9 place-items-center rounded-full bg-[var(--app-surface-soft)] text-[var(--app-icon)]" aria-label="Действия со сделкой"><MoreHorizontal size={17} /></button>} /><div className="deal-complete-banner mb-4 flex items-center justify-between rounded-[var(--app-radius-card)] bg-[color-mix(in_srgb,var(--app-success)_12%,transparent)] p-4"><div><div className="text-[10px] text-[var(--app-success)]">Статус</div><strong className="mt-1 block text-[14px]">Завершена</strong></div><CheckCircle2 size={25} className="text-[var(--app-success)]" /></div><div className="grid grid-cols-2 gap-3"><AppCard className="p-4"><span className="text-[9px] text-[var(--app-muted)]">Сумма</span><strong className="mt-1 block text-[13px]">{deal.amount}</strong></AppCard><AppCard className="p-4"><span className="text-[9px] text-[var(--app-muted)]">Срок</span><strong className="mt-1 block text-[13px]">{deal.term}</strong></AppCard></div><h2 className="screen-section-title mt-6">Стороны</h2><AppCard className="grid gap-1 p-2"><DetailRow icon={<UserRound size={16} />} label={user.name} value="Инициатор · подписал" /><DetailRow icon={<UserRound size={16} />} label={counterparty.name} value="Контрагент · подписала" /></AppCard><h2 className="screen-section-title mt-6">Материалы сделки</h2><AppCard className="grid gap-1 p-2"><DetailRow icon={<History size={16} />} label="История сделки" value="14 событий" onClick={() => onNavigate("deal-timeline")} /><DetailRow icon={<FolderOpen size={16} />} label="Документы" value="7 файлов" onClick={() => onNavigate("deal-documents")} /><DetailRow icon={<Eye size={16} />} label="Подписанный договор" value="Документ · 1,2 МБ" onClick={() => onNavigate("pdf-viewer")} /></AppCard></ScreenBody>
    </ScreenScaffold>
  );
}

function DealTimelineScreen({ onBack }: { onBack: () => void }) {
  const events = [
    ["Договор подписан обеими сторонами", "Сегодня, 12:14", "done"],
    ["Мария Соколова подписала договор", "Сегодня, 12:13", "done"],
    ["Алексей Иванов подписал договор", "Сегодня, 12:06", "done"],
    ["Условия согласованы", "Сегодня, 11:54", "done"],
    ["Документы проверены", "Сегодня, 11:38", "done"],
    ["Контрагент подключился", "Сегодня, 11:21", "done"],
    ["Сделка создана", "Сегодня, 11:04", "done"],
  ] as const;
  return <ScreenScaffold><ScreenBody><BackHeader title="История сделки" eyebrow={deal.number} onBack={onBack} /><div className="relative mt-7 before:absolute before:bottom-6 before:left-[5px] before:top-2 before:w-px before:bg-[var(--app-border)]">{events.map(([label, time, status], index) => <motion.div key={label} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .04 }} className="relative flex gap-4 pb-6"><span className={cn("status-dot z-10 mt-1.5", status)} /><div><div className="text-[11px] font-bold">{label}</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">{time}</div></div></motion.div>)}</div></ScreenBody></ScreenScaffold>;
}

function DealDocumentsScreen({ concept, onNavigate }: { concept: ConceptSlug; onNavigate: (screen: ScreenId) => void }) {
  const [filter, setFilter] = useState("Все · 7");
  const showContract = filter !== "Стороны";
  const showParties = filter !== "Договор";
  return <ScreenScaffold bottomNav={<BottomNav concept={concept} onNavigate={onNavigate} active="docs" />}><ScreenBody><BackHeader title="Документы" eyebrow={deal.number} onBack={() => onNavigate("deal-card")} /><div className="mb-5 flex gap-2" aria-label="Фильтры документов">{["Все · 7", "Договор", "Стороны"].map((item) => <button type="button" key={item} className={cn("app-chip", filter === item && "active")} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item}</button>)}</div>{showContract && <><h2 className="screen-section-title">Итоговый договор</h2><DocumentRow name="Договор аренды - подписан" meta="8 страниц · 1,2 МБ" status="Подписан" onClick={() => onNavigate("pdf-viewer")} /></>}{showParties && <><h2 className="screen-section-title mt-6">Документы сторон</h2><div className="grid gap-2">{documents.map((document) => <DocumentRow key={document.name} {...document} />)}</div><h2 className="screen-section-title mt-6">Подтверждения</h2><DocumentRow name="Фото помещения" meta="6 файлов · 8,6 МБ" status="Добавлено" /></>}</ScreenBody></ScreenScaffold>;
}

function PdfViewerScreen({ onBack }: { onBack: () => void }) {
  return <ScreenScaffold><ScreenBody><BackHeader title="Подписанный договор" eyebrow="8 страниц" onBack={onBack} action={<button type="button" onClick={() => toast.success("Документ подготовлен к скачиванию")} className="header-action grid size-9 place-items-center rounded-full bg-[var(--app-primary)] text-[var(--app-primary-fg)]" aria-label="Скачать договор"><Download size={16} /></button>} /><div className="mb-3 flex items-center justify-between text-[10px] text-[var(--app-muted)]"><span>Страница 1 из 8</span><span>100%</span></div><div className="rounded-[var(--app-radius-card)] bg-[#d8d8d4] p-3"><div className="min-h-[510px] bg-white px-7 py-8 text-[#242424]"><div className="text-center text-[8px] uppercase tracking-[.18em]">Договор аренды помещения</div><div className="mt-3 text-center text-[6px] text-[#777]">№ {deal.number} · г. Москва</div><div className="mt-8 text-[7px] leading-[1.8]"><strong>1. Предмет договора</strong><p className="mt-2">1.1. Арендодатель передаёт Арендатору помещение во временное владение и пользование.</p><p>1.2. Адрес объекта: {deal.address}.</p><strong className="mt-4 block">2. Срок и стоимость</strong><p className="mt-2">2.1. Срок аренды: {deal.term}.</p><p>2.2. Арендная плата: {deal.amount} в месяц.</p><strong className="mt-4 block">3. Подписи сторон</strong><div className="mt-8 grid grid-cols-2 gap-6 border-t pt-5"><div>{user.name}<div className="mt-2 text-[#777]">Подписано ПЭП</div></div><div>{counterparty.name}<div className="mt-2 text-[#777]">Подписано ПЭП</div></div></div></div></div></div></ScreenBody></ScreenScaffold>;
}

function ProfileScreen({ concept, onNavigate }: { concept: ConceptSlug; onNavigate: (screen: ScreenId) => void }) {
  return <ScreenScaffold bottomNav={<BottomNav concept={concept} onNavigate={onNavigate} active="profile" />}><ScreenBody><ScreenHeader title="Профиль" eyebrow="Личные данные" action={<button type="button" onClick={() => toast("Новых уведомлений нет")} className="header-action grid size-9 place-items-center rounded-full bg-[var(--app-surface-soft)] text-[var(--app-icon)]" aria-label="Уведомления"><Bell size={16} /></button>} /><AppCard tint className="flex items-center gap-4"><Avatar className="size-14"><AvatarFallback className="bg-[var(--app-control-active)] text-[var(--app-control-fg)]">{user.initials}</AvatarFallback></Avatar><div><div className="text-[15px] font-bold">{user.name}</div><div className="mt-1 text-[10px] text-[var(--app-muted)]">{user.phone}</div><div className="mt-1 text-[9px] text-[var(--app-success)]">Телефон подтверждён</div></div></AppCard><div className="mt-5 grid gap-3"><AppCard className="grid gap-1 p-2"><DetailRow icon={<WalletCards size={17} />} label="Сохранённые реквизиты" value="Физлицо · 1 профиль" onClick={() => onNavigate("saved-requisites")} /><DetailRow icon={<Settings size={17} />} label="Настройки" value="Уведомления и приватность" onClick={() => onNavigate("settings")} /></AppCard><AppCard className="grid gap-1 p-2"><DetailRow icon={<CircleHelp size={17} />} label="Помощь" value="Ответы и связь с поддержкой" onClick={() => toast("Открываем центр помощи")} /><DetailRow icon={<FileText size={17} />} label="Документы сервиса" value="Условия и политика" onClick={() => toast("Документы открыты")} /></AppCard></div><p className="mt-8 text-center text-[9px] text-[var(--app-muted)]">Безопасность и поддержка 24/7</p></ScreenBody></ScreenScaffold>;
}

function RequisitesScreen({ onBack }: { onBack: () => void }) {
  return <ScreenScaffold footer={<AppButton className="w-full" onClick={() => toast.success("Реквизиты сохранены")}>Сохранить изменения</AppButton>}><ScreenBody><BackHeader title="Реквизиты" eyebrow="Сохранённый профиль" onBack={onBack} /><div className="mt-5 grid gap-4"><FormField label="ФИО"><AppInput defaultValue={user.name} /></FormField><FormField label="Дата рождения"><AppInput defaultValue="17.04.1991" /></FormField><FormField label="Серия и номер паспорта"><AppInput defaultValue="45 12 345678" /></FormField><FormField label="ИНН"><AppInput defaultValue="770123456789" /></FormField><FormField label="Адрес регистрации"><AppTextarea className="min-h-20" defaultValue="г. Москва, ул. Тверская, д. 12, кв. 34" /></FormField><AppCard tint className="flex gap-3 p-4"><ShieldCheck size={17} className="shrink-0 text-[var(--app-icon)]" /><p className="text-[9px] leading-relaxed text-[var(--app-muted)]">Реквизиты сохранены и будут автоматически подставлены в следующую сделку.</p></AppCard></div></ScreenBody></ScreenScaffold>;
}

function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState({ status: true, messages: true, marketing: false, deviceAuth: false });
  const toggle = (key: keyof typeof settings) => setSettings((value) => ({ ...value, [key]: !value[key] }));
  return <ScreenScaffold><ScreenBody><BackHeader title="Настройки" eyebrow="Профиль" onBack={onBack} /><h2 className="screen-section-title mt-6">Уведомления</h2><AppCard className="grid gap-1 p-2">{[["status", "Статусы сделок", "Подписи и изменения"], ["messages", "Приглашения", "Новые сделки и напоминания"], ["marketing", "Новости сервиса", "Полезные материалы"]].map(([key, label, copy]) => <div key={key} className="flex items-center gap-3 p-3"><Bell size={16} className="text-[var(--app-icon)]" /><div className="flex-1"><div className="text-[11px] font-bold">{label}</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">{copy}</div></div><Switch checked={settings[key as keyof typeof settings]} onCheckedChange={() => toggle(key as keyof typeof settings)} className="data-[state=checked]:bg-[var(--app-control-active)]" /></div>)}</AppCard><h2 className="screen-section-title mt-6">Безопасность</h2><AppCard className="grid gap-1 p-2"><DetailRow icon={<LockKeyhole size={16} />} label="Код входа" value="Настроен" onClick={() => toast("Настройки кода открыты")} /><div className="flex items-center gap-3 p-3"><ShieldCheck size={16} className="text-[var(--app-icon)]" /><div className="flex-1"><div className="text-[11px] font-bold">Подтверждение входа</div><div className="mt-1 text-[9px] text-[var(--app-muted)]">Использовать код устройства</div></div><Switch checked={settings.deviceAuth} onCheckedChange={() => toggle("deviceAuth")} className="data-[state=checked]:bg-[var(--app-control-active)]" /></div></AppCard></ScreenBody></ScreenScaffold>;
}

function GenericStateScreen({ kind, onNavigate }: { kind: "loading" | "error" | "empty" | "success" | "expired" | "access"; onNavigate: (screen: ScreenId) => void }) {
  const state = {
    loading: { icon: <RefreshCw size={36} className="animate-spin" />, title: "Загружаем сделку", copy: "Проверяем последние изменения. Это займёт несколько секунд.", tone: "primary" as const, action: <AppButton onClick={() => onNavigate("dashboard")}>Открыть главную</AppButton> },
    error: { icon: <AlertCircle size={36} />, title: "Что-то пошло не так", copy: "Не удалось обновить данные. Попробуйте ещё раз - ваши изменения сохранены.", tone: "danger" as const, action: <><AppButton onClick={() => onNavigate("dashboard")}>Попробовать снова</AppButton><AppButton variant="secondary" onClick={() => toast("Чат поддержки открыт")}>Написать в поддержку</AppButton></> },
    empty: { icon: <FolderOpen size={36} />, title: "Здесь пока пусто", copy: "Добавленные документы и действия появятся на этом экране.", tone: "primary" as const, action: <AppButton onClick={() => onNavigate("document-upload")}><Plus size={15} /> Добавить документ</AppButton> },
    success: { icon: <CheckCircle2 size={38} />, title: "Готово", copy: "Изменения сохранены и уже доступны обеим сторонам сделки.", tone: "success" as const, action: <AppButton onClick={() => onNavigate("dashboard")}>Вернуться на главную</AppButton> },
    expired: { icon: <Clock3 size={38} />, title: "Ссылка устарела", copy: "Приглашение действовало 72 часа. Попросите инициатора отправить новую ссылку.", tone: "warning" as const, action: <AppButton onClick={() => toast.success("Запрос на новую ссылку отправлен")}>Запросить новую ссылку</AppButton> },
    access: { icon: <LockKeyhole size={38} />, title: "Нет доступа", copy: "Эта сделка доступна только её участникам. Проверьте аккаунт или обратитесь к инициатору.", tone: "danger" as const, action: <AppButton onClick={() => onNavigate("phone")}>Войти другим номером</AppButton> },
  }[kind];
  return <ScreenScaffold><CenterState {...state} /></ScreenScaffold>;
}
