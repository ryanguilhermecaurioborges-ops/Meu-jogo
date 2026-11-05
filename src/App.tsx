import { useCallback, useEffect, useRef, useState } from "react";
import {
  CUP_MAX,
  DRINKS,
  INITIAL,
  type Save,
  cupCost,
  cupMult,
  fmt,
  helperCost,
  load,
  perSecond,
  perSip,
  persist,
  wipe,
} from "./game/data";
import { CupIcon, Npc, type Popup } from "./game/Npc";

type Tab = "bebidas" | "upgrades";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function beep(freq: number, dur = 0.08, type: OscillatorType = "sine", vol = 0.06) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = ((beep as unknown as { ctx?: AudioContext }).ctx ||= new AC());
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [game, setGame] = useState<Save>(() => load());
  const [tab, setTab] = useState<Tab>("bebidas");
  const [sipKey, setSipKey] = useState(0);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [speech, setSpeech] = useState("Olá! Só tenho água... me ajuda a evoluir?");
  const [sound, setSound] = useState(true);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const gameRef = useRef(game);
  gameRef.current = game;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const popId = useRef(0);

  /* ---------- salvar ---------- */
  useEffect(() => {
    const t = setTimeout(() => persist(game), 400);
    return () => clearTimeout(t);
  }, [game]);
  useEffect(() => {
    const save = () => persist(gameRef.current);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, []);

  /* ---------- instalar PWA ---------- */
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvt(null);
      setShowInstall(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installEvt) {
      await installEvt.prompt();
      await installEvt.userChoice;
      setInstallEvt(null);
    } else {
      setShowInstall(true);
    }
  };

  /* ---------- ações ---------- */
  const say = (idx: number) => {
    const p = DRINKS[idx].phrases;
    setSpeech(p[Math.floor(Math.random() * p.length)]);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const sip = useCallback((manual: boolean) => {
    const g = gameRef.current;
    const gain = perSip(g);
    setSipKey((k) => k + 1);
    setGame((s) => {
      const v = perSip(s);
      return { ...s, money: s.money + v, totalEarned: s.totalEarned + v, sips: s.sips + 1 };
    });
    if (manual) {
      const id = ++popId.current;
      const x = 38 + Math.random() * 24;
      setPopups((p) => [...p.slice(-6), { id, x, text: `+$${fmt(gain)}` }]);
      setTimeout(() => setPopups((p) => p.filter((q) => q.id !== id)), 900);
      if (soundRef.current) beep(380 + g.selected * 70 + Math.random() * 40, 0.09, "triangle");
      if (Math.random() < 0.12) say(g.selected);
    }
  }, []);

  /* ajudante automático */
  useEffect(() => {
    const id = setInterval(() => {
      const g = gameRef.current;
      if (g.helper <= 0) return;
      const gain = perSecond(g) * 0.25;
      setGame((s) => ({ ...s, money: s.money + gain, totalEarned: s.totalEarned + gain }));
    }, 250);
    const anim = setInterval(() => {
      if (gameRef.current.helper > 0) setSipKey((k) => k + 1);
    }, 1400);
    return () => {
      clearInterval(id);
      clearInterval(anim);
    };
  }, []);

  const buyDrink = (i: number) => {
    const g = gameRef.current;
    const d = DRINKS[i];
    if (i !== g.owned || g.money < d.price) return;
    setGame({ ...g, money: g.money - d.price, owned: g.owned + 1, selected: i });
    setSpeech(`Novo drink: ${d.name}! ${d.phrases[0]}`);
    if (soundRef.current) {
      beep(520, 0.12, "square", 0.04);
      setTimeout(() => beep(780, 0.2, "square", 0.04), 110);
    }
    showToast(`🎉 ${d.name} desbloqueado!`);
  };

  const selectDrink = (i: number) => {
    if (i >= gameRef.current.owned) return;
    setGame((s) => ({ ...s, selected: i }));
    say(i);
  };

  const buyCup = () => {
    const g = gameRef.current;
    if (g.cup >= CUP_MAX || g.money < cupCost(g.cup)) return;
    setGame({ ...g, money: g.money - cupCost(g.cup), cup: g.cup + 1 });
    if (soundRef.current) beep(660, 0.15, "square", 0.04);
    setSpeech("Copão maior! Mais dinheiro por gole!");
  };

  const buyHelper = () => {
    const g = gameRef.current;
    if (g.money < helperCost(g.helper)) return;
    setGame({ ...g, money: g.money - helperCost(g.helper), helper: g.helper + 1 });
    if (soundRef.current) beep(600, 0.15, "square", 0.04);
    setSpeech("Estou bebendo sozinho agora!");
  };

  const doReset = () => {
    wipe();
    setGame({ ...INITIAL });
    setShowReset(false);
    setSpeech("Recomeçando só com água...");
  };

  const cur = DRINKS[game.selected];
  const next = DRINKS[game.owned] as (typeof DRINKS)[number] | undefined;
  const nextPct = next ? Math.min(100, (game.money / next.price) * 100) : 100;

  return (
    <div
      className="mx-auto flex h-full w-full max-w-xl flex-col overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at 50% 28%, ${cur.accent}33 0%, transparent 60%), linear-gradient(180deg,#2b150c 0%,#1e100a 100%)`,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Multiplayer /> {/* ---------- topo ---------- */}
      <header className="flex items-start justify-between gap-2 px-4 pt-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-200/60">Dinheiro</div>
          <div className="text-4xl font-black leading-none text-amber-300 drop-shadow">
            ${fmt(Math.floor(game.money))}
          </div>
          <div className="mt-1 text-xs font-semibold text-amber-100/70">
            +${fmt(perSip(game))}/gole
            {game.helper > 0 && <> · +${fmt(perSecond(game))}/s</>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!installed && (
            <button
              onClick={handleInstall}
              className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-emerald-950 shadow active:scale-95"
            >
              📲 Instalar
            </button>
          )}
          <button
            onClick={() => setSound((s) => !s)}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-sm active:scale-95"
            aria-label="Som"
          >
            {sound ? "🔊" : "🔇"}
          </button>
          <button
            onClick={() => setShowReset(true)}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-sm active:scale-95"
            aria-label="Reiniciar"
          >
            ↺
          </button>
        </div>
      </header>

      {/* ---------- NPC ---------- */}
      <section className="relative px-4 pt-1">
        <Npc index={game.selected} sipKey={sipKey} speech={speech} popups={popups} onSip={() => sip(true)} />
        <div className="-mt-1 text-center">
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-100/50">Bebendo agora</div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-lg font-black" style={{ color: cur.accent }}>
              {cur.name}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                game.selected === 7 ? "rank-god" : ""
              }`}
              style={game.selected === 7 ? undefined : { background: cur.accent, color: "#1c1917" }}
            >
              {cur.rank}
            </span>
          </div>
          <div className="text-[11px] text-amber-100/50">Toque no Bino para beber!</div>
        </div>

        {/* progresso para a próxima bebida */}
        {next && (
          <div className="mt-2">
            <div className="mb-0.5 flex justify-between text-[10px] font-bold text-amber-100/60">
              <span>Próxima: {next.name}</span>
              <span>
                ${fmt(Math.floor(game.money))} / ${fmt(next.price)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${nextPct}%`, background: `linear-gradient(90deg, ${next.color[1]}, ${next.accent})` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ---------- painel ---------- */}
      <section className="mt-3 flex min-h-0 flex-1 flex-col rounded-t-3xl bg-black/35 shadow-[0_-8px_30px_rgba(0,0,0,0.4)]">
        <div className="flex gap-2 p-3 pb-2">
          {(
            [
              ["bebidas", `🥤 Bebidas ${game.owned}/${DRINKS.length}`],
              ["upgrades", "⚡ Melhorias"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-xl py-2 text-sm font-extrabold transition active:scale-95 ${
                tab === k ? "bg-amber-400 text-amber-950" : "bg-white/10 text-amber-100/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {tab === "bebidas" &&
            DRINKS.map((d, i) => {
              const owned = i < game.owned;
              const isNext = i === game.owned;
              const selected = i === game.selected;
              const can = isNext && game.money >= d.price;
              const locked = i > game.owned;
              return (
                <div
                  key={d.id}
                  onClick={() => owned && selectDrink(i)}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-2.5 transition ${
                    owned ? "cursor-pointer" : ""
                  } ${locked ? "opacity-45" : ""}`}
                  style={{
                    borderColor: selected ? d.accent : "rgba(255,255,255,0.08)",
                    background: selected ? `${d.accent}22` : "rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-xl"
                    style={{ background: locked ? "#292524" : `linear-gradient(135deg, ${d.color[0]}55, ${d.color[1]}88)` }}
                  >
                    {locked ? <span className="text-2xl">🔒</span> : <CupIcon index={i} size={44} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-extrabold">{locked ? "???" : d.name}</span>
                      <span
                        className={`rounded-full px-1.5 py-px text-[9px] font-black uppercase ${i === 7 && !locked ? "rank-god" : ""}`}
                        style={
                          i === 7 && !locked
                            ? undefined
                            : { background: locked ? "#57534e" : d.accent, color: "#1c1917" }
                        }
                      >
                        {d.rank}
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-100/60">
                      {locked ? "Desbloqueie a anterior primeiro" : <>🎩 {d.accessory}</>}
                    </div>
                    <div className="text-xs font-bold text-amber-300">
                      +${fmt(d.value)} por gole {i > 0 && !locked && <span className="text-amber-100/50">(×{fmt(d.value / DRINKS[i - 1].value)})</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {owned ? (
                      <span
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold ${
                          selected ? "bg-emerald-500 text-emerald-950" : "bg-white/15 text-amber-50"
                        }`}
                      >
                        {selected ? "Bebendo" : "Usar"}
                      </span>
                    ) : isNext ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          buyDrink(i);
                        }}
                        disabled={!can}
                        className={`rounded-xl px-3 py-2 text-xs font-black transition active:scale-95 ${
                          can ? "bg-amber-400 text-amber-950 shadow-lg" : "bg-white/10 text-amber-100/40"
                        }`}
                      >
                        Comprar
                        <div className="text-[11px]">${fmt(d.price)}</div>
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-100/40">${fmt(d.price)}</span>
                    )}
                  </div>
                </div>
              );
            })}

          {tab === "upgrades" && (
            <>
              <UpgradeCard
                icon="🥤"
                title="Copão grande"
                desc={`Multiplica o ganho por gole ×2. Atual: ×${fmt(cupMult(game.cup))}`}
                level={`Nv ${game.cup}/${CUP_MAX}`}
                cost={game.cup >= CUP_MAX ? null : cupCost(game.cup)}
                can={game.cup < CUP_MAX && game.money >= cupCost(game.cup)}
                onBuy={buyCup}
              />
              <UpgradeCard
                icon="🤖"
                title="Ajudante automático"
                desc={`Cada nível bebe 0,5 gole por segundo sozinho. Atual: ${game.helper * 0.5}/s`}
                level={`Nv ${game.helper}`}
                cost={helperCost(game.helper)}
                can={game.money >= helperCost(game.helper)}
                onBuy={buyHelper}
              />

              <div className="rounded-2xl bg-white/5 p-3 text-xs text-amber-100/70">
                <div className="mb-1 text-sm font-extrabold text-amber-200">📊 Estatísticas</div>
                <div>Goles dados: {game.sips.toLocaleString("pt-BR")}</div>
                <div>Total ganho: ${fmt(Math.floor(game.totalEarned))}</div>
                <div>
                  Coleção: {game.owned}/{DRINKS.length} bebidas
                </div>
                {game.owned === DRINKS.length && (
                  <div className="mt-1 font-bold text-amber-300">🏆 Você alcançou o Café com Leite God!</div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ---------- toast ---------- */}
      {toast && (
        <div className="pop-in pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-2 text-sm font-black text-amber-950 shadow-xl">
          {toast}
        </div>
      )}

      {/* ---------- modal instalar ---------- */}
      {showInstall && (
        <Modal onClose={() => setShowInstall(false)} title="📲 Instalar o app">
          <p className="text-sm text-amber-100/80">Instale para jogar em tela cheia, direto da tela inicial e até offline:</p>
          <ul className="mt-3 space-y-2 text-sm text-amber-50">
            <li>
              <b>Android (Chrome):</b> menu <b>⋮</b> → <b>Instalar app</b> / <b>Adicionar à tela inicial</b>.
            </li>
            <li>
              <b>iPhone (Safari):</b> botão <b>Compartilhar</b> ⬆️ → <b>Adicionar à Tela de Início</b>.
            </li>
            <li>
              <b>Computador (Chrome/Edge):</b> ícone de instalar na barra de endereço.
            </li>
          </ul>
        </Modal>
      )}

      {/* ---------- modal reset ---------- */}
      {showReset && (
        <Modal onClose={() => setShowReset(false)} title="Recomeçar o jogo?" hideClose>
          <p className="text-sm text-amber-100/80">Todo o seu progresso será apagado e você volta a ter só água.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setShowReset(false)} className="flex-1 rounded-xl bg-white/15 py-2 text-sm font-bold">
              Cancelar
            </button>
            <button onClick={doReset} className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-extrabold text-white">
              Apagar tudo
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function UpgradeCard(props: {
  icon: string;
  title: string;
  desc: string;
  level: string;
  cost: number | null;
  can: boolean;
  onBuy: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-white/10 bg-white/5 p-3">
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/10 text-3xl">{props.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold">{props.title}</span>
          <span className="rounded-full bg-white/15 px-1.5 py-px text-[10px] font-bold">{props.level}</span>
        </div>
        <div className="text-[11px] leading-snug text-amber-100/60">{props.desc}</div>
      </div>
      {props.cost === null ? (
        <span className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-black text-emerald-950">MAX</span>
      ) : (
        <button
          onClick={props.onBuy}
          disabled={!props.can}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition active:scale-95 ${
            props.can ? "bg-amber-400 text-amber-950 shadow-lg" : "bg-white/10 text-amber-100/40"
          }`}
        >
          Comprar
          <div className="text-[11px]">${fmt(props.cost)}</div>
        </button>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  hideClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  hideClose?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5" onClick={onClose}>
      <div
        className="pop-in w-full max-w-sm rounded-3xl border border-white/10 bg-[#2b150c] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-lg font-black text-amber-300">{title}</div>
        {children}
        {!hideClose && (
          <button onClick={onClose} className="mt-4 w-full rounded-xl bg-amber-400 py-2 text-sm font-black text-amber-950">
            Entendi
          </button>
        )}
      </div>
    </div>
  );
}
