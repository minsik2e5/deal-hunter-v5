import { useEffect, useRef, useState } from "react";

// 같은 PC에서 실행 중인 "번장 멀티챗" 앱의 연결 창구. 안 읽은 수를 읽고 계정 창을 띄우기만 한다.
// 채팅 발송·쿠키·세션 정보는 다루지 않는다.
const BRIDGE = "http://127.0.0.1:47615";

type TalkChat = { name: string; text: string; n: number };
type TalkAccount = { id: string; name: string; color: string; unread: number; muted: boolean; chatOpen: boolean; chats: TalkChat[] };
type TalkStatus = { accounts: TalkAccount[]; total: number };

const color = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#8b95a1");
const count = (n: number) => (n > 99 ? "99+" : String(n));

export function BunjangTalk() {
  const [status, setStatus] = useState<TalkStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true, timer = 0, fails = 0;
    const tick = async () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch(`${BRIDGE}/status`, { cache: "no-store" });
          if (!r.ok) throw new Error(String(r.status));
          const d = await r.json();
          if (!alive) return;
          setStatus({ accounts: Array.isArray(d.accounts) ? d.accounts : [], total: Number(d.total) || 0 });
          setOffline(false);
          fails = 0;
        } catch {
          if (!alive) return;
          fails++;
          setOffline(true);
        }
      }
      if (alive) timer = window.setTimeout(tick, fails ? 15000 : 3000);
    };
    retryRef.current = tick;
    tick();
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const focus = async (id = "") => {
    try {
      const r = await fetch(`${BRIDGE}/focus`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) throw new Error(String(r.status));
      setOpen(false);
    } catch { setOffline(true); }
  };

  if (!status && !offline) return null; // 첫 확인 전
  if (offline || !status) {
    return <button className="talk-off" onClick={() => retryRef.current()} title="이 PC에서 번장 멀티챗을 켜면 계정별 번개톡 수가 표시됩니다">번개톡 · 멀티챗 꺼짐</button>;
  }

  const { accounts, total } = status;
  return (
    <div className="talk" ref={boxRef}>
      <button className={`talk-btn ${total > 0 ? "has" : ""}`} onClick={() => setOpen(o => !o)} aria-expanded={open} title="번개톡 (번장 멀티챗)">
        <b>번개톡</b>
        {accounts.length === 0 && <span className="talk-none">계정 없음</span>}
        {accounts.map(a => (
          <span key={a.id} className={`talk-acc ${a.unread > 0 ? "on" : ""}`} title={a.name}>
            <i style={{ background: color(a.color) }} />{count(a.unread)}
          </span>
        ))}
      </button>
      {open && (
        <div className="talk-pop" role="dialog" aria-label="번개톡 계정별 현황">
          {accounts.map(a => (
            <section key={a.id}>
              <div className="talk-row">
                <i style={{ background: color(a.color) }} />
                <strong>{a.name}</strong>
                {a.unread > 0 && <em>{count(a.unread)}</em>}
                {a.muted && <small>알림 끔</small>}
                <button onClick={() => focus(a.id)}>열기</button>
              </div>
              {!a.chatOpen && <p className="talk-hint">채팅 목록이 열려 있지 않아 숫자를 못 읽고 있어요.</p>}
              {a.chats.slice(0, 5).map(c => (
                <button key={c.name} className="talk-chat" onClick={() => focus(a.id)}>
                  <span><b>{c.name}</b><small>{c.text || `안 읽은 메시지 ${c.n}개`}</small></span>
                  <em>{count(c.n)}</em>
                </button>
              ))}
            </section>
          ))}
          <button className="talk-open-all" onClick={() => focus("")}>번장 멀티챗 열기</button>
        </div>
      )}
    </div>
  );
}
