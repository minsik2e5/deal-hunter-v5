import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// 같은 PC에서 실행 중인 "번장 멀티챗" 앱의 연결 창구. 안 읽은 수를 읽고 계정 창을 띄우기만 한다.
// 채팅 발송·쿠키·세션 정보는 다루지 않는다.
const BRIDGE = "http://127.0.0.1:47615";
const TALK_WEB = "https://m.bunjang.co.kr/talk";
// 번장 멀티챗 Windows 실행 파일 (설치 없이 실행, 항상 최신 버전)
const DOWNLOAD_URL = "https://github.com/minsik2e5/bungae-multichat/releases/latest/download/BungaeMultiChat-portable.exe";

type TalkChat = { name: string; text: string; n: number };
type TalkAccount = { id: string; name: string; color: string; unread: number; muted: boolean; chatOpen: boolean; chats: TalkChat[] };
type TalkStatus = { accounts: TalkAccount[]; total: number; updatedAt: string | null };
type TalkSnapshot = { status: TalkStatus | null; offline: boolean };

const color = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#8b95a1");
const count = (n: number) => (n > 99 ? "99+" : String(n));

/* 헤더와 번개톡 페이지가 함께 쓰는 연결 상태 (요청은 한 곳에서만) */
let snapshot: TalkSnapshot = { status: null, offline: false };
const listeners = new Set<() => void>();
let timer = 0, fails = 0, running = false;

function publish(next: TalkSnapshot) { snapshot = next; listeners.forEach(l => l()); }

async function poll() {
  clearTimeout(timer);
  if (document.visibilityState === "visible") {
    try {
      const r = await fetch(`${BRIDGE}/status`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      publish({ status: { accounts: Array.isArray(d.accounts) ? d.accounts : [], total: Number(d.total) || 0, updatedAt: d.updatedAt || null }, offline: false });
      fails = 0;
    } catch {
      fails++;
      publish({ ...snapshot, offline: true });
    }
  }
  if (listeners.size) timer = window.setTimeout(poll, fails ? 15000 : 3000);
  else running = false;
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!running) { running = true; poll(); window.addEventListener("focus", poll); }
  return () => {
    listeners.delete(l);
    if (!listeners.size) { clearTimeout(timer); running = false; window.removeEventListener("focus", poll); }
  };
}

function useTalk() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

async function focusAccount(id = "") {
  try {
    const r = await fetch(`${BRIDGE}/focus`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) throw new Error(String(r.status));
    return true;
  } catch {
    publish({ ...snapshot, offline: true });
    return false;
  }
}

/* ---------- 상단 헤더: 계정별 숫자 + 펼치기 ---------- */
export function BunjangTalk({ onOpenPage }: { onOpenPage?: () => void }) {
  const { status, offline } = useTalk();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!status && !offline) return null; // 첫 확인 전
  if (offline || !status) {
    return <button className="talk-off" onClick={() => poll()} title="이 PC에서 번장 멀티챗을 켜면 계정별 번개톡 수가 표시됩니다">번개톡 · 멀티챗 꺼짐</button>;
  }

  const { accounts, total } = status;
  const go = async (id = "") => { if (await focusAccount(id)) setOpen(false); };
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
                <button onClick={() => go(a.id)}>열기</button>
              </div>
              {!a.chatOpen && <p className="talk-hint">채팅 목록이 열려 있지 않아 숫자를 못 읽고 있어요.</p>}
              {a.chats.slice(0, 5).map(c => (
                <button key={c.name} className="talk-chat" onClick={() => go(a.id)}>
                  <span><b>{c.name}</b><small>{c.text || `안 읽은 메시지 ${c.n}개`}</small></span>
                  <em>{count(c.n)}</em>
                </button>
              ))}
            </section>
          ))}
          <div className="talk-pop-actions">
            {onOpenPage && <button onClick={() => { setOpen(false); onOpenPage(); }}>번개톡 페이지</button>}
            <button onClick={() => go("")}>번장 멀티챗 열기</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 왼쪽 메뉴 "번개톡" 페이지 ---------- */
export function BunjangTalkPage() {
  const { status, offline } = useTalk();
  const accounts = status?.accounts || [];
  const total = status?.total || 0;
  const waiting = accounts.reduce((s, a) => s + a.chats.length, 0);

  return (
    <div className="talk-page">
      <div className="simple-head compact">
        <div><p className="eyebrow">BUNGAE TALK</p><h1>번개톡</h1><p>번장 멀티챗에 연결된 계정들의 안 읽은 채팅을 한곳에서 확인해요.</p></div>
        <div className="talk-page-actions">
          <a className="talk-web" href={TALK_WEB} target="_blank" rel="noreferrer">번장 톡 웹으로 열기</a>
          <a className="talk-web" href={DOWNLOAD_URL} rel="noreferrer">번장 멀티챗 다운로드</a>
          {!offline && status && <button className="primary" onClick={() => focusAccount("")}>번장 멀티챗 열기</button>}
        </div>
      </div>

      {(offline || !status) ? (
        <section className="card talk-empty">
          <h2>{status === null && !offline ? "번장 멀티챗 연결 확인 중…" : "번장 멀티챗이 꺼져 있어요"}</h2>
          <p>이 PC에서 <b>번장 멀티챗</b>을 켜면 계정별 안 읽은 채팅이 여기에 나와요.</p>
          <p>아직 없다면 받아서 바로 실행하세요. 설치 없이 켜지는 Windows 프로그램이에요. 처음 실행 때 "PC 보호" 경고가 뜨면 <b>추가 정보 → 실행</b>을 누르세요.</p>
          <a className="primary talk-download" href={DOWNLOAD_URL} rel="noreferrer">번장 멀티챗 다운로드 (Windows)</a>
          <p className="muted">휴대폰이나 다른 PC에서는 멀티챗에 연결할 수 없어요. 위의 <b>번장 톡 웹으로 열기</b>로 그 기기에 로그인된 계정의 채팅을 열 수 있어요.</p>
          {offline && <button className="ghost-btn" onClick={() => poll()}>다시 연결</button>}
        </section>
      ) : (
        <>
          <div className="talk-kpis">
            <div><span>연결된 계정</span><b>{accounts.length}개</b></div>
            <div className={total > 0 ? "hot" : ""}><span>안 읽은 메시지</span><b>{total}개</b></div>
            <div><span>답장 기다리는 대화방</span><b>{waiting}곳</b></div>
          </div>
          <div className="talk-grid">
            {accounts.map(a => (
              <section key={a.id} className="card talk-card" style={{ borderTopColor: color(a.color) }}>
                <div className="talk-row">
                  <i style={{ background: color(a.color) }} />
                  <strong>{a.name}</strong>
                  {a.unread > 0 && <em>{count(a.unread)}</em>}
                  {a.muted && <small>알림 끔</small>}
                  <button onClick={() => focusAccount(a.id)}>열기</button>
                </div>
                {!a.chatOpen && <p className="talk-hint">멀티챗에서 이 계정이 채팅 목록 화면이 아니라서 숫자를 못 읽고 있어요.</p>}
                {a.chatOpen && a.chats.length === 0 && <p className="talk-quiet">새 메시지 없음</p>}
                {a.chats.map(c => (
                  <button key={c.name} className="talk-chat" onClick={() => focusAccount(a.id)}>
                    <span><b>{c.name}</b><small>{c.text || `안 읽은 메시지 ${c.n}개`}</small></span>
                    <em>{count(c.n)}</em>
                  </button>
                ))}
              </section>
            ))}
            {accounts.length === 0 && <section className="card talk-empty"><p>멀티챗에 연결된 계정이 없어요. 멀티챗에서 <b>계정 추가</b>를 눌러 주세요.</p></section>}
          </div>
          {status.updatedAt && <p className="talk-updated">마지막 확인 {new Date(status.updatedAt).toLocaleTimeString("ko-KR")} · 3초마다 자동 갱신</p>}
        </>
      )}
    </div>
  );
}
