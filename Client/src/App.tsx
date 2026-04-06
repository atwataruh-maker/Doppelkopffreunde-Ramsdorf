import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import "./index.css";
import {
  addGame,
  checkAuth,
  createPlayer,
  createSession,
  endSession,
  fetchPlayers,
  fetchSessions,
  undoGame
} from "./api";
import { Game, Player, PlayerStats, Session, SiegerPartei, Spieltyp } from "./types";

type View = "sessions" | "stats" | "detail";

const initialGamePlayers = ["", "", "", ""];

function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(date));
}

function getTotalForPlayer(session: Session, playerId: string) {
  return session.games.reduce((sum, game) => {
    const found = game.scores.find((score) => score.playerId === playerId);
    return sum + (found?.score ?? 0);
  }, 0);
}

function formatEuroAmount(points: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(points * 0.1);
}

function getEffectivePointsForDisplay(
  gewonnenVon: Spieltyp,
  winnerCount: number,
  partyPoints: number
) {
  if (gewonnenVon === "Solo" && winnerCount === 3) {
    return partyPoints * 3;
  }

  return partyPoints;
}

function getPlayerName(players: Player[], playerId: string | null) {
  if (!playerId) return "--";
  return players.find((player) => player.id === playerId)?.name ?? "--";
}

function getGamePlayers(session: Session, game: Game) {
  const playerIds = game.scores.map((score) => score.playerId);
  return session.players.filter((player) => playerIds.includes(player.id));
}

function formatPairLabel(names: string[]) {
  return names.join(" + ");
}

function buildPreviewText(
  winnerCount: number,
  partyPoints: number,
  gewonnenVon: Spieltyp,
  hochzeitPlayerId: string | null,
  soloPlayerId: string | null,
  players: Player[]
) {
  const baseText =
    gewonnenVon === "Solo"
      ? winnerCount === 1
        ? `Solo gewinnt: Verlierer zahlen je ${partyPoints} Punkte, Sieger 0`
        : winnerCount === 3
          ? `Solo verliert: Solo-Spieler zahlt ${partyPoints * 3} Punkte, Gewinner 0`
          : "Bei Solo bitte 1 Gewinner oder 3 Gewinner markieren."
      : gewonnenVon === "Hochzeit"
        ? winnerCount === 1
          ? `Hochzeit allein gewinnt: Verlierer zahlen je ${partyPoints} Punkte, Sieger 0`
          : winnerCount === 2
            ? `Hochzeit mit Partner gewinnt: Verlierer zahlen je ${partyPoints} Punkte, Sieger 0`
            : winnerCount === 3
              ? `Hochzeit verliert: Hochzeit-Spieler zahlt ${partyPoints} Punkte, Gewinner 0`
              : "Bei Hochzeit bitte 1, 2 oder 3 Gewinner markieren."
        : winnerCount === 2
          ? `Verlierer zahlen je ${partyPoints} Punkte, Gewinner 0`
          : "Bei Re/Kontra bitte genau 2 Gewinner markieren.";

  if (gewonnenVon === "Hochzeit" && hochzeitPlayerId) {
    return `${baseText} | Hochzeit: alle ausser ${getPlayerName(players, hochzeitPlayerId)} zahlen zusaetzlich 1 Punkt.`;
  }

  if (gewonnenVon === "Solo" && soloPlayerId) {
    return `${baseText} | Solo-Spieler: ${getPlayerName(players, soloPlayerId)}.`;
  }

  return baseText;
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [view, setView] = useState<View>("sessions");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");

  const [selectedSessionPlayers, setSelectedSessionPlayers] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");

  const [showAddGame, setShowAddGame] = useState(false);
  const [selectedGamePlayers, setSelectedGamePlayers] = useState<string[]>(initialGamePlayers);
  const [gewonnenVon, setGewonnenVon] = useState<Spieltyp>("Normal");
  const [siegerPartei, setSiegerPartei] = useState<SiegerPartei>("Re");
  const [isBockrunde, setIsBockrunde] = useState(false);
  const [selectedWinners, setSelectedWinners] = useState<string[]>([]);
  const [partyPoints, setPartyPoints] = useState(1);
  const [hochzeitPlayerId, setHochzeitPlayerId] = useState<string | null>(null);
  const [soloPlayerId, setSoloPlayerId] = useState<string | null>(null);
  const [reAnsage, setReAnsage] = useState("");
  const [kontraAnsage, setKontraAnsage] = useState("");
  const [kommentar, setKommentar] = useState("");

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const selectedGamePlayerObjects = useMemo(
    () =>
      selectedGamePlayers
        .map((playerId) => selectedSession?.players.find((player) => player.id === playerId) ?? null)
        .filter((player): player is Player => Boolean(player)),
    [selectedGamePlayers, selectedSession]
  );

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const [sessionsData, playersData] = await Promise.all([fetchSessions(), fetchPlayers()]);
      setSessions(sessionsData);
      setPlayers(playersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  async function verifyStoredPassword() {
    try {
      const ok = await checkAuth();
      setIsAuthenticated(ok);
      setAuthChecked(true);
      if (ok) {
        await loadData();
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler bei der Anmeldung");
      setAuthChecked(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    verifyStoredPassword();
  }, []);

  useEffect(() => {
    const validIds = new Set(selectedGamePlayerObjects.map((player) => player.id));
    setSelectedWinners((prev) => prev.filter((playerId) => validIds.has(playerId)));

    if (hochzeitPlayerId && !validIds.has(hochzeitPlayerId)) {
      setHochzeitPlayerId(null);
    }

    if (soloPlayerId && !validIds.has(soloPlayerId)) {
      setSoloPlayerId(null);
    }
  }, [selectedGamePlayerObjects, hochzeitPlayerId, soloPlayerId]);

  const stats = useMemo<PlayerStats[]>(() => {
    const map = new Map<string, PlayerStats>();

    players.forEach((player) => {
      map.set(player.id, {
        id: player.id,
        name: player.name,
        totalPoints: 0,
        totalPaidIn: 0,
        totalGames: 0,
        wins: 0,
        winRate: 0,
        bockRounds: 0,
        hochzeiten: 0,
        solos: 0
      });
    });

    sessions.forEach((session) => {
      session.games.forEach((game) => {
        game.scores.forEach((score) => {
          const entry = map.get(score.playerId);
          if (!entry) return;
          entry.totalPoints += score.score;
          if (score.score < 0) {
            entry.totalPaidIn += Math.abs(score.score);
          }
          entry.totalGames += 1;
          if (score.isWinner) entry.wins += 1;
          if (game.meta.isBockrunde) entry.bockRounds += 1;
          if (game.meta.gewonnenVon === "Hochzeit" && game.meta.hochzeitPlayerId === score.playerId) {
            entry.hochzeiten += 1;
          }
          if (game.meta.gewonnenVon === "Solo" && game.meta.soloPlayerId === score.playerId) {
            entry.solos += 1;
          }
        });
      });
    });

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        winRate: entry.totalGames > 0 ? Math.round((entry.wins / entry.totalGames) * 100) : 0
      }))
      .sort((left, right) => right.totalPoints - left.totalPoints || left.name.localeCompare(right.name));
  }, [players, sessions]);

  const statsByWins = useMemo(
    () => [...stats].sort((left, right) => right.wins - left.wins || right.winRate - left.winRate),
    [stats]
  );

  const statsByPaidIn = useMemo(
    () => [...stats].sort((left, right) => right.totalPaidIn - left.totalPaidIn || left.name.localeCompare(right.name)),
    [stats]
  );

  const overviewStats = useMemo(() => {
    const bockRounds = sessions.reduce(
      (sum, session) => sum + session.games.filter((game) => game.meta.isBockrunde).length,
      0
    );
    const hochzeiten = sessions.reduce(
      (sum, session) => sum + session.games.filter((game) => game.meta.gewonnenVon === "Hochzeit").length,
      0
    );
    const solos = sessions.reduce(
      (sum, session) => sum + session.games.filter((game) => game.meta.gewonnenVon === "Solo").length,
      0
    );
    const totalPaidIn = stats.reduce((sum, player) => sum + player.totalPaidIn, 0);

    return { bockRounds, hochzeiten, solos, totalPaidIn };
  }, [sessions, stats]);

  const pairStats = useMemo(() => {
    const pairMap = new Map<string, { names: string[]; games: number }>();

    sessions.forEach((session) => {
      session.games.forEach((game) => {
        const gamePlayers = getGamePlayers(session, game)
          .map((player) => player.name)
          .sort((left, right) => left.localeCompare(right));

        for (let index = 0; index < gamePlayers.length; index += 1) {
          for (let inner = index + 1; inner < gamePlayers.length; inner += 1) {
            const names = [gamePlayers[index], gamePlayers[inner]];
            const key = names.join("::");
            const existing = pairMap.get(key);

            if (existing) {
              existing.games += 1;
            } else {
              pairMap.set(key, { names, games: 1 });
            }
          }
        }
      });
    });

    return Array.from(pairMap.values()).sort(
      (left, right) => right.games - left.games || formatPairLabel(left.names).localeCompare(formatPairLabel(right.names))
    );
  }, [sessions]);

  function resetGameForm() {
    setSelectedGamePlayers(initialGamePlayers);
    setGewonnenVon("Normal");
    setSiegerPartei("Re");
    setIsBockrunde(false);
    setSelectedWinners([]);
    setPartyPoints(1);
    setHochzeitPlayerId(null);
    setSoloPlayerId(null);
    setReAnsage("");
    setKontraAnsage("");
    setKommentar("");
  }

  function openAddGameModal() {
    if (!selectedSession) return;
    resetGameForm();
    const defaults = selectedSession.players.slice(0, 4).map((player) => player.id);
    setSelectedGamePlayers([...defaults, ...Array.from({ length: Math.max(0, 4 - defaults.length) }, () => "")]);
    setShowAddGame(true);
  }

  function handleGewonnenVonChange(value: Spieltyp) {
    setGewonnenVon(value);

    if (value === "Solo") {
      setSiegerPartei("Solo");
      setHochzeitPlayerId(null);
    } else {
      if (siegerPartei === "Solo") {
        setSiegerPartei("Re");
      }
      setSoloPlayerId(null);
      if (value !== "Hochzeit") {
        setHochzeitPlayerId(null);
      }
    }
  }

  function handleSessionPlayerChange(index: number, playerId: string) {
    setSelectedSessionPlayers((prev) => {
      const next = [...prev];
      next[index] = playerId;
      return next.filter(Boolean);
    });
  }

  function addSessionPlayerSlot() {
    setSelectedSessionPlayers((prev) => [...prev, ""]);
  }

  function removeSessionPlayer(index: number) {
    setSelectedSessionPlayers((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  function updateGameSeat(index: number, playerId: string) {
    setSelectedGamePlayers((prev) => {
      const next = [...prev];
      next[index] = playerId;
      return next;
    });
  }

  async function handleLogin() {
    try {
      sessionStorage.setItem("appPassword", passwordInput);
      const ok = await checkAuth();
      if (!ok) {
        setError("Passwort falsch.");
        setIsAuthenticated(false);
        return;
      }

      setError("");
      setIsAuthenticated(true);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("appPassword");
    setIsAuthenticated(false);
    setSessions([]);
    setPlayers([]);
    setSelectedSessionId(null);
  }

  async function handleCreatePlayer() {
    try {
      await createPlayer(newPlayerName);
      setNewPlayerName("");
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
      return;
    }

    setShowPlayerModal(false);
  }

  async function handleCreateSession() {
    try {
      const cleanedPlayerIds = Array.from(new Set(selectedSessionPlayers.filter(Boolean)));

      if (cleanedPlayerIds.length < 4) {
        alert("Bitte mindestens 4 angelegte Spieler fuer die Runde auswaehlen.");
        return;
      }

      await createSession(cleanedPlayerIds);
      setSelectedSessionPlayers([]);
      setShowCreate(false);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleAddGame() {
    if (!selectedSession) return;

    try {
      const cleanedGamePlayers = selectedGamePlayers.filter(Boolean);

      if (cleanedGamePlayers.length !== 4 || new Set(cleanedGamePlayers).size !== 4) {
        alert("Bitte genau 4 verschiedene Spieler fuer dieses Spiel auswaehlen.");
        return;
      }

      if (partyPoints < 1) {
        alert("Bitte gueltige Parteipunkte eingeben.");
        return;
      }

      if (gewonnenVon === "Hochzeit" && !hochzeitPlayerId) {
        alert("Bitte den Hochzeit-Spieler auswaehlen.");
        return;
      }

      if (gewonnenVon === "Solo" && !soloPlayerId) {
        alert("Bitte den Solo-Spieler auswaehlen.");
        return;
      }

      await addGame(selectedSession.id, {
        playerIds: cleanedGamePlayers,
        winners: selectedWinners,
        gewonnenVon,
        siegerPartei,
        isBockrunde,
        partyPoints,
        hochzeitPlayerId: gewonnenVon === "Hochzeit" ? hochzeitPlayerId : null,
        soloPlayerId: gewonnenVon === "Solo" ? soloPlayerId : null,
        reAnsage,
        kontraAnsage,
        kommentar
      });

      setShowAddGame(false);
      resetGameForm();
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleUndo() {
    if (!selectedSession) return;
    try {
      await undoGame(selectedSession.id);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleEndSession() {
    if (!selectedSession) return;
    try {
      await endSession(selectedSession.id);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    }
  }

  const pieData = statsByWins
    .filter((stat) => stat.wins > 0)
    .map((stat) => ({ name: stat.name, value: stat.wins }));
  const colors = ["#e6b93d", "#4fd1c5", "#60a5fa", "#f87171", "#c084fc", "#fb923c"];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">DK</div>
          <div>
            <div className="brand-title">Doppelkopf</div>
            <div className="brand-subtitle">Schreibblock</div>
          </div>
        </div>

        <nav className="nav">
          <button
            className={view === "sessions" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("sessions")}
            disabled={!isAuthenticated}
          >
            Runden
          </button>
          <button
            className={view === "stats" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("stats")}
            disabled={!isAuthenticated}
          >
            Statistik
          </button>
          {isAuthenticated && (
            <button className="nav-btn" onClick={handleLogout}>
              Abmelden
            </button>
          )}
        </nav>
      </header>

      <main className="container">
        {!authChecked && <p>Lade...</p>}

        {authChecked && !isAuthenticated && (
          <div className="login-card">
            <h1>App-Zugriff</h1>
            <p>Bitte das gemeinsame Passwort eingeben.</p>
            <input
              className="text-input"
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="Passwort"
            />
            <button className="primary-btn" onClick={handleLogin}>
              Anmelden
            </button>
            {error && <p className="error-text">{error}</p>}
          </div>
        )}

        {isAuthenticated && loading && <p>Lade Daten...</p>}
        {isAuthenticated && error && <p className="error-text">{error}</p>}

        {isAuthenticated && !loading && view === "sessions" && (
          <>
            <div className="page-header">
              <div>
                <h1>Spielrunden</h1>
                <p>Verwalte Spielerpool, Rundenbesetzung und einzelne 4er-Tische im vertrauten Layout.</p>
              </div>
              <div className="header-actions">
                <button
                  className="secondary-btn"
                  onClick={() => {
                    setNewPlayerName("");
                    setShowPlayerModal(true);
                  }}
                >
                  + Spieler
                </button>
                <button
                  className="primary-btn"
                  onClick={() => {
                    setSelectedSessionPlayers(["", "", "", ""]);
                    setShowCreate(true);
                  }}
                >
                  + Neue Runde
                </button>
              </div>
            </div>

            <section className="player-pool-card">
              <div className="player-pool-head">
                <div>
                  <h2>Spielerpool</h2>
                  <p>Diese Spieler stehen spaeter in allen neuen Spielrunden per Dropdown zur Auswahl.</p>
                </div>
                <span className="badge">{players.length} Spieler</span>
              </div>

              {players.length === 0 ? (
                <p className="empty-text">Noch keine Spieler vorhanden. Lege zuerst Namen an.</p>
              ) : (
                <div className="players-grid roster-grid">
                  {players.map((player) => (
                    <div key={player.id} className="player-pill">
                      <span className="avatar">{player.name.charAt(0).toUpperCase()}</span>
                      <span>{player.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="card-grid">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  className="session-card"
                  onClick={() => {
                    setSelectedSessionId(session.id);
                    setView("detail");
                  }}
                >
                  <div className="session-top">
                    <span className={session.active ? "badge active" : "badge"}>
                      {session.active ? "AKTIV" : "BEENDET"}
                    </span>
                    <span className="session-date">{formatDate(session.date)}</span>
                  </div>

                  <h3 className="session-title">{session.title}</h3>

                  <div className="players-grid">
                    {session.players.map((player) => (
                      <div key={player.id} className="player-pill">
                        <span className="avatar">{player.name.charAt(0).toUpperCase()}</span>
                        <span>{player.name}</span>
                      </div>
                    ))}
                  </div>

                  <div className="session-footer">
                    <span>{session.players.length} Spieler in der Runde</span>
                    <span>{session.games.length} Spiele</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {isAuthenticated && !loading && view === "detail" && selectedSession && (
          <>
            <div className="detail-header">
              <div>
                <button className="back-btn" onClick={() => setView("sessions")}>
                  &larr; Zurueck
                </button>
                <h1>{selectedSession.title}</h1>
                <p>
                  {selectedSession.active ? "Aktiv" : "Beendet"} | {selectedSession.players.length} Spieler in
                  der Runde | {selectedSession.games.length} Spiele
                </p>
              </div>

              <div className="detail-actions">
                <button
                  className="primary-btn"
                  onClick={openAddGameModal}
                  disabled={!selectedSession.active || selectedSession.players.length < 4}
                >
                  + Spiel erfassen
                </button>
                <button className="secondary-btn" onClick={handleUndo}>
                  Rueckgaengig
                </button>
                <button
                  className="secondary-btn"
                  onClick={handleEndSession}
                  disabled={!selectedSession.active}
                >
                  Beenden
                </button>
              </div>
            </div>

            <section className="player-pool-card session-roster-card">
              <div className="player-pool-head">
                <div>
                  <h2>Rundenbesetzung</h2>
                  <p>Alle Spieler, die sich fuer diese Spielrunde getroffen haben.</p>
                </div>
                <span className="badge">{selectedSession.players.length} Personen</span>
              </div>
              <div className="players-grid roster-grid">
                {selectedSession.players.map((player) => (
                  <div key={player.id} className="player-pill">
                    <span className="avatar">{player.name.charAt(0).toUpperCase()}</span>
                    <span>{player.name}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Typ</th>
                    {selectedSession.players.map((player) => (
                      <th key={player.id}>{player.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedSession.games.map((game, index) => (
                    <tr key={game.id}>
                      <td>{index + 1}</td>
                      <td>
                        <div className="mini-meta">
                          <strong>{game.meta.gewonnenVon}</strong>
                          <span>{game.meta.siegerPartei}</span>
                          <span>{game.meta.isBockrunde ? "Bockrunde" : "Normalrunde"}</span>
                          <span>{game.meta.partyPoints} Parteipunkte</span>
                          <span>
                            Tisch:{" "}
                            {getGamePlayers(selectedSession, game)
                              .map((player) => player.name)
                              .join(", ")}
                          </span>
                          {game.meta.gewonnenVon === "Hochzeit" && (
                            <span>
                              Hochzeit: {getPlayerName(selectedSession.players, game.meta.hochzeitPlayerId)}
                            </span>
                          )}
                          {game.meta.gewonnenVon === "Solo" && (
                            <span>Solo: {getPlayerName(selectedSession.players, game.meta.soloPlayerId)}</span>
                          )}
                        </div>
                      </td>
                      {selectedSession.players.map((player) => {
                        const score = game.scores.find((entry) => entry.playerId === player.id);
                        const value = score?.score ?? 0;
                        return (
                          <td key={player.id} className={value >= 0 ? "positive" : "negative"}>
                            {value > 0 ? `+${value}` : value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="sum-row">
                    <td>Summe</td>
                    <td>Gesamt</td>
                    {selectedSession.players.map((player) => {
                      const total = getTotalForPlayer(selectedSession, player.id);
                      return (
                        <td key={player.id} className={total >= 0 ? "positive" : "negative"}>
                          {total > 0 ? `+${total}` : total}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="history-grid">
              {selectedSession.games.map((game, index) => (
                <div className="history-card" key={game.id}>
                  <div className="history-head">
                    <strong>Spiel {index + 1}</strong>
                    <span>{game.meta.siegerPartei}</span>
                  </div>
                  <div className="history-meta">
                    <span>Spieltyp: {game.meta.gewonnenVon}</span>
                    <span>{game.meta.isBockrunde ? "Bockrunde" : "keine Bockrunde"}</span>
                    <span>Parteipunkte: {game.meta.partyPoints}</span>
                    <span>
                      Euro Partei:{" "}
                      {formatEuroAmount(
                        getEffectivePointsForDisplay(
                          game.meta.gewonnenVon,
                          game.scores.filter((score) => score.isWinner).length,
                          game.meta.partyPoints
                        )
                      )}
                    </span>
                    <span>
                      Tisch:{" "}
                      {getGamePlayers(selectedSession, game)
                        .map((player) => player.name)
                        .join(", ")}
                    </span>
                    {game.meta.gewonnenVon === "Hochzeit" && (
                      <span>
                        Hochzeit-Spieler: {getPlayerName(selectedSession.players, game.meta.hochzeitPlayerId)}
                      </span>
                    )}
                    {game.meta.gewonnenVon === "Solo" && (
                      <span>Solo-Spieler: {getPlayerName(selectedSession.players, game.meta.soloPlayerId)}</span>
                    )}
                    <span>Re: {game.meta.reAnsage || "--"}</span>
                    <span>Kontra: {game.meta.kontraAnsage || "--"}</span>
                    <span>Kommentar: {game.meta.kommentar || "--"}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {isAuthenticated && !loading && view === "stats" && (
          <>
            <div className="page-header">
              <div>
                <h1>Statistiken</h1>
                <p>Siege und Einzahlungen im Fokus, dazu Zusatzwerte fuer Bockrunden, Hochzeiten und Spielpaare.</p>
              </div>
            </div>

            <div className="stats-grid highlight-stats-grid">
              {statsByWins.slice(0, 4).map((player) => (
                <div key={player.id} className="stat-card highlight-stat-card">
                  <div className="stat-kicker">Siege</div>
                  <div className="stat-name">{player.name}</div>
                  <div className="stat-value">{player.wins}</div>
                  <div className="stat-meta">
                    <span>{player.winRate}% Siegquote</span>
                    <span>{player.totalGames} Spiele</span>
                  </div>
                </div>
              ))}
              {statsByPaidIn.slice(0, 2).map((player) => (
                <div key={`${player.id}-paid`} className="stat-card highlight-stat-card paid-stat-card">
                  <div className="stat-kicker">Eingezahlt</div>
                  <div className="stat-name">{player.name}</div>
                  <div className="stat-value">{formatEuroAmount(player.totalPaidIn)}</div>
                  <div className="stat-meta">
                    <span>{player.totalPaidIn} Punkte eingezahlt</span>
                    <span>{player.wins} Siege</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="stats-grid compact-stats-grid">
              <div className="stat-card compact-stat-card">
                <div className="stat-kicker">Bockrunden</div>
                <div className="stat-value">{overviewStats.bockRounds}</div>
                <div className="stat-meta">
                  <span>gesamt gespielt</span>
                </div>
              </div>
              <div className="stat-card compact-stat-card">
                <div className="stat-kicker">Hochzeiten</div>
                <div className="stat-value">{overviewStats.hochzeiten}</div>
                <div className="stat-meta">
                  <span>gesamt gespielt</span>
                </div>
              </div>
              <div className="stat-card compact-stat-card">
                <div className="stat-kicker">Soli</div>
                <div className="stat-value">{overviewStats.solos}</div>
                <div className="stat-meta">
                  <span>gesamt gespielt</span>
                </div>
              </div>
              <div className="stat-card compact-stat-card">
                <div className="stat-kicker">Einzahlungen</div>
                <div className="stat-value">{formatEuroAmount(overviewStats.totalPaidIn)}</div>
                <div className="stat-meta">
                  <span>{overviewStats.totalPaidIn} Punkte insgesamt</span>
                </div>
              </div>
            </div>

            <div className="charts-grid">
              <div className="chart-card">
                <h3>Siege pro Spieler</h3>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={statsByWins}>
                      <XAxis dataKey="name" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip />
                      <Bar dataKey="wins" fill="#e6b93d" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <h3>Siegesverteilung</h3>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label>
                        {pieData.map((_, index) => (
                          <Cell key={index} fill={colors[index % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="charts-grid">
              <div className="chart-card">
                <h3>Einzahlungen pro Spieler</h3>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={statsByPaidIn}>
                      <XAxis dataKey="name" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip
                        formatter={(value) =>
                          typeof value === "number" ? formatEuroAmount(value) : String(value ?? "")
                        }
                      />
                      <Bar dataKey="totalPaidIn" fill="#f87171" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <h3>Meist gespielte Paare</h3>
                <div className="list-card">
                  {pairStats.length === 0 ? (
                    <p className="empty-text">Noch keine gemeinsamen Spiele erfasst.</p>
                  ) : (
                    pairStats.slice(0, 8).map((pair) => (
                      <div key={pair.names.join("::")} className="rank-row">
                        <span>{formatPairLabel(pair.names)}</span>
                        <strong>{pair.games} Spiele</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="stats-grid">
              {statsByWins.map((player) => (
                <div key={player.id} className="stat-card">
                  <div className="stat-name">{player.name}</div>
                  <div className="stat-value">{player.wins}</div>
                  <div className="stat-meta stat-meta-stacked">
                    <span>{player.winRate}% Siegquote</span>
                    <span>{player.totalGames} Spiele</span>
                    <span>{formatEuroAmount(player.totalPaidIn)} eingezahlt</span>
                    <span>{player.bockRounds} Bockrunden</span>
                    <span>{player.hochzeiten} Hochzeiten</span>
                    <span>{player.solos} Soli</span>
                    <span>{player.totalPoints} Punkte netto</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {isAuthenticated && showPlayerModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Spieler anlegen</h2>
            <p>Ein Name reicht. Danach steht der Spieler fuer neue Runden bereit.</p>

            <label className="field-label">Name</label>
            <input
              className="text-input"
              value={newPlayerName}
              maxLength={30}
              onChange={(event) => setNewPlayerName(event.target.value)}
              placeholder="z. B. Matthias"
            />

            <div className="modal-actions">
              <button
                className="secondary-btn"
                onClick={() => {
                  setNewPlayerName("");
                  setShowPlayerModal(false);
                }}
              >
                Abbrechen
              </button>
              <button className="primary-btn" onClick={handleCreatePlayer}>
                Spieler anlegen
              </button>
            </div>
          </div>
        </div>
      )}

      {isAuthenticated && showCreate && (
        <div className="modal-overlay">
          <div className="modal-card modal-card-lg">
            <h2>Neue Runde</h2>
            <p>Waehle die Spieler aus dem angelegten Pool aus. Es duerfen mehr als 4 sein.</p>

            {players.length === 0 ? (
              <p className="helper-text">Lege zuerst mindestens 4 Spieler an, bevor du eine Runde startest.</p>
            ) : (
              <>
                <div className="section-block">
                  <label className="field-label">Spieler fuer diese Runde</label>
                  <div className="session-select-list">
                    {selectedSessionPlayers.map((playerId, index) => (
                      <div key={`${index}-${playerId || "empty"}`} className="session-select-row">
                        <select
                          className="text-input"
                          value={playerId}
                          onChange={(event) => handleSessionPlayerChange(index, event.target.value)}
                        >
                          <option value="">Spieler waehlen</option>
                          {players
                            .filter(
                              (player) =>
                                !selectedSessionPlayers.includes(player.id) || selectedSessionPlayers[index] === player.id
                            )
                            .map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.name}
                              </option>
                            ))}
                        </select>
                        <button className="secondary-btn danger-btn" onClick={() => removeSessionPlayer(index)}>
                          Entfernen
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="inline-actions">
                    <button className="secondary-btn" onClick={addSessionPlayerSlot}>
                      + Spieler zur Runde
                    </button>
                  </div>
                  <p className="helper-text">
                    Mindestens 4 Spieler sind noetig. Fuer einzelne Spiele waehlt ihr spaeter jeweils genau 4
                    davon aus.
                  </p>
                </div>

                <div className="preview-card">
                  <strong>Ausgewaehlte Runde</strong>
                  <div className="selected-chip-row">
                    {selectedSessionPlayers
                      .filter(Boolean)
                      .map((playerId) => players.find((player) => player.id === playerId))
                      .filter((player): player is Player => Boolean(player))
                      .map((player) => (
                        <span key={player.id} className="selection-chip">
                          {player.name}
                        </span>
                      ))}
                  </div>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button
                className="secondary-btn"
                onClick={() => {
                  setSelectedSessionPlayers([]);
                  setShowCreate(false);
                }}
              >
                Abbrechen
              </button>
              <button className="primary-btn" onClick={handleCreateSession} disabled={players.length < 4}>
                Anlegen
              </button>
            </div>
          </div>
        </div>
      )}

      {isAuthenticated && showAddGame && selectedSession && (
        <div className="modal-overlay">
          <div className="modal-card modal-card-lg">
            <h2>Spiel erfassen</h2>
            <p>Waehle zuerst die 4 Spieler am Tisch aus. Alle weiteren Angaben beziehen sich nur auf diese Vier.</p>

            <div className="section-block">
              <label className="field-label">Wer spielt diese Partie?</label>
              <div className="session-select-list">
                {selectedGamePlayers.map((playerId, index) => (
                  <div key={`${index}-${playerId || "seat"}`} className="session-select-row">
                    <select
                      className="text-input"
                      value={playerId}
                      onChange={(event) => updateGameSeat(index, event.target.value)}
                    >
                      <option value="">Tischplatz {index + 1}</option>
                      {selectedSession.players
                        .filter(
                          (player) =>
                            !selectedGamePlayers.includes(player.id) || selectedGamePlayers[index] === player.id
                        )
                        .map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="helper-text">Pro Spiel sind genau 4 verschiedene Spieler erlaubt.</p>
            </div>

            <div className="section-block">
              <label className="field-label">Gewonnen von?</label>
              <div className="segment-group">
                {(["Normal", "Hochzeit", "Solo"] as Spieltyp[]).map((typ) => (
                  <button
                    type="button"
                    key={typ}
                    className={gewonnenVon === typ ? "segment-btn active" : "segment-btn"}
                    onClick={() => handleGewonnenVonChange(typ)}
                  >
                    {typ}
                  </button>
                ))}
              </div>
            </div>

            {gewonnenVon === "Hochzeit" && (
              <div className="section-block">
                <label className="field-label">Hochzeit-Spieler</label>
                <div className="picker-grid">
                  {selectedGamePlayerObjects.map((player) => (
                    <button
                      type="button"
                      key={player.id}
                      className={hochzeitPlayerId === player.id ? "winner-btn active" : "winner-btn"}
                      onClick={() => setHochzeitPlayerId(player.id)}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
                <div className="picker-summary">
                  Ausgewaehlt: <strong>{getPlayerName(selectedGamePlayerObjects, hochzeitPlayerId)}</strong>
                </div>
              </div>
            )}

            {gewonnenVon === "Solo" && (
              <div className="section-block">
                <label className="field-label">Solo-Spieler</label>
                <div className="picker-grid">
                  {selectedGamePlayerObjects.map((player) => (
                    <button
                      type="button"
                      key={player.id}
                      className={soloPlayerId === player.id ? "winner-btn active" : "winner-btn"}
                      onClick={() => setSoloPlayerId(player.id)}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
                <div className="picker-summary">
                  Ausgewaehlt: <strong>{getPlayerName(selectedGamePlayerObjects, soloPlayerId)}</strong>
                </div>
              </div>
            )}

            <div className="section-block">
              <label className="field-label">Siegerpartei</label>
              <div className="segment-group">
                {(["Re", "Kontra", "Solo"] as SiegerPartei[]).map((partei) => {
                  const disabled =
                    (gewonnenVon === "Solo" && partei !== "Solo") ||
                    (gewonnenVon !== "Solo" && partei === "Solo");

                  return (
                    <button
                      type="button"
                      key={partei}
                      className={siegerPartei === partei ? "segment-btn active" : "segment-btn"}
                      disabled={disabled}
                      onClick={() => setSiegerPartei(partei)}
                    >
                      {partei}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="toggle-row">
              <label className="field-label toggle-label">Bockrunde?</label>
              <button
                type="button"
                className={isBockrunde ? "toggle-btn active" : "toggle-btn"}
                onClick={() => setIsBockrunde((prev) => !prev)}
              >
                {isBockrunde ? "Ja" : "Nein"}
              </button>
            </div>

            <div className="form-grid">
              <div>
                <label className="field-label">Re-Ansage?</label>
                <input
                  className="text-input"
                  value={reAnsage}
                  maxLength={50}
                  onChange={(event) => setReAnsage(event.target.value)}
                  placeholder="optional"
                />
              </div>

              <div>
                <label className="field-label">Kontra-Ansage?</label>
                <input
                  className="text-input"
                  value={kontraAnsage}
                  maxLength={50}
                  onChange={(event) => setKontraAnsage(event.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>

            <div className="section-block">
              <label className="field-label">Gewinner</label>
              <div className="winner-grid">
                {selectedGamePlayerObjects.map((player) => {
                  const active = selectedWinners.includes(player.id);
                  return (
                    <button
                      type="button"
                      key={player.id}
                      className={active ? "winner-btn active" : "winner-btn"}
                      onClick={() => {
                        setSelectedWinners((prev) =>
                          prev.includes(player.id)
                            ? prev.filter((id) => id !== player.id)
                            : [...prev, player.id]
                        );
                      }}
                    >
                      {player.name}
                    </button>
                  );
                })}
              </div>
              <p className="helper-text">
                Re/Kontra: genau 2 Gewinner. Hochzeit: 1, 2 oder 3 Gewinner. Solo: 1 Gewinner oder 3 Gewinner.
              </p>
            </div>

            <div className="party-points-row">
              <div>
                <label className="field-label">Punkte Partei</label>
                <input
                  className="text-input"
                  type="number"
                  min={1}
                  step={1}
                  value={partyPoints}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setPartyPoints(Number.isNaN(value) ? 1 : value);
                  }}
                />
              </div>

              <div>
                <label className="field-label">Euro Partei</label>
                <input
                  className="text-input readonly-input"
                  type="text"
                  value={formatEuroAmount(
                    getEffectivePointsForDisplay(gewonnenVon, selectedWinners.length, partyPoints)
                  )}
                  readOnly
                />
              </div>
            </div>

            <div className="section-block">
              <label className="field-label">Kommentar</label>
              <textarea
                className="text-area"
                value={kommentar}
                maxLength={500}
                onChange={(event) => setKommentar(event.target.value)}
                placeholder="Freitext fuer Hinweise, Sonderfaelle oder Bemerkungen"
              />
            </div>

            <div className="preview-card">
              <strong>Vorschau</strong>

              <div className="preview-row">
                <span>Tisch:</span>
                <span>{selectedGamePlayerObjects.map((player) => player.name).join(", ") || "--"}</span>
              </div>

              <div className="preview-row">
                <span>Spieltyp:</span>
                <span>{gewonnenVon}</span>
              </div>

              {gewonnenVon === "Hochzeit" && (
                <div className="preview-row">
                  <span>Hochzeit-Spieler:</span>
                  <span>{getPlayerName(selectedGamePlayerObjects, hochzeitPlayerId)}</span>
                </div>
              )}

              {gewonnenVon === "Solo" && (
                <div className="preview-row">
                  <span>Solo-Spieler:</span>
                  <span>{getPlayerName(selectedGamePlayerObjects, soloPlayerId)}</span>
                </div>
              )}

              <div className="preview-row">
                <span>Siegerpartei:</span>
                <span>{siegerPartei}</span>
              </div>

              <div className="preview-row">
                <span>Runde:</span>
                <span>{isBockrunde ? "Bockrunde" : "Normalrunde"}</span>
              </div>

              <div className="preview-row">
                <span>Wertung:</span>
                <span>
                  {buildPreviewText(
                    selectedWinners.length,
                    partyPoints,
                    gewonnenVon,
                    hochzeitPlayerId,
                    soloPlayerId,
                    selectedGamePlayerObjects
                  )}
                </span>
              </div>

              <div className="preview-row">
                <span>Punkte Partei:</span>
                <span>{getEffectivePointsForDisplay(gewonnenVon, selectedWinners.length, partyPoints)}</span>
              </div>

              <div className="preview-row">
                <span>Euro Partei:</span>
                <span>
                  {formatEuroAmount(
                    getEffectivePointsForDisplay(gewonnenVon, selectedWinners.length, partyPoints)
                  )}
                </span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="secondary-btn"
                onClick={() => {
                  setShowAddGame(false);
                  resetGameForm();
                }}
              >
                Abbrechen
              </button>
              <button className="primary-btn" onClick={handleAddGame}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
