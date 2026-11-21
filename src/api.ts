import type {
  CargaDemo,
  Casa,
  Factura,
  RecomendacionTrimestral,
  Session,
} from "./types";

export const API_BASE = "http://127.0.0.1:5200";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `Error ${response.status}`;
  try {
    const body = JSON.parse(text) as {
      message?: string;
      title?: string;
      errors?: Record<string, string[]>;
    };
    if (body.errors) {
      const details = Object.values(body.errors).flat().filter(Boolean);
      if (details.length) return details.join(" ");
    }
    return body.message || body.title || text;
  } catch {
    return text;
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el backend en http://127.0.0.1:5200.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function login(correoElectronico: string, password: string) {
  return request<Session>("/api/Auth/login", {
    method: "POST",
    body: JSON.stringify({ correoElectronico, password }),
  });
}

export function register(nombre: string, correoElectronico: string, password: string) {
  return request<Session>("/api/Auth/register", {
    method: "POST",
    body: JSON.stringify({ nombre, correoElectronico, password }),
  });
}

export function getCasas(token: string) {
  return request<Casa[]>("/api/Casa", {}, token);
}

export function crearCasa(
  token: string,
  cantidadPersonas: string,
  numeroContrato?: string,
) {
  return request<Casa>(
    "/api/Casa",
    {
      method: "POST",
      body: JSON.stringify({
        cantidadPersonas,
        ...(numeroContrato ? { numeroContrato } : {}),
      }),
    },
    token,
  );
}

export function getFacturas(token: string) {
  return request<Factura[]>("/api/Factura", {}, token);
}

export function getRecomendacionesTrimestrales(token: string) {
  return request<RecomendacionTrimestral[]>(
    "/api/Factura/recomendaciones-trimestrales",
    {},
    token,
  );
}

export function cargarDatosDemo(token: string) {
  return request<CargaDemo>("/api/Factura/datos-demo", { method: "POST" }, token);
}

export async function getLineaTiempoSvg(token: string, numeroContrato: string) {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE}/api/Factura/linea-tiempo/${encodeURIComponent(numeroContrato)}.svg`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    throw new ApiError(0, "No se pudo conectar con el backend en http://127.0.0.1:5200.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return response.blob();
}

export function crearFactura(
  token: string,
  payload: {
    casaId: number | null;
    numeroContrato: string;
    cantidadPersonas?: string;
    fechaEmision: string;
    fechaPago: string | null;
    consumoAcueductoM3: number;
    consumoAlcantarilladoM3: number;
    consumoEnergiaKwh: number;
    consumoGasM3: number;
  },
) {
  return request<Factura>(
    "/api/Factura",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}
