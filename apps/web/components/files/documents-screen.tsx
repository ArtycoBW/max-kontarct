"use client";

import type {
  DealDocumentRequirementResponse,
  DealFileCategory,
  DealFileResponse,
} from "@max-contract/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Download,
  FileCheck2,
  FileImage,
  Files,
  FolderOpen,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDeals } from "@/lib/api/deals";
import {
  getDealDocuments,
  getDealFileDownloadUrl,
  uploadDealFile,
  validateUploadCandidate,
} from "@/lib/api/files";
import { queryKeys } from "@/lib/api/query-keys";
import { dealRefreshInterval } from "@/lib/api/deal-refresh";

export function DocumentsScreen({
  dealId,
  onBack,
  onSelectDeal,
}: {
  dealId: string | null;
  onBack: () => void;
  onSelectDeal: (dealId: string) => void;
}) {
  if (!dealId) return <DealDocumentPicker onSelectDeal={onSelectDeal} />;
  return <DealDocuments dealId={dealId} onBack={onBack} />;
}

function DealDocumentPicker({ onSelectDeal }: { onSelectDeal: (dealId: string) => void }) {
  const deals = useQuery({ queryFn: getDeals, queryKey: queryKeys.deals.list() });
  return (
    <div className="screen-content documents-screen">
      <header className="screen-header"><div><p className="screen-eyebrow">Защищённое хранилище</p><h1>Документы</h1></div></header>
      <p className="screen-copy">Выберите сделку — сервер покажет только доступные вам файлы.</p>
      {deals.isPending ? <div className="documents-loading"><Skeleton /><Skeleton /></div> : null}
      {deals.error ? <DocumentsError onRetry={() => void deals.refetch()} /> : null}
      {deals.data?.items.length === 0 ? (
        <Card className="center-state"><span className="state-icon"><FolderOpen size={31} /></span><h2>Сделок пока нет</h2><p>После создания сделки здесь появятся её документы.</p></Card>
      ) : null}
      <div className="document-deal-list">
        {deals.data?.items.map((deal) => (
          <button key={deal.id} onClick={() => onSelectDeal(deal.id)} type="button">
            <span><FileCheck2 size={19} /></span>
            <i><small>{deal.templateTitle}</small><strong>{deal.title}</strong><em>Версия {deal.versionNumber}</em></i>
            <FolderOpen size={18} />
          </button>
        ))}
      </div>
      <PrivacyNote />
    </div>
  );
}

function DealDocuments({ dealId, onBack }: { dealId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [upload, setUpload] = useState<{ label: string; progress: number } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const workspace = useQuery({
    queryFn: () => getDealDocuments(dealId),
    queryKey: queryKeys.files.workspace(dealId),
    refetchInterval: (query) => dealRefreshInterval(query.state.data?.dealStatus),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: false,
  });

  const handleUpload = async (
    file: File,
    category: DealFileCategory,
    requirement?: DealDocumentRequirementResponse,
  ) => {
    const candidateIssue = workspace.data
      ? validateUploadCandidate(file, workspace.data.maxUploadBytes, workspace.data.allowedMimeTypes)
      : null;
    if (candidateIssue) {
      toast.error(candidateIssue.title, { description: candidateIssue.description });
      return;
    }
    setSuccess(null);
    setUpload({ label: requirement?.title ?? "Материал сделки", progress: 0 });
    try {
      await uploadDealFile(dealId, file, {
        category,
        requirementId: requirement?.id,
      }, (progress) => setUpload((current) => current ? { ...current, progress } : null));
      setSuccess(file.name);
      toast.success("Файл сохранён в защищённом хранилище");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.files.workspace(dealId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trust.current() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deals.workspace(dealId) }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить файл");
    } finally {
      setUpload(null);
    }
  };

  if (workspace.isPending) return <DocumentsLoading onBack={onBack} />;
  if (workspace.error || !workspace.data) {
    return <div className="screen-content documents-screen"><BackTitle onBack={onBack} title="Документы" /><DocumentsError onRetry={() => void workspace.refetch()} /></div>;
  }
  const data = workspace.data;
  return (
    <div className="screen-content documents-screen">
      <BackTitle onBack={onBack} title={data.dealTitle} />
      <Card className="documents-summary">
        <span><ShieldCheck size={20} /></span>
        <i><small>Защищённая сделка</small><strong>Документы и материалы</strong><em>{data.requirements.length} требований</em></i>
      </Card>

      {upload ? (
        <Card className="upload-progress-card" role="status">
          <UploadCloud size={20} />
          <span><strong>Загружаем: {upload.label}</strong><i><b style={{ width: `${upload.progress}%` }} /></i><small>{upload.progress}%</small></span>
        </Card>
      ) : null}
      {success ? (
        <Card className="upload-success-card" role="status"><Check size={19} /><span><strong>Файл загружен</strong><small>{success}</small></span></Card>
      ) : null}

      <section className="documents-section">
        <header><span><Files size={18} /><strong>Обязательные документы</strong></span><small>PDF, JPEG, PNG, WebP · до {formatMegabytes(data.maxUploadBytes)}</small></header>
        <div className="requirement-list">
          {data.requirements.map((requirement) => (
            <RequirementCard
              accept={data.allowedMimeTypes.join(",")}
              disabled={Boolean(upload)}
              key={requirement.id}
              onUpload={(file) => void handleUpload(file, "REQUIREMENT", requirement)}
              requirement={requirement}
              dealId={dealId}
            />
          ))}
        </div>
      </section>

      <section className="documents-section">
        <header><span><FileImage size={18} /><strong>Материалы и доказательства</strong></span><small>Фото, акты и дополнительные файлы</small></header>
        <UploadButton
          accept={data.allowedMimeTypes.join(",")}
          disabled={Boolean(upload)}
          label="Добавить материал"
          onSelect={(file) => void handleUpload(file, "EVIDENCE")}
        />
        <FileList dealId={dealId} files={data.evidenceFiles} />
      </section>
      <PrivacyNote />
    </div>
  );
}

function RequirementCard({
  accept,
  dealId,
  disabled,
  onUpload,
  requirement,
}: {
  accept: string;
  dealId: string;
  disabled: boolean;
  onUpload: (file: File) => void;
  requirement: DealDocumentRequirementResponse;
}) {
  return (
    <Card className="requirement-upload-card">
      <header><span><FileCheck2 size={17} /></span><i><strong>{requirement.title}</strong><small>{requirement.description ?? "Документ по условиям сделки"}</small></i><em>{requirement.required ? "Обязательно" : "Дополнительно"}</em></header>
      <FileList dealId={dealId} files={requirement.uploads} />
      <UploadButton accept={accept} disabled={disabled} label={requirement.uploads.length ? "Загрузить ещё" : "Выбрать файл"} onSelect={onUpload} />
    </Card>
  );
}

function UploadButton({ accept, disabled, label, onSelect }: { accept: string; disabled: boolean; label: string; onSelect: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        accept={accept}
        className="is-visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
          event.target.value = "";
        }}
        ref={input}
        type="file"
      />
      <Button className="document-upload-button" disabled={disabled} onClick={() => input.current?.click()} type="button" variant="outline">
        <Plus size={16} /> {label}
      </Button>
    </>
  );
}

function FileList({ dealId, files }: { dealId: string; files: DealFileResponse[] }) {
  if (!files.length) return null;
  return (
    <div className="uploaded-file-list">
      {files.map((file) => (
        <a href={getDealFileDownloadUrl(dealId, file.id)} key={file.id} rel="noreferrer">
          <span><FileCheck2 size={16} /></span>
          <i><strong>{file.originalName}</strong><small>{formatBytes(file.sizeBytes)} · {file.owner.isCurrentUser ? "ваш файл" : file.owner.displayName} · {fileReviewLabel(file.reviewStatus)}</small>{file.reviewComment ? <em>{file.reviewComment}</em> : null}</i>
          <Download size={16} />
        </a>
      ))}
    </div>
  );
}

function BackTitle({ onBack, title }: { onBack: () => void; title: string }) {
  return <header className="flow-header"><p className="screen-eyebrow">Документы сделки</p><div className="flow-header-row"><div className="flow-header-title"><Button aria-label="Назад" className="flow-back-button" onClick={onBack} size="icon" variant="ghost"><ArrowLeft size={21} /></Button><h1>{title}</h1></div></div></header>;
}

function PrivacyNote() {
  return <Card className="security-note"><LockKeyhole size={18} /><span><strong>Приватное хранение</strong><small>Доступ к каждому файлу заново проверяется сервером.</small></span></Card>;
}

function DocumentsError({ onRetry }: { onRetry: () => void }) {
  return <Card className="form-message is-error"><strong>Не удалось загрузить документы</strong><span>Проверьте соединение и повторите попытку.</span><Button onClick={onRetry} variant="outline"><RefreshCw size={16} /> Повторить</Button></Card>;
}

function DocumentsLoading({ onBack }: { onBack: () => void }) {
  return <div className="screen-content documents-screen"><BackTitle onBack={onBack} title="Документы" /><div className="documents-loading"><Skeleton /><Skeleton /><Skeleton /></div></div>;
}

function formatMegabytes(bytes: number): string { return `${Math.ceil(bytes / 1024 / 1024)} МБ`; }
function formatBytes(bytes: number): string { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(bytes / 1024)} КБ`; }
function fileReviewLabel(status: DealFileResponse["reviewStatus"]): string { return { ACCEPTED: "принят", PENDING: "на проверке", REJECTED: "нужно исправить" }[status]; }
