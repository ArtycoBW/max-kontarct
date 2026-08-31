"use client";

import type {
  AdminContractTemplate,
  AdminTemplateDocumentRequirementInput,
  AdminTemplateVersion,
} from "@max-contract/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CircleAlert,
  CopyPlus,
  FileCheck2,
  PencilLine,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveAdminTemplateDraft,
  createAdminTemplateDraft,
  getAdminTemplates,
  publishAdminTemplateDraft,
  updateAdminTemplateDraft,
} from "@/lib/api/admin";
import { queryKeys } from "@/lib/api/query-keys";

type PendingAction =
  | { kind: "archive" | "publish"; templateId: string; versionId: string }
  | null;

export function AdminTemplatesView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{
    template: AdminContractTemplate;
    version: AdminTemplateVersion;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const query = useQuery({
    queryFn: getAdminTemplates,
    queryKey: queryKeys.admin.templates(),
    retry: false,
  });
  const refreshTemplates = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.admin.templates() });
  };
  const createDraft = useMutation({
    mutationFn: createAdminTemplateDraft,
    onError: (error: Error) => toast.error(error.message),
    onSuccess: async () => {
      toast.success("Черновая версия создана");
      await refreshTemplates();
    },
  });
  const transition = useMutation({
    mutationFn: async (action: Exclude<PendingAction, null>) =>
      action.kind === "publish"
        ? publishAdminTemplateDraft(action.templateId, action.versionId)
        : archiveAdminTemplateDraft(action.templateId, action.versionId),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: async (_, action) => {
      setEditing(null);
      setPendingAction(null);
      toast.success(
        action.kind === "publish"
          ? "Версия опубликована, предыдущая сохранена в архиве"
          : "Черновая версия перенесена в архив",
      );
      await Promise.all([
        refreshTemplates(),
        queryClient.invalidateQueries({ queryKey: queryKeys.templates.all }),
      ]);
    },
  });

  if (query.isPending) return <AdminTemplatesLoading />;
  if (query.error || !query.data) {
    return <AdminTemplatesError onRetry={() => query.refetch()} />;
  }

  return (
    <div className="admin-templates-view">
      <div className="admin-summary-grid">
        <Card><span>Шаблонов</span><strong>{query.data.total}</strong></Card>
        <Card>
          <span>Опубликовано версий</span>
          <strong>{countVersions(query.data.items, "PUBLISHED")}</strong>
          <small>В каталоге приложения</small>
        </Card>
        <Card>
          <span>Черновиков</span>
          <strong>{countVersions(query.data.items, "DRAFT")}</strong>
          <small>Готовятся к публикации</small>
        </Card>
      </div>

      <div className="admin-template-list">
        {query.data.items.map((template) => {
          const draft = template.versions.find(({ status }) => status === "DRAFT");
          return (
            <Card className="admin-template-card" key={template.id}>
              <header>
                <span>
                  <small>Шаблон договора</small>
                  <strong>{template.title}</strong>
                  <p>{template.summary}</p>
                </span>
                {canManage && !draft ? (
                  <Button
                    disabled={createDraft.isPending}
                    onClick={() => createDraft.mutate(template.id)}
                    type="button"
                    variant="outline"
                  >
                    <CopyPlus size={16} /> Создать версию
                  </Button>
                ) : null}
              </header>

              <div className="admin-version-list">
                {template.versions.map((version) => (
                  <article className="admin-version-row" key={version.id}>
                    <div className="admin-version-summary">
                      <span className={`admin-status is-${version.status.toLowerCase()}`}>
                        {versionStatusLabel(version.status)}
                      </span>
                      <strong>Версия {version.versionNumber}</strong>
                      <small>{versionSummary(version)}</small>
                    </div>
                    <time dateTime={version.updatedAt}>
                      Изменена {formatDateTime(version.updatedAt)}
                    </time>
                    {canManage && version.status === "DRAFT" ? (
                      <div className="admin-version-actions">
                        <Button
                          onClick={() => setEditing({ template, version })}
                          type="button"
                          variant="outline"
                        >
                          <PencilLine size={15} /> Документы
                        </Button>
                        <Button
                          onClick={() => setPendingAction({
                            kind: "publish",
                            templateId: template.id,
                            versionId: version.id,
                          })}
                          type="button"
                        >
                          <Rocket size={15} /> Опубликовать
                        </Button>
                        <Button
                          onClick={() => setPendingAction({
                            kind: "archive",
                            templateId: template.id,
                            versionId: version.id,
                          })}
                          type="button"
                          variant="ghost"
                        >
                          <Archive size={15} /> В архив
                        </Button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !transition.isPending) setPendingAction(null);
        }}
        open={Boolean(pendingAction)}
      >
        <AlertDialogContent>
          <span className="alert-dialog-icon"><CircleAlert size={20} /></span>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === "publish"
                ? "Опубликовать эту версию?"
                : "Перенести черновик в архив?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === "publish"
                ? "Текущая опубликованная версия сохранится в истории."
                : "Черновик останется доступен в истории версий."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button disabled={transition.isPending} type="button" variant="outline">
                Отменить
              </Button>
            </AlertDialogCancel>
            <Button
              disabled={transition.isPending || !pendingAction}
              onClick={() => {
                if (pendingAction) transition.mutate(pendingAction);
              }}
              type="button"
            >
              {transition.isPending ? "Сохраняем…" : "Подтвердить"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editing ? (
        <DocumentRequirementsEditor
          key={editing.version.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.success("Требования к документам сохранены");
            await refreshTemplates();
          }}
          template={editing.template}
          version={editing.version}
        />
      ) : null}
    </div>
  );
}

function DocumentRequirementsEditor({
  onClose,
  onSaved,
  template,
  version,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  template: AdminContractTemplate;
  version: AdminTemplateVersion;
}) {
  const [requirements, setRequirements] = useState<AdminTemplateDocumentRequirementInput[]>(
    version.documentRequirements.map(({ description, key, required, sortOrder, title }) => ({
      description,
      key,
      required,
      sortOrder,
      title,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => updateAdminTemplateDraft(template.id, version.id, {
      documentRequirements: requirements.map((requirement, index) => ({
        ...requirement,
        description: requirement.description?.trim() || null,
        key: requirement.key.trim(),
        sortOrder: (index + 1) * 10,
        title: requirement.title.trim(),
      })),
    }),
    onError: (caught: Error) => setError(caught.message),
    onSuccess: onSaved,
  });
  const updateRequirement = (
    index: number,
    patch: Partial<AdminTemplateDocumentRequirementInput>,
  ) => setRequirements((current) => current.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...patch } : item,
  ));
  const addRequirement = () => {
    setRequirements((current) => [
      ...current,
      {
        description: null,
        key: nextRequirementKey(current),
        required: false,
        sortOrder: (current.length + 1) * 10,
        title: "Новый документ",
      },
    ]);
  };
  const submit = () => {
    const invalidTitle = requirements.find(({ title }) => title.trim().length < 2);
    if (invalidTitle) {
      setError("У каждого документа должно быть название не короче двух символов.");
      return;
    }
    const internalKeys = requirements.map(({ key }) => key.trim());
    if (
      internalKeys.some((key) => !/^[a-z][a-z0-9_]{1,63}$/.test(key)) ||
      new Set(internalKeys).size !== requirements.length
    ) {
      setError("Не удалось подготовить список документов. Обновите страницу и повторите попытку.");
      return;
    }
    setError(null);
    save.mutate();
  };

  return (
    <div className="admin-editor-backdrop" role="presentation">
      <Card aria-labelledby="requirements-title" className="admin-requirements-editor" role="dialog">
        <header>
          <span>
            <small>{template.title}</small>
            <h2 id="requirements-title">Документы · версия {version.versionNumber}</h2>
          </span>
          <Button onClick={onClose} type="button" variant="ghost">Закрыть</Button>
        </header>
        <div className="admin-requirements-list">
          {requirements.map((requirement, index) => (
            <Card className="admin-requirement-form" key={`${requirement.key}-${index}`}>
              <div className="admin-requirement-heading">
                <FileCheck2 size={17} />
                <strong>Документ {index + 1}</strong>
                <Button
                  aria-label={`Удалить документ ${index + 1}`}
                  onClick={() => setRequirements((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  type="button"
                  variant="ghost"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <label>
                Название
                <Input
                  maxLength={160}
                  onChange={(event) => updateRequirement(index, { title: event.target.value })}
                  value={requirement.title}
                />
              </label>
              <label>
                Описание
                <Textarea
                  maxLength={500}
                  onChange={(event) => updateRequirement(index, { description: event.target.value })}
                  rows={2}
                  value={requirement.description ?? ""}
                />
              </label>
              <div className="admin-requirement-footer">
                <label className="admin-required-switch">
                  <Switch
                    checked={requirement.required}
                    onCheckedChange={(checked) => updateRequirement(index, { required: checked })}
                  />
                  Обязательный документ
                </label>
              </div>
            </Card>
          ))}
        </div>
        <Button onClick={addRequirement} type="button" variant="outline">
          <Plus size={16} /> Добавить документ
        </Button>
        {error ? <p className="admin-editor-error"><CircleAlert size={15} /> {error}</p> : null}
        <footer>
          <Button onClick={onClose} type="button" variant="outline">Отменить</Button>
          <Button disabled={save.isPending} onClick={submit} type="button">
            {save.isPending ? "Сохраняем…" : "Сохранить документы"}
          </Button>
        </footer>
      </Card>
    </div>
  );
}

function AdminTemplatesError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="admin-inline-error">
      <CircleAlert size={24} />
      <span><strong>Не удалось загрузить шаблоны</strong><small>Проверьте соединение и повторите попытку.</small></span>
      <Button onClick={onRetry} variant="outline"><RefreshCw size={15} /> Повторить</Button>
    </Card>
  );
}

function AdminTemplatesLoading() {
  return <div className="admin-list-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
}

function countVersions(
  templates: AdminContractTemplate[],
  status: AdminTemplateVersion["status"],
): number {
  return templates.reduce(
    (count, template) => count + template.versions.filter((version) => version.status === status).length,
    0,
  );
}

function questionCount(version: AdminTemplateVersion): number {
  const properties = version.questionnaireSchema.properties;
  return typeof properties === "object" && properties !== null && !Array.isArray(properties)
    ? Object.keys(properties).length
    : 0;
}

function versionSummary(version: AdminTemplateVersion): string {
  const documents = version.documentRequirements.length;
  const questions = questionCount(version);
  return `${documents} ${documentCountLabel(documents)} · ${questions} ${questionCountLabel(questions)} анкеты`;
}

function versionStatusLabel(status: AdminTemplateVersion["status"]): string {
  return { ARCHIVED: "Архив", DRAFT: "Черновик", PUBLISHED: "Опубликован" }[status];
}

function documentCountLabel(value: number): string {
  const last = value % 10;
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "документов";
  if (last === 1) return "документ";
  if (last >= 2 && last <= 4) return "документа";
  return "документов";
}

function questionCountLabel(value: number): string {
  const last = value % 10;
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "полей";
  if (last === 1) return "поле";
  if (last >= 2 && last <= 4) return "поля";
  return "полей";
}

function nextRequirementKey(current: AdminTemplateDocumentRequirementInput[]): string {
  let index = current.length + 1;
  while (current.some(({ key }) => key === `document_${index}`)) index += 1;
  return `document_${index}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
