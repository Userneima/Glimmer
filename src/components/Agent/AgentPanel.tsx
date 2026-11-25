import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Bot, X, Send, RotateCcw, Loader2, PenLine, Square, Clock } from 'lucide-react';
import { isTauriRuntime } from '../../utils/desktopStore';
import { t } from '../../i18n';

// 时间实际去了哪几件事。看板上半屏的「实际时间流向」就是这份数据。
type FlowRow = {
  name: string;
  /** git 根目录。同名项目（比如两个 Skardi 检出）靠它区分，列表的 key 用这个。 */
  root: string;
  hours: number;
  share: number;
  last_seen_days: number;
  merged_from: string[];
};
type Flow = { days: number; total_hours: number; projects: FlowRow[] };

type Turn = { role: 'me' | 'agent'; text: string; flow?: Flow };
type Box = { x: number; y: number; w: number; h: number };

// 跑批边跑边发来的进度。它在想什么、正在写哪份文件，都是从这里来的。
type Progress = {
  phase: string;
  records: number | null;
  thinkTokens: number;
  files: string[];
  tail: string;
  tailOf: 'thinking' | 'text';
};

const NO_PROGRESS: Progress = {
  phase: '', records: null, thinkTokens: 0, files: [], tail: '', tailOf: 'thinking',
};

// 实时那一段只留个尾巴。它是"还活着"的证据，不是给人读完的正文——
// 写完的日记下面会完整显示一遍。
// 短到不会把面板撑开：四行以内，自然排版，不用再套滚动条。
const TAIL_CHARS = 110;

interface AgentChatResult {
  reply: string;
  sessionId: string | null;
  costUsd: number;
  isError: boolean;
}

interface AgentDailyResult {
  date: string;
  diary: string;
  costUsd: number;
  records: number;
  pushed: boolean;
  pushError: string;
  revisited: string;
  pending: string;
}

// 开场白只是给他几个现成的起手式，不是功能清单。
const OPENERS = ['现在各个项目什么情况', '最近哪件事该做没做'];

// 本机时区的今天。日记按天存，用 UTC 会在他常见的凌晨时段写到前一天去。
const todayLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const AgentPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [spent, setSpent] = useState(0);
  const [waitingFor, setWaitingFor] = useState('');
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  const [stopping, setStopping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // 位置和尺寸自己管，并记住上次放哪。默认右下角，但可以拖到任何地方。
  const [box, setBox] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('agent_panel_box') || 'null');
      if (saved && typeof saved.x === 'number') return saved as Box;
    } catch { /* 存坏了就用默认值 */ }
    return { x: window.innerWidth - 460, y: window.innerHeight - 620, w: 420, h: 560 };
  });
  const dragRef = useRef<{ mode: 'move' | 'resize'; dx: number; dy: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('agent_panel_box', JSON.stringify(box));
  }, [box]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      setBox((b) => d.mode === 'move'
        ? { ...b, x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - d.dx)),
                  y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.dy)) }
        : { ...b, w: Math.max(320, e.clientX - b.x + d.dx),
                  h: Math.max(280, e.clientY - b.y + d.dy) });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy]);

  // 跑批的进度。写一篇日记要几分钟，之前这几分钟界面上只有一个转圈，
  // 分不清它在干活还是卡死了，也没有能叫停的把手。
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const pending = listen<Record<string, unknown>>('agent-progress', (e) => {
      const ev = e.payload || {};
      setProgress((p) => {
        switch (ev.kind) {
          case 'phase':
            return { ...p, phase: String(ev.text || '') };
          case 'records':
            return { ...p, records: Number(ev.n) || 0 };
          case 'think':
            return { ...p, thinkTokens: Number(ev.tokens) || 0 };
          case 'file': {
            const path = String(ev.path || '');
            // 换文件就把尾巴清掉，否则上一份的结尾会挂在新文件名底下。
            return p.files.includes(path)
              ? p
              : { ...p, files: [...p.files, path], tail: '' };
          }
          case 'delta': {
            const of = ev.of === 'text' ? 'text' : 'thinking';
            // 从"在想"切到"在写"时另起一段，两者不要粘在一起。
            const base = of === p.tailOf ? p.tail : '';
            return { ...p, tailOf: of, tail: (base + String(ev.text || '')).slice(-TAIL_CHARS) };
          }
          default:
            return p;
        }
      });
    });
    return () => { void pending.then((un) => un()); };
  }, []);

  // 桌面端才有 Agent。Web 端没有可以跑它的进程，整个面板不渲染。
  if (!isTauriRuntime()) return null;

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput('');
    setTurns((prev) => [...prev, { role: 'me', text: prompt }]);
    setBusy(true);
    try {
      const res = await invoke<AgentChatResult>('agent_chat', {
        payload: { prompt, sessionId },
      });
      setSessionId(res.sessionId ?? sessionId);
      setSpent((prev) => prev + (res.costUsd || 0));
      setTurns((prev) => [...prev, { role: 'agent', text: res.reply || '(没有返回内容)' }]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { role: 'agent', text: `出错了：${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  // 写日记不走聊天那条路。聊天里的 Agent 只有读写工具、没有 Bash，也弹不出批准框，
  // 而收集今天的材料要翻 ~/.claude/projects，它够不着。这里直接把工作台的跑批拉起来：
  // 抽取、清洗、提示词、失败回滚、git 提交都在那个脚本里，已经跑通九天。
  const runDaily = async () => {
    if (busy) return;
    setTurns((prev) => [...prev, { role: 'me', text: t('Write today\'s diary') }]);
    setBusy(true);
    setProgress(NO_PROGRESS);
    setStopping(false);
    setWaitingFor(t('Reading what you said today, then writing the diary and project notes. A few minutes.'));
    try {
      const res = await invoke<AgentDailyResult>('agent_daily', {
        payload: { date: todayLocal() },
      });
      setSpent((prev) => prev + (res.costUsd || 0));
      // 只写进工作台。日记列表是他自己写的地方，不再往那边推。
      const where = '已经存好，在工作台里。';
      setTurns((prev) => [
        ...prev,
        {
          role: 'agent',
          text: `${res.date}，读了今天 ${res.records} 条记录，${where}\n\n${res.diary.trim()}`,
        },
        // 下面两条绝大多数天都是空的。放在日记后面，因为它们最容易被忽略、也最值钱。
        ...(res.revisited
          ? [{ role: 'agent' as const, text: `这些今天又在重新权衡，之前定过：\n\n${res.revisited}` }]
          : []),
        // 只有「有外部期限或等待方」才会出现。它不排优先级，只把事实和谁在等摆出来。
        ...(res.pending
          ? [{ role: 'agent' as const, text: `有事搁着，而外面有人在等：\n\n${res.pending}` }]
          : []),
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { role: 'agent', text: `${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setBusy(false);
      setWaitingFor('');
      setProgress(NO_PROGRESS);
      setStopping(false);
    }
  };

  // 时间去哪了。**这条不叫 Agent，一分额度都不花**，所以可以随便点。
  // 归并和统计是机械活（脚本干），该做没做那层判断才需要大脑（还没做）。
  const runTimeflow = async () => {
    if (busy) return;
    setTurns((prev) => [...prev, { role: 'me', text: t('Where did the time go') }]);
    setBusy(true);
    try {
      const flow = await invoke<Flow>('agent_timeflow', { days: 7 });
      setTurns((prev) => [
        ...prev,
        {
          role: 'agent',
          text: `近 ${flow.days} 天一共 ${flow.total_hours} 小时。这是和 AI 一起干活的时间，`
            + `按 15 分钟的空档切，所以是个上限——**比例才是该看的**。\n`
            + `开会、和同事说话、看东西、想事情，一条记录都不留。`,
          flow,
        },
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { role: 'agent', text: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setBusy(false);
    }
  };

  // 叫停。后端给整个进程组发信号，跑批收到后会把产出恢复回跑之前——
  // 停下来不该留半份日记。这里不改 busy，等 runDaily 那边自己收尾。
  const stopDaily = async () => {
    setStopping(true);
    try {
      await invoke<boolean>('agent_stop');
    } catch (err) {
      setStopping(false);
      setTurns((prev) => [
        ...prev,
        { role: 'agent', text: err instanceof Error ? err.message : String(err) },
      ]);
    }
  };

  // 续接同一个会话每轮约 $0.02，开新话题要重建约 4 万 token 的上下文、约 $0.23。
  // 所以这必须是个显式动作，不能自动开新的。
  const newTopic = () => {
    setSessionId(null);
    setTurns([]);
  };

  // 一行摘要：读了多少、想了多久、正在写哪份。都是它自己报的，不是猜的。
  const progressMeta = [
    progress.records !== null ? `${progress.records} 条记录` : '',
    progress.thinkTokens > 0
      ? `想了 ${progress.thinkTokens >= 1000
          ? `${(progress.thinkTokens / 1000).toFixed(1)}k`
          : progress.thinkTokens}`
      : '',
    progress.files.length ? `正在写 ${progress.files[progress.files.length - 1]}` : '',
  ].filter(Boolean).join(' · ');

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg
                   flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ background: 'var(--glimmer-accent, #3b82f6)', color: '#fff' }}
        title={t('Agent')}
      >
        <Bot size={20} />
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 flex flex-col rounded-2xl shadow-2xl border overflow-hidden"
      style={{
        left: box.x, top: box.y, width: box.w, height: box.h,
        borderColor: 'var(--glimmer-border)',
        // 实心背景。半透明会把下面的日记透上来，读不清。
        background: 'var(--glimmer-solid, #ffffff)',
        color: 'var(--glimmer-text, inherit)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b select-none cursor-move"
           style={{ borderColor: 'var(--glimmer-border)' }}
           onMouseDown={(e) => {
             if ((e.target as HTMLElement).closest('button')) return;   // 点按钮不拖
             dragRef.current = { mode: 'move', dx: e.clientX - box.x, dy: e.clientY - box.y };
           }}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot size={16} />
          <span>{t('Agent')}</span>
          {spent > 0 && (
            <span className="text-xs opacity-50">${spent.toFixed(3)}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => void runTimeflow()} disabled={busy}
                  className="p-1.5 rounded-lg hover:bg-black/5 disabled:opacity-30"
                  title={t('Where did the time go')}>
            <Clock size={14} />
          </button>
          <button onClick={() => void runDaily()} disabled={busy}
                  className="p-1.5 rounded-lg hover:bg-black/5 disabled:opacity-30"
                  title={t('Write today\'s diary')}>
            <PenLine size={14} />
          </button>
          <button onClick={newTopic} className="p-1.5 rounded-lg hover:bg-black/5"
                  title={t('New topic (starts a fresh session)')}>
            <RotateCcw size={14} />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {turns.length === 0 && (
          <div className="space-y-2 pt-6">
            <p className="opacity-50 text-xs">{t('It reads your workbench: background, project state, and what you said to AI today.')}</p>
            <button onClick={() => void runDaily()} disabled={busy}
                    className="flex w-full items-center gap-2 px-3 py-2 rounded-xl border text-xs
                               transition-colors hover:border-blue-400 disabled:opacity-40"
                    style={{ borderColor: 'var(--glimmer-border)' }}>
              <PenLine size={13} className="opacity-60" />
              {t('Write today\'s diary')}
            </button>
            <button onClick={() => void runTimeflow()} disabled={busy}
                    className="flex w-full items-center gap-2 px-3 py-2 rounded-xl border text-xs
                               transition-colors hover:border-blue-400 disabled:opacity-40"
                    style={{ borderColor: 'var(--glimmer-border)' }}>
              <Clock size={13} className="opacity-60" />
              {t('Where did the time go')}
              <span className="ml-auto opacity-40">{t('free')}</span>
            </button>
            {OPENERS.map((o) => (
              <button key={o} onClick={() => send(o)}
                      className="block w-full text-left px-3 py-2 rounded-xl border text-xs
                                 transition-colors hover:border-blue-400"
                      style={{ borderColor: 'var(--glimmer-border)' }}>
                {o}
              </button>
            ))}
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={turn.role === 'me' ? 'text-right' : ''}>
            <div
              className={`inline-block max-w-[92%] px-3 py-2 rounded-2xl whitespace-pre-wrap text-left ${
                turn.role === 'me' ? 'rounded-br-sm' : 'rounded-bl-sm'
              }`}
              style={
                turn.role === 'me'
                  ? { background: 'var(--glimmer-accent, #3b82f6)', color: '#fff' }
                  : { background: 'var(--glimmer-surface, rgba(127,127,127,.12))' }
              }
            >
              {turn.text}
            </div>
            {turn.flow && (
              <div className="mt-2 space-y-1">
                {turn.flow.projects.map((p) => (
                  <div key={p.root} className="relative rounded-lg overflow-hidden">
                    {/* 占比做成一条淡底色。柱状图会把这个小面板变成仪表盘，
                        而这里要的只是"哪几件事吃掉了时间"这一眼。 */}
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${p.share}%`,
                        background: 'var(--glimmer-accent, #3b82f6)',
                        opacity: 0.1,
                      }}
                    />
                    <div className="relative flex items-baseline gap-2 px-2 py-1 text-[11px]">
                      <span className="flex-1 truncate">{p.name}</span>
                      {/* 三天没碰才说，天天报"0 天前"就成了噪音。 */}
                      {p.last_seen_days >= 3 && (
                        <span className="opacity-40">{p.last_seen_days} 天没碰</span>
                      )}
                      <span className="opacity-50 tabular-nums">{p.hours}h</span>
                      <span className="opacity-70 tabular-nums w-10 text-right">{p.share}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="rounded-xl border px-3 py-2 space-y-1.5"
               style={{ borderColor: 'var(--glimmer-border)' }}>
            <div className="flex items-center gap-2 text-xs">
              <Loader2 size={13} className="animate-spin shrink-0 opacity-50" />
              <span className="flex-1 opacity-70">
                {progress.phase || waitingFor || t('Thinking, this can take a few minutes...')}
              </span>
              {/* 只有跑批停得下来（后端记着它的进程组）。聊天那条路没有把手，就不摆一个假按钮。 */}
              {waitingFor && (
                <button onClick={() => void stopDaily()} disabled={stopping}
                        className="flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-lg text-[11px]
                                   opacity-50 hover:opacity-100 hover:bg-black/5 disabled:opacity-30">
                  <Square size={9} fill="currentColor" />
                  {stopping ? t('Stopping...') : t('Stop')}
                </button>
              )}
            </div>
            {progressMeta && <div className="text-[11px] opacity-40">{progressMeta}</div>}
            {progress.tail && (
              <div className="text-[11px] leading-relaxed opacity-35 whitespace-pre-wrap break-words">
                {progress.tailOf === 'thinking' && <span className="opacity-70">在想：</span>}
                {progress.tail}
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 p-3 border-t" style={{ borderColor: 'var(--glimmer-border)' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder={t('Say something...')}
          className="flex-1 resize-none bg-transparent outline-none text-sm max-h-28 py-1.5"
          disabled={busy}
        />
        <button onClick={() => void send(input)} disabled={busy || !input.trim()}
                className="p-2 rounded-xl disabled:opacity-30 transition-opacity"
                style={{ background: 'var(--glimmer-accent, #3b82f6)', color: '#fff' }}>
          <Send size={14} />
        </button>
      </div>

      <div
        onMouseDown={(e) => {
          dragRef.current = { mode: 'resize', dx: box.x + box.w - e.clientX, dy: box.y + box.h - e.clientY };
        }}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        style={{ background: 'linear-gradient(135deg, transparent 50%, var(--glimmer-border) 50%)' }}
      />
    </div>
  );
};
