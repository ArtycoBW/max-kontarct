"use client";
import type { DealMessagesResponse, DealStatus, SendDealMessageRequest } from "@max-contract/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api/client";

export function DealChat({ dealId, status, draft, onDraftChange, draftKind, onKindChange }: { dealId: string; status: DealStatus; draft?: string; onDraftChange?: (text: string) => void; draftKind?: SendDealMessageRequest["kind"]; onKindChange?: (kind: SendDealMessageRequest["kind"]) => void }) {
  const queryClient = useQueryClient();
  const key = ["deal-chat", dealId];
  const [localBody, setLocalBody] = useState("");
  const body = draft ?? localBody;
  const setBody = onDraftChange ?? setLocalBody;
  const [localKind, setLocalKind] = useState<SendDealMessageRequest["kind"]>("MESSAGE");
  const kind = draftKind ?? localKind;
  const setKind = onKindChange ?? setLocalKind;
  const pendingId = useRef<string | null>(null);
  const pendingKind = useRef<SendDealMessageRequest["kind"] | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const editable = !["SIGNED_BY_ONE", "SIGNED", "COMPLETED", "CANCELED"].includes(status);
  const messages = useInfiniteQuery({
    queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiRequest<DealMessagesResponse>(`deals/${dealId}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: data => data.nextCursor ?? undefined,
    refetchInterval: 5000, retry: false,
  });
  const items = [...new Map((messages.data?.pages.slice().reverse().flatMap(page => page.items) ?? []).map(item => [item.id, item])).values()];
  const newestId = items.at(-1)?.id;
  useEffect(() => { if (log.current && atBottom.current) log.current.scrollTop = log.current.scrollHeight; }, [newestId]);
  const send = useMutation({
    mutationFn: () => {
      const outgoingKind = editable ? kind : "MESSAGE";
      if (pendingKind.current !== outgoingKind) pendingId.current = null;
      pendingKind.current = outgoingKind;
      pendingId.current ??= crypto.randomUUID();
      return apiRequest(`deals/${dealId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: body.trim(), kind: outgoingKind, clientId: pendingId.current }) });
    },
    onSuccess: async () => { setBody(""); pendingId.current = null; atBottom.current = true; await queryClient.invalidateQueries({ queryKey: key }); },
  });
  return <Card className="deal-chat"><h2>Чат сделки</h2><p className="field-description">Переписка доступна только участникам этой сделки.</p>
    {messages.hasNextPage ? <Button variant="ghost" disabled={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>Ранние сообщения</Button> : null}
    <div ref={log} className="deal-chat-log" role="log" aria-label="Сообщения сделки" aria-live="polite" onScroll={() => { const el = log.current; if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      {items.map(item => <article className={item.isCurrentUser ? "deal-chat-message is-own" : "deal-chat-message"} key={item.id}>
        <header><strong>{item.isCurrentUser ? "Вы" : item.authorName}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></header>
        {item.kind === "CHANGE_REQUEST" ? <small>Предложение изменений · версия {item.versionNumber}</small> : null}
        <p>{item.body}</p>
      </article>)}
      {!messages.isPending && !items.length ? <p className="field-description">Обсудите предмет, приложения и необходимые изменения.</p> : null}
    </div>
    {messages.error ? <p role="alert">Не удалось загрузить переписку. <Button variant="ghost" onClick={() => void messages.refetch()}>Повторить</Button></p> : null}
    {editable ? <Select value={kind} onValueChange={next => { setKind(next as SendDealMessageRequest["kind"]); pendingId.current = null; }} disabled={send.isPending}><SelectTrigger aria-label="Тип сообщения"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MESSAGE">Сообщение</SelectItem><SelectItem value="CHANGE_REQUEST">Предложить изменения</SelectItem></SelectContent></Select> : null}
    {kind === "CHANGE_REQUEST" && editable ? <p className="field-description">Предложение не изменяет договор автоматически. Инициатор готовит новую редакцию, которую обе стороны согласуют заново.</p> : null}
    <Textarea aria-label="Сообщение участнику сделки" maxLength={4000} rows={3} value={body} disabled={send.isPending} onChange={e => { setBody(e.target.value); pendingId.current = null; send.reset(); }} placeholder="Напишите сообщение" />
    {send.error ? <p role="alert" className="field-error">{send.error.message}</p> : null}
    <Button disabled={send.isPending || !body.trim()} onClick={() => send.mutate()}>{send.isPending ? "Отправляем…" : "Отправить сообщение"}</Button>
  </Card>;
}
