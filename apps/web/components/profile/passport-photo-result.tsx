"use client";

import { ChevronDown, CircleAlert, ScanLine } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { passportFieldLabels } from "@/lib/ocr/passport-parser";
import { photoQualityDescription, photoIssueDescription } from "@/lib/ocr/photo-assessment";
import type { PhotoCheck } from "./use-passport-photo-checks";

export function PassportPhotoResult({ check, title, stopped, onRetry }: { check?: PhotoCheck; title: string; stopped: boolean; onRetry: () => void }) {
  const result = check?.result;
  const filled = result?.expected.filter(field => result.data[field]).length ?? 0;
  return <section className="passport-photo-result" aria-label={`Результат фото: ${title}`}>
    {check?.quality ? <p className="passport-photo-quality">{photoQualityDescription(check.quality)}</p> : null}
    {check?.status === "error" ? <Alert variant="destructive"><CircleAlert size={18} /><div><AlertTitle>Не удалось проверить фото</AlertTitle><AlertDescription>{check.error}</AlertDescription><Button type="button" variant="ghost" onClick={onRetry}>Повторить проверку</Button></div></Alert>
      : result ? <>
        <Alert role="status"><ScanLine size={18} /><div><AlertTitle>Прочитано {filled} из {result.expected.length} полей</AlertTitle><AlertDescription>{result.issues.length ? `Нужно проверить или дополнить: ${result.issues.length}. Причины указаны ниже.` : "Основные поля прочитаны. Перед переносом проверьте правильность значений."}</AlertDescription></div></Alert>
        <Collapsible defaultOpen={result.issues.length > 0}>
          <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="collapsible-trigger" aria-label={`Результат проверки: ${title}`}>Результат проверки<ChevronDown size={16} className="collapsible-chevron" /></Button></CollapsibleTrigger>
          <CollapsibleContent><ul className="passport-photo-field-results">{result.expected.map(field => {
            const issue = result.issues.find(issue => issue.field === field);
            return <li key={field} className={issue ? "needs-attention" : ""}><div><strong>{passportFieldLabels[field]}</strong><span>{issue ? result.data[field] ? "Нужно сверить" : "Не прочитано" : result.data[field] ? "Прочитано" : "Не указано"}</span></div>
              {issue ? <p>{photoIssueDescription(issue)}</p> : field === "middleName" && !result.data[field] ? <p>Отчество необязательно. Если оно есть в паспорте, заполните вручную.</p> : null}</li>;
          })}</ul></CollapsibleContent>
        </Collapsible>
      </> : <div className="passport-photo-checking" role="status"><span>{stopped ? "Проверка остановлена" : check ? "Проверяем готовый снимок…" : "Фото добавлено. Ожидает проверки…"}</span>{!stopped ? <Progress value={check?.progress ?? 0} aria-label={`Проверка фото: ${title}`} /> : null}</div>}
  </section>;
}
