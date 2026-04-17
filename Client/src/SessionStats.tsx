import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, CartesianGrid, ReferenceLine,
} from "recharts";
import { Session } from "./types";

interface Props {
  session: Session;
}

interface PlayerStat {
  id: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  points: number;
  paidIn: number;
  solos: number;
  hochzeiten: number;
  maxStreak: number;
}

const PLAYER_COLORS = [
  "#e6b93d", "#60a5fa", "#4ade80", "#f87171",
  "#a78bfa", "#fb923c", "#34d399", "#f472b6",
];

const MEDAL = ["🥇", "🥈", "🥉"];

const TT_STYLE = {
  background: "#0f1724",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
};

function toEuro(points: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(points * 0.1);
}

function calcStats(session: Session): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const p of session.players) {
    map.set(p.id, {
      id: p.id, name: p.name,
      games: 0, wins: 0, losses: 0,
      points: 0, paidIn: 0, solos: 0,
      hochzeiten: 0, maxStreak: 0,
    });
  }
  const streak = new Map<string, number>(session.players.map(p => [p.id, 0]));

  for (const game of session.games) {
    for (const score of game.scores) {
      const st = map.get(score.playerId);
      if (!st) continue;
      st.games++;
      st.points += score.score;
      if (score.isWinner) {
        st.wins++;
        const cur = (streak.get(score.playerId) ?? 0) + 1;
        streak.set(score.playerId, cur);
        if (cur > st.maxStreak) st.maxStreak = cur;
      } else {
        st.losses++;
        st.paidIn += Math.abs(score.score);
        streak.set(score.playerId, 0);
      }
    }
    if (game.meta.soloPlayerId) {
      const st = map.get(game.meta.soloPlayerId);
      if (st) st.solos++;
    }
    if (game.meta.hochzeitPlayerId) {
      const st = map.get(game.meta.hochzeitPlayerId);
      if (st) st.hochzeiten++;
    }
  }
  return [...map.values()].sort((a, b) => b.points - a.points);
}

export default function SessionStats({ session }: Props) {
  const stats = useMemo(() => calcStats(session), [session]);
  const games = session.games;
  const n = games.length;
  if (n === 0) return null;

  const bockGames   = games.filter(g => g.meta.isBockrunde).length;
  const soloGames   = games.filter(g => g.meta.gewonnenVon === "Solo").length;
  const hzGames     = games.filter(g => g.meta.gewonnenVon === "Hochzeit").length;
  const reWins      = games.filter(g => g.meta.siegerPartei === "Re").length;
  const kontraWins  = games.filter(g => g.meta.siegerPartei === "Kontra").length;
  const soloWins    = games.filter(g => g.meta.siegerPartei === "Solo").length;

  // Cumulative points line chart data
  const lineData = useMemo(() => {
    const totals = new Map<string, number>(session.players.map(p => [p.id, 0]));
    const rows: Record<string, number | string>[] = [
      { spiel: "Start", ...Object.fromEntries(session.players.map(p => [p.name, 0])) },
    ];
    for (let i = 0; i < games.length; i++) {
      for (const s of games[i].scores) {
        totals.set(s.playerId, (totals.get(s.playerId) ?? 0) + s.score);
      }
      rows.push({
        spiel: i + 1,
        ...Object.fromEntries(session.players.map(p => [p.name, totals.get(p.id) ?? 0])),
      });
    }
    return rows;
  }, [session]);

  const barData = stats.map(s => ({ name: s.name, Punkte: s.points }));
  const winLossData = stats.map(s => ({ name: s.name, Siege: s.wins, Niederlagen: s.losses }));

  const spieltypData = [
    { name: "Normal",   value: n - soloGames - hzGames },
    { name: "Hochzeit", value: hzGames },
    { name: "Solo",     value: soloGames },
  ].filter(d => d.value > 0);

  const siegerData = [
    { name: "Re",     value: reWins },
    { name: "Kontra", value: kontraWins },
    { name: "Solo",   value: soloWins },
  ].filter(d => d.value > 0);

  // Best and worst single-game score
  let bestScore  = { name: "", score: -Infinity, gameIdx: -1 };
  let worstScore = { name: "", score:  Infinity, gameIdx: -1 };
  games.forEach((g, i) => {
    g.scores.forEach(s => {
      const pName = session.players.find(p => p.id === s.playerId)?.name ?? "";
      if (s.score > bestScore.score)  bestScore  = { name: pName, score: s.score, gameIdx: i + 1 };
      if (s.score < worstScore.score) worstScore = { name: pName, score: s.score, gameIdx: i + 1 };
    });
  });

  const mostPaid  = [...stats].sort((a, b) => b.paidIn - a.paidIn)[0];
  const topStreak = [...stats].sort((a, b) => b.maxStreak - a.maxStreak)[0];
  const topSolo   = [...stats].filter(s => s.solos > 0).sort((a, b) => b.solos - a.solos)[0];
  const leader    = stats[0];
  const top3      = stats.slice(0, Math.min(3, stats.length));

  return (
    <div className="session-stats-section">

      {/* ── Leader Banner ─────────────────────────────────── */}
      <div className="stats-winner-banner">
        <span className="winner-trophy">🏆</span>
        <div className="winner-info">
          <span className="winner-label">
            {session.active ? "Aktueller Führender" : "Rundensieger"}
          </span>
          <span className="winner-name">{leader.name}</span>
        </div>
        <div className="winner-score-block">
          <span className={`winner-pts-big ${leader.points >= 0 ? "pts-pos" : "pts-neg"}`}>
            {leader.points > 0 ? "+" : ""}{leader.points} Pkt.
          </span>
          <span className="winner-euro-sub">{toEuro(leader.points)}</span>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────── */}
      <div className="kpi-grid">
        {([
          ["Spiele gesamt", n],
          ["Bockrunden",    bockGames],
          ["Soli",          soloGames],
          ["Hochzeiten",    hzGames],
          ["Re-Siege",      reWins],
          ["Kontra-Siege",  kontraWins],
        ] as [string, number][]).map(([l, v]) => (
          <div className="kpi-card" key={l}>
            <div className="kpi-value">{v}</div>
            <div className="kpi-label">{l}</div>
          </div>
        ))}
      </div>

      {/* ── Podium ────────────────────────────────────────── */}
      <h3 className="stats-section-title">Rangliste</h3>
      <div className="podium-wrap">
        {top3.length >= 3
          ? [top3[1], top3[0], top3[2]].map(s => (
              <PodiumCard key={s.id} stat={s} rank={top3.indexOf(s) + 1} />
            ))
          : top3.map((s, i) => (
              <PodiumCard key={s.id} stat={s} rank={i + 1} />
            ))}
      </div>

      {/* ── Full Ranking Table ────────────────────────────── */}
      <div className="ranking-table-wrapper">
        <table className="ranking-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="rtcol-name">Spieler</th>
              <th>Sp.</th>
              <th className="rtcol-win">Siege</th>
              <th className="rtcol-loss">Nied.</th>
              <th>Quote</th>
              <th>Punkte</th>
              <th>Euro</th>
              <th>Serie</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={s.id} className={i === 0 ? "rank-first" : ""}>
                <td>
                  <span className={`rank-badge rank-${Math.min(i + 1, 4)}`}>
                    {i < 3 ? MEDAL[i] : i + 1}
                  </span>
                </td>
                <td className="rtcol-name">{s.name}</td>
                <td>{s.games}</td>
                <td className="rtcol-win">{s.wins}</td>
                <td className="rtcol-loss">{s.losses}</td>
                <td>
                  <div className="winrate-wrap">
                    <div className="winrate-track">
                      <div
                        className="winrate-fill"
                        style={{ width: `${s.games > 0 ? (s.wins / s.games) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="winrate-num">
                      {s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0}%
                    </span>
                  </div>
                </td>
                <td className={s.points >= 0 ? "points-pos" : "points-neg"}>
                  {s.points > 0 ? "+" : ""}{s.points}
                </td>
                <td className={s.points >= 0 ? "points-pos" : "points-neg"}>
                  {toEuro(s.points)}
                </td>
                <td className="rtcol-streak">
                  {s.maxStreak > 1 ? `${s.maxStreak}🔥` : s.maxStreak === 1 ? "1" : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Charts ────────────────────────────────────────── */}
      <h3 className="stats-section-title">Diagramme</h3>
      <div className="charts-grid">

        <div className="chart-card">
          <h4>Punkte pro Spieler</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 10, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#9fb0c8" }} />
              <YAxis tick={{ fontSize: 12, fill: "#9fb0c8" }} width={38} />
              <Tooltip contentStyle={TT_STYLE} labelStyle={{ color: "#ecf2ff" }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
              <Bar dataKey="Punkte" radius={[6, 6, 0, 0]}>
                {barData.map((e, i) => (
                  <Cell key={i} fill={e.Punkte >= 0 ? "#4ade80" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h4>Siege vs. Niederlagen</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={winLossData} margin={{ top: 10, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#9fb0c8" }} />
              <YAxis tick={{ fontSize: 12, fill: "#9fb0c8" }} width={28} />
              <Tooltip contentStyle={TT_STYLE} labelStyle={{ color: "#ecf2ff" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9fb0c8" }} />
              <Bar dataKey="Siege"      fill="#4ade80" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Niederlagen" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h4>Spieltypen</h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={spieltypData} dataKey="value" nameKey="name"
                cx="50%" cy="45%" outerRadius={75} innerRadius={38}
              >
                {spieltypData.map((_, i) => (
                  <Cell key={i} fill={["#e6b93d", "#60a5fa", "#a78bfa"][i % 3]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12, color: "#9fb0c8" }} />
              <Tooltip contentStyle={TT_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h4>Siegerpartei</h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={siegerData} dataKey="value" nameKey="name"
                cx="50%" cy="45%" outerRadius={75} innerRadius={38}
              >
                {siegerData.map((_, i) => (
                  <Cell key={i} fill={["#4ade80", "#f87171", "#a78bfa"][i % 3]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12, color: "#9fb0c8" }} />
              <Tooltip contentStyle={TT_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ── Punkteverlauf (nur ab 3 Spielen) ─────────────── */}
      {n >= 3 && (
        <div className="chart-card chart-full">
          <h4>Punkteverlauf</h4>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="spiel" tick={{ fontSize: 11, fill: "#9fb0c8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9fb0c8" }} width={38} />
              <Tooltip contentStyle={TT_STYLE} labelStyle={{ color: "#ecf2ff" }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9fb0c8" }} />
              {session.players.map((p, i) => (
                <Line
                  key={p.id}
                  type="monotone"
                  dataKey={p.name}
                  stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Highlights ────────────────────────────────────── */}
      <h3 className="stats-section-title">Highlights</h3>
      <div className="highlights-grid">

        {bestScore.score !== -Infinity && (
          <div className="highlight-card highlight-best">
            <div className="highlight-icon">⭐</div>
            <div className="highlight-label">Bestes Einzelspiel</div>
            <div className="highlight-player">{bestScore.name}</div>
            <div className="highlight-value">
              {bestScore.score > 0 ? "+" : ""}{bestScore.score} Pkt.
            </div>
            <div className="highlight-sub">Spiel #{bestScore.gameIdx}</div>
          </div>
        )}

        {worstScore.score !== Infinity && worstScore.score < 0 && (
          <div className="highlight-card highlight-worst">
            <div className="highlight-icon">💸</div>
            <div className="highlight-label">Höchste Zahlung</div>
            <div className="highlight-player">{worstScore.name}</div>
            <div className="highlight-value">{worstScore.score} Pkt.</div>
            <div className="highlight-sub">
              {toEuro(Math.abs(worstScore.score))} · Spiel #{worstScore.gameIdx}
            </div>
          </div>
        )}

        {topStreak && topStreak.maxStreak > 1 && (
          <div className="highlight-card highlight-streak">
            <div className="highlight-icon">🔥</div>
            <div className="highlight-label">Längste Siegesserie</div>
            <div className="highlight-player">{topStreak.name}</div>
            <div className="highlight-value">{topStreak.maxStreak} in Folge</div>
          </div>
        )}

        {mostPaid && mostPaid.paidIn > 0 && (
          <div className="highlight-card highlight-paid">
            <div className="highlight-icon">😬</div>
            <div className="highlight-label">Meiste Einzahlungen</div>
            <div className="highlight-player">{mostPaid.name}</div>
            <div className="highlight-value">{mostPaid.paidIn} Pkt.</div>
            <div className="highlight-sub">{toEuro(mostPaid.paidIn)}</div>
          </div>
        )}

        {topSolo && (
          <div className="highlight-card highlight-solo">
            <div className="highlight-icon">🃏</div>
            <div className="highlight-label">Meiste Soli</div>
            <div className="highlight-player">{topSolo.name}</div>
            <div className="highlight-value">{topSolo.solos}× Solo</div>
          </div>
        )}

      </div>
    </div>
  );
}

function PodiumCard({ stat, rank }: { stat: PlayerStat; rank: number }) {
  return (
    <div className={`podium-card podium-rank-${rank}`}>
      <div className="podium-medal">{MEDAL[rank - 1] ?? rank}</div>
      <div className="podium-avatar-wrap">
        <div className="podium-avatar">{stat.name.charAt(0).toUpperCase()}</div>
      </div>
      <div className="podium-name">{stat.name}</div>
      <div className={`podium-pts ${stat.points >= 0 ? "pts-pos" : "pts-neg"}`}>
        {stat.points > 0 ? "+" : ""}{stat.points} Pkt.
      </div>
      <div className="podium-euro">{toEuro(stat.points)}</div>
      <div className="podium-record">
        <span className="rec-win">{stat.wins}S</span>
        <span className="rec-sep">·</span>
        <span className="rec-loss">{stat.losses}N</span>
        <span className="rec-sep">·</span>
        <span className="rec-pct">
          {stat.games > 0 ? Math.round((stat.wins / stat.games) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}
