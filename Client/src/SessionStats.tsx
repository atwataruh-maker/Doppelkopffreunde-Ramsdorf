import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from "recharts";
import { Session, Game } from "./types";

interface Props {
  session: Session;
}

interface PlayerStat {
  id: string;
  name: string;
  games: number;
  wins: number;
  points: number;
  paidIn: number;
  solos: number;
  streak: number; // current win streak
  maxStreak: number;
}

function calcStats(session: Session): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const p of session.players) {
    map.set(p.id, { id: p.id, name: p.name, games: 0, wins: 0, points: 0, paidIn: 0, solos: 0, streak: 0, maxStreak: 0 });
  }

  // Track per-player win streaks in order
  const streakTracker = new Map<string, number>();
  for (const p of session.players) streakTracker.set(p.id, 0);

  for (const game of session.games) {
    for (const score of game.scores) {
      const st = map.get(score.playerId);
      if (!st) continue;
      st.games++;
      st.points += score.score;
      if (score.score < 0) st.paidIn += Math.abs(score.score);
      if (score.isWinner) {
        st.wins++;
        const cur = (streakTracker.get(score.playerId) ?? 0) + 1;
        streakTracker.set(score.playerId, cur);
        if (cur > st.maxStreak) st.maxStreak = cur;
        st.streak = cur;
      } else {
        streakTracker.set(score.playerId, 0);
        st.streak = 0;
      }
    }
    if (game.meta.soloPlayerId) {
      const st = map.get(game.meta.soloPlayerId);
      if (st) st.solos++;
    }
  }

  return [...map.values()].sort((a, b) => b.points - a.points);
}

function bestGame(session: Session): { game: Game; score: number; playerName: string } | null {
  let best: { game: Game; score: number; playerName: string } | null = null;
  for (const game of session.games) {
    for (const s of game.scores) {
      if (!best || s.score > best.score) {
        const p = session.players.find(p => p.id === s.playerId);
        if (p) best = { game, score: s.score, playerName: p.name };
      }
    }
  }
  return best;
}

function worstGame(session: Session): { game: Game; score: number; playerName: string } | null {
  let worst: { game: Game; score: number; playerName: string } | null = null;
  for (const game of session.games) {
    for (const s of game.scores) {
      if (!worst || s.score < worst.score) {
        const p = session.players.find(p => p.id === s.playerId);
        if (p) worst = { game, score: s.score, playerName: p.name };
      }
    }
  }
  return worst;
}

const COLORS = ["#e6b93d", "#4ade80", "#60a5fa", "#f87171", "#a78bfa", "#fb923c"];

export default function SessionStats({ session }: Props) {
  const stats = useMemo(() => calcStats(session), [session]);
  const games = session.games;
  const totalGames = games.length;
  const bockGames = games.filter(g => g.meta.isBockrunde).length;
  const soloGames = games.filter(g => g.meta.gewonnenVon === "Solo").length;
  const hochzeitGames = games.filter(g => g.meta.gewonnenVon === "Hochzeit").length;

  const winner = stats[0];

  const barData = stats.map(s => ({ name: s.name, Punkte: s.points }));
  const winData = stats.map(s => ({ name: s.name, Siege: s.wins }));

  const spieltypData = [
    { name: "Normal", value: totalGames - soloGames - hochzeitGames },
    { name: "Hochzeit", value: hochzeitGames },
    { name: "Solo", value: soloGames },
  ].filter(d => d.value > 0);

  const siegerData = [
    { name: "Re", value: games.filter(g => g.meta.siegerPartei === "Re").length },
    { name: "Kontra", value: games.filter(g => g.meta.siegerPartei === "Kontra").length },
    { name: "Solo", value: games.filter(g => g.meta.siegerPartei === "Solo").length },
  ].filter(d => d.value > 0);

  const topStreak = [...stats].sort((a, b) => b.maxStreak - a.maxStreak)[0];
  const best = bestGame(session);
  const worst = worstGame(session);

  if (totalGames === 0) return null;

  return (
    <div className="session-stats-section">
      {winner && (
        <div className="stats-winner-banner">
          <span className="winner-trophy">🏆</span>
          <span className="winner-label">Rundensieger:</span>
          <span className="winner-name">{winner.name}</span>
          <span className="winner-points">
            {winner.points > 0 ? "+" : ""}{winner.points} Pkt.
          </span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{totalGames}</div>
          <div className="kpi-label">Spiele</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{bockGames}</div>
          <div className="kpi-label">Bockrunden</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{soloGames}</div>
          <div className="kpi-label">Soli</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{hochzeitGames}</div>
          <div className="kpi-label">Hochzeiten</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">
            {stats.reduce((s, p) => s + p.paidIn, 0)} Pkt.
          </div>
          <div className="kpi-label">Gesamt eingesetzt</div>
        </div>
      </div>

      <h3 className="stats-section-title">Rangliste</h3>
      <div className="ranking-table-wrapper">
        <table className="ranking-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Spieler</th>
              <th>Spiele</th>
              <th>Siege</th>
              <th>Siege %</th>
              <th>Punkte</th>
              <th>Eingesetzt</th>
              <th>Max. Serie</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={s.id} className={i === 0 ? "rank-first" : ""}>
                <td><span className={`rank-badge rank-${i + 1}`}>{i + 1}</span></td>
                <td>{s.name}</td>
                <td>{s.games}</td>
                <td>{s.wins}</td>
                <td>{s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0}%</td>
                <td className={s.points >= 0 ? "points-pos" : "points-neg"}>
                  {s.points > 0 ? "+" : ""}{s.points}
                </td>
                <td>{s.paidIn}</td>
                <td>{s.maxStreak}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h4>Punkte pro Spieler</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="Punkte" radius={[4, 4, 0, 0]}>
                {barData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.Punkte >= 0 ? "#4ade80" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h4>Siege pro Spieler</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={winData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="Siege" radius={[4, 4, 0, 0]}>
                {winData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h4>Spieltypen</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={spieltypData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                {spieltypData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h4>Siegerpartei</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={siegerData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                {siegerData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[(idx + 2) % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <h3 className="stats-section-title">Highlights</h3>
      <div className="highlights-grid">
        {best && (
          <div className="highlight-card highlight-best">
            <div className="highlight-icon">⭐</div>
            <div className="highlight-label">Bestes Spiel</div>
            <div className="highlight-player">{best.playerName}</div>
            <div className="highlight-value">+{best.score} Pkt.</div>
          </div>
        )}
        {worst && (
          <div className="highlight-card highlight-worst">
            <div className="highlight-icon">💸</div>
            <div className="highlight-label">Schlechtestes Spiel</div>
            <div className="highlight-player">{worst.playerName}</div>
            <div className="highlight-value">{worst.score} Pkt.</div>
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
        {stats.filter(s => s.solos > 0).sort((a, b) => b.solos - a.solos)[0] && (
          <div className="highlight-card highlight-solo">
            <div className="highlight-icon">🃏</div>
            <div className="highlight-label">Meiste Soli</div>
            <div className="highlight-player">
              {stats.filter(s => s.solos > 0).sort((a, b) => b.solos - a.solos)[0].name}
            </div>
            <div className="highlight-value">
              {stats.filter(s => s.solos > 0).sort((a, b) => b.solos - a.solos)[0].solos}x Solo
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
