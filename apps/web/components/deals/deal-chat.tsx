"use client";
import type { DealMessagesResponse, DealStatus, SendDealMessageRequest } from "@max-contract/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, LoaderCircle, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInput } from "@/components/ui/voice-input";
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
  const olderScroll = useRef<{ height: number; top: number } | null>(null);
  const [hasNew, setHasNew] = useState(false);
  const [dictating, setDictating] = useState(false);
  const inputId = useId();
  const editable = !["SIGNED_BY_ONE", "SIGNED", "COMPLETED", "CANCELED"].includes(status);
  const messages = useInfiniteQuery({
    queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiRequest<DealMessagesResponse>(`deals/${dealId}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: data => data.nextCursor ?? undefined,
    refetchInterval: 5000, retry: false,
  });
  const items = [...new Map((messages.data?.pages.slice().reverse().flatMap(page => page.items) ?? []).map(item => [item.id, item])).values()];
  const newestId = items.at(-1)?.id;
  const oldestId = items[0]?.id;
  useLayoutEffect(() => {
    if (log.current && olderScroll.current) {
      log.current.scrollTop = olderScroll.current.top + log.current.scrollHeight - olderScroll.current.height;
      olderScroll.current = null;
    }
  }, [oldestId]);
  useEffect(() => {
    if (!log.current || !newestId) return;
    if (atBottom.current) log.current.scrollTop = log.current.scrollHeight;
    else setHasNew(true);
  }, [newestId]);
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { if (atBottom.current) element.scrollTop = element.scrollHeight; });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
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
  const updateBody = (text: string) => { setBody(text); pendingId.current = null; send.reset(); };
  return <Card className="deal-chat"><h2>Чат сделки</h2><p className="field-description">Переписка доступна только участникам этой сделки.</p>
    <div className="deal-chat-timeline">
    <div ref={log} className="deal-chat-log" role="log" aria-label="Сообщения сделки" aria-live="polite" onScroll={() => { const el = log.current; if (el) { atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; if (atBottom.current) setHasNew(false); } }}>
      {messages.hasNextPage ? <Button className="deal-chat-older" variant="ghost" disabled={messages.isFetchingNextPage} onClick={() => { if (log.current) olderScroll.current = { height: log.current.scrollHeight, top: log.current.scrollTop }; void messages.fetchNextPage().then(result => { if (result.isError) olderScroll.current = null; }); }}>Ранние сообщения</Button> : null}
      {items.map((item, index) => <Fragment key={item.id}>
        {index === 0 || new Date(items[index - 1]!.createdAt).toDateString() !== new Date(item.createdAt).toDateString() ? <div className="deal-chat-day">{new Date(item.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</div> : null}
        <article className={item.isCurrentUser ? "deal-chat-message is-own" : "deal-chat-message"} aria-label={item.isCurrentUser ? "Ваше сообщение" : `Сообщение: ${item.authorName}`}>
        {!item.isCurrentUser ? <header><strong>{item.authorName}</strong></header> : null}
        {item.kind === "CHANGE_REQUEST" ? <small>Предложение изменений · версия {item.versionNumber}</small> : null}
        <p>{item.body}</p>
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time>
      </article></Fragment>)}
      {messages.isPending ? <p className="deal-chat-empty" role="status">Загружаем переписку…</p> : !messages.error && !items.length ? <div className="deal-chat-empty"><MessageCircle size={28} /><strong>Обсудите детали сделки</strong><span>Сообщения видны только вам и второй стороне.</span></div> : null}
    </div>
    {hasNew ? <Button className="deal-chat-new" variant="outline" onClick={() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; atBottom.current = true; setHasNew(false); }}><ArrowDown size={15} /> К новым сообщениям</Button> : null}
    </div>
    <form className="deal-chat-composer" onSubmit={event => { event.preventDefault(); if (!send.isPending && !dictating && body.trim()) send.mutate(); }}>
    {messages.error ? <p role="alert">Не удалось загрузить переписку. <Button variant="ghost" onClick={() => void messages.refetch()}>Повторить</Button></p> : null}
    {editable ? <div className="deal-chat-mode" role="group" aria-label="Тип сообщения">
      <Button type="button" variant="ghost" aria-pressed={kind === "MESSAGE"} disabled={send.isPending} onClick={() => { if (kind !== "MESSAGE") { setKind("MESSAGE"); pendingId.current = null; send.reset(); } }}>Сообщение</Button>
      <Button type="button" variant="ghost" aria-pressed={kind === "CHANGE_REQUEST"} disabled={send.isPending} onClick={() => { if (kind !== "CHANGE_REQUEST") { setKind("CHANGE_REQUEST"); pendingId.current = null; send.reset(); } }}>Предложить изменения</Button>
    </div> : null}
    {kind === "CHANGE_REQUEST" && editable ? <p className="field-description">Предложение отправится в чат. Изменения договора стороны согласуют отдельно.</p> : null}
    <div className="deal-chat-input-row">
    <Textarea id={inputId} className="deal-chat-input" aria-label="Сообщение участнику сделки" maxLength={4000} rows={3} value={body} disabled={send.isPending} onChange={e => updateBody(e.target.value)} placeholder="Напишите сообщение" />
    <VoiceInput iconOnly inputId={inputId} value={body} onChange={updateBody} disabled={send.isPending} maxLength={4000} onActiveChange={setDictating} />
    <Button className="deal-chat-send" type="submit" size="icon" aria-label={send.isPending ? "Отправляем…" : "Отправить сообщение"} title={dictating ? "Завершите диктовку перед отправкой" : "Отправить сообщение"} disabled={send.isPending || dictating || !body.trim()}>{send.isPending ? <LoaderCircle size={19} /> : <Send size={19} />}</Button>
    </div>
    {send.error ? <p role="alert" className="field-error">{send.error.message}</p> : null}
    </form>
  </Card>;
}
