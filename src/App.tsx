import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  cargarDatosDemo,
  crearCasa,
  crearFactura,
  getCasas,
  getFacturas,
  getLineaTiempoSvg,
  getRecomendacionesTrimestrales,
  login,
  register,
} from "./api";
import type {
  Casa,
  Factura,
  RecomendacionTrimestral,
  ServicioKey,
  Session,
} from "./types";

const SESSION_KEY = "energyfront.session";

const SERVICIOS: { key: ServicioKey; label: string; unit: string }[] = [
  { key: "consumoEnergiaKwh", label: "Energía", unit: "kWh" },
  { key: "consumoAcueductoM3", label: "Acueducto", unit: "m³" },
  { key: "consumoAlcantarilladoM3", label: "Alcantarillado", unit: "m³" },
  { key: "consumoGasM3", label: "Gas", unit: "m³" },
];

const quantity = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 3,
});

function formatConsumption(value: number, unit: string) {
  return `${quantity.format(value)} ${unit}`;
}

function monthKey(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("es-CO", {
    month: "short",
    year: "2-digit",
  });
}

function readId(value: { id?: number; Id?: number }) {
  return value.id ?? value.Id ?? 0;
}

function asCasa(raw: Casa): Casa {
  const source = raw as Casa & {
    Id?: number;
    CantidadPersonas?: string;
    NumeroContrato?: string | null;
    Direccion?: Casa["direccion"];
  };
  return {
    ...raw,
    id: readId(source),
    cantidadPersonas: raw.cantidadPersonas ?? source.CantidadPersonas ?? "",
    numeroContrato: raw.numeroContrato ?? source.NumeroContrato ?? null,
    direccion: raw.direccion ?? source.Direccion ?? null,
  };
}

function casaLabel(casa: Casa) {
  const personas = `${casa.cantidadPersonas} pers.`;
  const ubicacion = casa.direccion
    ? `${casa.direccion.calle}, ${casa.direccion.ciudad}`
    : `Casa ${casa.id}`;
  const contrato = casa.numeroContrato ? ` · Contrato ${casa.numeroContrato}` : "";
  return `${ubicacion} · ${personas}${contrato}`;
}

function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  function enter(next: Session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }

  function leave() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  return session ? (
    <Dashboard session={session} onLogout={leave} />
  ) : (
    <AuthScreen onSuccess={enter} />
  );
}

function AuthScreen({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session =
        mode === "login"
          ? await login(correo, password)
          : await register(nombre, correo, password);
      onSuccess(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-copy">
        <p className="eyebrow">EnergyFront</p>
        <h1>Mira cuánto consume cada casa, mes a mes.</h1>
        <p>
          Energía, acueducto, alcantarillado y gas, leídos directo del backend en
          127.0.0.1:5200.
        </p>
      </section>
      <form className="panel auth-card" onSubmit={submit}>
        <div className="segment">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Crear cuenta
          </button>
        </div>
        {mode === "register" && (
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} />
          </label>
        )}
        <label>
          Correo
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "register" ? 8 : 1}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Conectando…" : mode === "login" ? "Ver consumos" : "Registrarme"}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [casas, setCasas] = useState<Casa[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [recomendaciones, setRecomendaciones] = useState<RecomendacionTrimestral[]>([]);
  const [casaId, setCasaId] = useState("todas");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [timelineUrl, setTimelineUrl] = useState("");
  const [timelineContract, setTimelineContract] = useState("");
  const [timelineBusy, setTimelineBusy] = useState(false);
  const casaSeleccionada = casas.find((casa) => String(casa.id) === casaId);

  useEffect(() => {
    return () => {
      if (timelineUrl) URL.revokeObjectURL(timelineUrl);
    };
  }, [timelineUrl]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [nextCasas, nextFacturas, nextRecomendaciones] = await Promise.all([
        getCasas(session.token),
        getFacturas(session.token),
        getRecomendacionesTrimestrales(session.token),
      ]);
      setCasas(nextCasas.map(asCasa));
      setFacturas(nextFacturas);
      setRecomendaciones(nextRecomendaciones);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los consumos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [session.token]);

  async function cargarDemo() {
    setDemoBusy(true);
    setError("");
    setNotice("");
    try {
      const resultado = await cargarDatosDemo(session.token);
      setNotice(
        `${resultado.aviso} Se agregaron ${resultado.facturasAgregadas} facturas; ` +
          `${resultado.mesesOmitidos} meses ya tenían datos.`,
      );
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los datos demo.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function cargarLineaTiempo() {
    if (!casaSeleccionada?.numeroContrato) return;
    setTimelineBusy(true);
    setError("");
    try {
      const imagen = await getLineaTiempoSvg(session.token, casaSeleccionada.numeroContrato);
      setTimelineUrl(URL.createObjectURL(imagen));
      setTimelineContract(casaSeleccionada.numeroContrato);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la línea de tiempo.");
    } finally {
      setTimelineBusy(false);
    }
  }

  const visibles = useMemo(
    () =>
      facturas.filter((factura) => casaId === "todas" || String(factura.casaId) === casaId),
    [facturas, casaId],
  );

  const consumosPorServicio = useMemo(
    () =>
      SERVICIOS.reduce(
        (totales, servicio) => {
          totales[servicio.key] = visibles.reduce(
            (sum, factura) => sum + factura[servicio.key],
            0,
          );
          return totales;
        },
        {} as Record<ServicioKey, number>,
      ),
    [visibles],
  );

  const meses = useMemo(() => {
    const map = new Map<string, Record<ServicioKey, number>>();
    for (const factura of visibles) {
      const key = monthKey(factura.fechaEmision);
      const row = map.get(key) ?? {
        consumoEnergiaKwh: 0,
        consumoAcueductoM3: 0,
        consumoAlcantarilladoM3: 0,
        consumoGasM3: 0,
      };
      for (const servicio of SERVICIOS) row[servicio.key] += factura[servicio.key];
      map.set(key, row);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibles]);

  const recomendacionesVisibles = recomendaciones.filter(
    (recomendacion) => casaId === "todas" || String(recomendacion.casaId) === casaId,
  );

  const recomendacionServicios: {
    key: keyof Pick<RecomendacionTrimestral, "energia" | "acueducto" | "alcantarillado" | "gas">;
    className: ServicioKey;
  }[] = [
    { key: "energia", className: "consumoEnergiaKwh" },
    { key: "acueducto", className: "consumoAcueductoM3" },
    { key: "alcantarillado", className: "consumoAlcantarilladoM3" },
    { key: "gas", className: "consumoGasM3" },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">EnergyFront</p>
          <strong>{session.nombre}</strong>
        </div>
        <div className="top-actions">
          <span className="api-pill">127.0.0.1:5200</span>
          {import.meta.env.DEV && (
            <button type="button" className="ghost" onClick={() => void cargarDemo()} disabled={demoBusy}>
              {demoBusy ? "Cargando demo…" : "Cargar datos demo"}
            </button>
          )}
          <button type="button" onClick={() => setShowForm((open) => !open)}>
            {showForm ? "Cerrar registro" : "Registrar consumo"}
          </button>
          <button type="button" className="ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>Consumos del hogar</h1>
          <p>{session.correoElectronico}</p>
        </div>
        <label className="house-filter">
          Casa
          <select value={casaId} onChange={(e) => setCasaId(e.target.value)}>
            <option value="todas">Todas las casas</option>
            {casas.map((casa) => (
              <option key={casa.id} value={casa.id}>
                {casaLabel(casa)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel timeline-panel">
        <header className="recommendations-header">
          <div>
            <h2>Línea de tiempo trimestral</h2>
            <p className="muted">Hasta ocho trimestres, con escala independiente para cada servicio.</p>
          </div>
          <button
            type="button"
            onClick={() => void cargarLineaTiempo()}
            disabled={!casaSeleccionada?.numeroContrato || timelineBusy}
          >
            {timelineBusy ? "Generando…" : "Ver gráfico"}
          </button>
        </header>
        {casaId === "todas" ? (
          <p className="muted">Selecciona una casa para consultar su línea de tiempo.</p>
        ) : !casaSeleccionada?.numeroContrato ? (
          <p className="muted">La casa seleccionada aún no tiene número de contrato asociado.</p>
        ) : timelineUrl && timelineContract === casaSeleccionada.numeroContrato ? (
          <img
            className="timeline-image"
            src={timelineUrl}
            alt={`Consumo trimestral del contrato ${timelineContract}`}
          />
        ) : (
          <p className="muted">Genera el gráfico para ver los consumos trimestrales.</p>
        )}
      </section>

      {error && <p className="error banner">{error}</p>}
      {notice && <p className="notice banner">{notice}</p>}

      {showForm && (
        <RegistroPanel
          token={session.token}
          casas={casas}
          onCasaCreada={(casa) => {
            setCasas((actuales) => {
              const next = asCasa(casa);
              return actuales.some((item) => item.id === next.id) ? actuales : [...actuales, next];
            });
            setNotice(`Casa ${readId(casa)} lista. Ya puedes guardar la factura.`);
          }}
          onDone={async (message) => {
            setNotice(message);
            setShowForm(false);
            await refresh();
          }}
        />
      )}

      <section className="kpis">
        {SERVICIOS.map((servicio) => (
          <article key={servicio.key} className={`kpi ${servicio.key}`}>
            <span>{servicio.label} · {servicio.unit}</span>
            <strong>{quantity.format(consumosPorServicio[servicio.key] ?? 0)}</strong>
          </article>
        ))}
      </section>

      <section className="grid">
        {SERVICIOS.map((servicio) => {
          const maxConsumo = Math.max(1, ...meses.map(([, row]) => row[servicio.key]));
          return (
            <article key={servicio.key} className="panel chart-card">
              <header>
                <h2>{servicio.label} mensual <span className="muted">({servicio.unit})</span></h2>
              </header>
              {loading ? (
                <p className="muted">Cargando consumos…</p>
              ) : meses.length === 0 ? (
                <p className="muted">Aún no hay consumos registrados.</p>
              ) : (
                <div
                  className="chart"
                  role="img"
                  aria-label={`${servicio.label} mensual en ${servicio.unit}`}
                >
                  {meses.map(([key, row]) => (
                    <div
                      key={key}
                      className="bar-col"
                      title={`${monthLabel(key)} · ${formatConsumption(row[servicio.key], servicio.unit)}`}
                    >
                      <div
                        className="bar"
                        style={{ height: `${(row[servicio.key] / maxConsumo) * 100}%` }}
                      >
                        <span className={servicio.key} />
                      </div>
                      <small>{monthLabel(key)}</small>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="panel recommendations">
        <header className="recommendations-header">
          <h2>Recomendaciones trimestrales</h2>
          <span>{recomendacionesVisibles.length} casas</span>
        </header>
        {loading ? (
          <p className="muted">Cargando recomendaciones…</p>
        ) : recomendacionesVisibles.length === 0 ? (
          <p className="muted">
            No hay recomendaciones disponibles. Registra consumos para generar una referencia trimestral.
          </p>
        ) : (
          <div className="recommendation-list">
            {recomendacionesVisibles.map((item) => {
              const casa = casas.find((actual) => actual.id === item.casaId);
              return (
                <article key={item.casaId} className="recommendation-house">
                  <h3>{casa ? casaLabel(casa) : `Casa ${item.casaId}`}</h3>
                  <p className="muted">
                    Trimestre {item.trimestre} de {item.anio} · {item.cantidadFacturas}{" "}
                    {item.cantidadFacturas === 1 ? "factura" : "facturas"} ·{" "}
                    {item.esPreliminar ? "Periodo en curso" : "Periodo cerrado"}
                  </p>
                  <div className="recommendation-services">
                    {recomendacionServicios.map(({ key, className }) => {
                      const consumo = item[key];
                      return (
                        <div key={key} className={`recommendation-service ${className}`}>
                          <strong>
                            {consumo.servicio}: {formatConsumption(consumo.consumoActual, consumo.unidad)}
                          </strong>
                          {consumo.consumoTrimestreAnterior !== null && (
                            <span className="muted">
                              Trimestre anterior: {formatConsumption(
                                consumo.consumoTrimestreAnterior,
                                consumo.unidad,
                              )}
                              {consumo.variacionPorcentual !== null &&
                                ` · ${quantity.format(consumo.variacionPorcentual)}%`}
                            </span>
                          )}
                          <p>{consumo.recomendacion}</p>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel table-card">
        <header>
          <h2>Facturas</h2>
          <span>{visibles.length} registros</span>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Emisión</th>
                <th>Contrato</th>
                <th>Casa</th>
                <th>Energía (kWh)</th>
                <th>Acueducto (m³)</th>
                <th>Alcantarillado (m³)</th>
                <th>Gas (m³)</th>
                <th>Pago</th>
              </tr>
            </thead>
            <tbody>
              {[...visibles]
                .sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision))
                .map((factura) => {
                  const casa = casas.find((item) => item.id === factura.casaId);
                  return (
                    <tr key={factura.id}>
                      <td>{new Date(factura.fechaEmision).toLocaleDateString("es-CO")}</td>
                      <td>{factura.numeroContrato}</td>
                      <td>{casa ? casaLabel(casa) : factura.casaId ?? "—"}</td>
                      <td>{quantity.format(factura.consumoEnergiaKwh)}</td>
                      <td>{quantity.format(factura.consumoAcueductoM3)}</td>
                      <td>{quantity.format(factura.consumoAlcantarilladoM3)}</td>
                      <td>{quantity.format(factura.consumoGasM3)}</td>
                      <td>
                        {factura.fechaPago
                          ? new Date(factura.fechaPago).toLocaleDateString("es-CO")
                          : "Pendiente"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RegistroPanel({
  token,
  casas,
  onCasaCreada,
  onDone,
}: {
  token: string;
  casas: Casa[];
  onCasaCreada: (casa: Casa) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [personas, setPersonas] = useState("3");
  const [casaId, setCasaId] = useState(casas[0] ? String(casas[0].id) : "");
  const [numeroContrato, setNumeroContrato] = useState("");
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().slice(0, 10));
  const [fechaPago, setFechaPago] = useState("");
  const [consumoEnergiaKwh, setConsumoEnergiaKwh] = useState("");
  const [consumoAcueductoM3, setConsumoAcueductoM3] = useState("");
  const [consumoAlcantarilladoM3, setConsumoAlcantarilladoM3] = useState("");
  const [consumoGasM3, setConsumoGasM3] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const casaSeleccionada = casas.find((casa) => String(casa.id) === casaId);

  useEffect(() => {
    setNumeroContrato(casaSeleccionada?.numeroContrato ?? "");
  }, [casaId, casas]);

  async function crearNuevaCasa() {
    const casa = asCasa(
      await crearCasa(token, personas.trim() || "1", numeroContrato.trim() || undefined),
    );
    setCasaId(String(casa.id));
    onCasaCreada(casa);
    return casa;
  }

  async function guardarFactura(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await crearFactura(token, {
        casaId: casaId ? Number(casaId) : null,
        numeroContrato: numeroContrato.trim(),
        ...(!casaId ? { cantidadPersonas: personas.trim() || "1" } : {}),
        fechaEmision: new Date(fechaEmision).toISOString(),
        fechaPago: fechaPago ? new Date(fechaPago).toISOString() : null,
        consumoAcueductoM3: Number(consumoAcueductoM3 || 0),
        consumoAlcantarilladoM3: Number(consumoAlcantarilladoM3 || 0),
        consumoEnergiaKwh: Number(consumoEnergiaKwh || 0),
        consumoGasM3: Number(consumoGasM3 || 0),
      });
      await onDone("Factura registrada.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la factura.");
      setBusy(false);
    }
  }

  return (
    <section className="panel registro">
      <div>
        <h2>Nueva casa</h2>
        <label>
          Personas
          <input value={personas} onChange={(e) => setPersonas(e.target.value)} required />
        </label>
        <label>
          Número de contrato (opcional)
          <input
            value={numeroContrato}
            onChange={(e) => setNumeroContrato(e.target.value)}
            maxLength={100}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setBusy(true);
            setError("");
            void crearNuevaCasa()
              .catch((err: unknown) => {
                setError(err instanceof ApiError ? err.message : "No se pudo crear la casa.");
              })
              .finally(() => setBusy(false));
          }}
          disabled={busy}
        >
          Crear casa
        </button>
      </div>
      <form onSubmit={guardarFactura}>
        <h2>Nueva factura</h2>
        <div className="form-grid">
          <label>
            Casa
            <select value={casaId} onChange={(e) => setCasaId(e.target.value)}>
              <option value="">Buscar o crear por número de contrato</option>
              {casas.map((casa) => (
                <option key={casa.id} value={String(casa.id)}>
                  {casaLabel(casa)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {casaSeleccionada?.numeroContrato ? "Contrato asociado" : "Contrato"}
            <input
              value={numeroContrato}
              onChange={(e) => setNumeroContrato(e.target.value)}
              required
              maxLength={100}
              readOnly={Boolean(casaSeleccionada?.numeroContrato)}
            />
          </label>
          <label>
            Emisión
            <input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} required />
          </label>
          <label>
            Pago
            <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </label>
          <label>
            Energía (kWh)
            <input type="number" min="0" step="0.001" value={consumoEnergiaKwh} onChange={(e) => setConsumoEnergiaKwh(e.target.value)} required />
          </label>
          <label>
            Acueducto (m³)
            <input type="number" min="0" step="0.001" value={consumoAcueductoM3} onChange={(e) => setConsumoAcueductoM3(e.target.value)} required />
          </label>
          <label>
            Alcantarillado (m³)
            <input type="number" min="0" step="0.001" value={consumoAlcantarilladoM3} onChange={(e) => setConsumoAlcantarilladoM3(e.target.value)} required />
          </label>
          <label>
            Gas (m³)
            <input type="number" min="0" step="0.001" value={consumoGasM3} onChange={(e) => setConsumoGasM3(e.target.value)} required />
          </label>
        </div>
        {!casaId && (
          <p className="muted">
            Se buscará una casa asociada a este contrato. Si no existe, se creará con la cantidad de personas indicada.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          Guardar factura
        </button>
      </form>
    </section>
  );
}
