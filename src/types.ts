export type Session = {
  token: string;
  nombre: string;
  correoElectronico: string;
};

export type Direccion = {
  id: number;
  calle: string;
  ciudad: string;
  estado: string;
  codigoPostal: string;
  casaId?: number | null;
};

export type Casa = {
  id: number;
  cantidadPersonas: string;
  isComplete: boolean;
  numeroContrato?: string | null;
  usuarioId?: number | null;
  direccion?: Direccion | null;
};

export type Factura = {
  id: number;
  casaId: number | null;
  numeroContrato: string;
  fechaEmision: string;
  fechaPago: string | null;
  consumoAcueductoM3: number;
  consumoAlcantarilladoM3: number;
  consumoEnergiaKwh: number;
  consumoGasM3: number;
};

export type ServicioKey =
  | "consumoEnergiaKwh"
  | "consumoAcueductoM3"
  | "consumoAlcantarilladoM3"
  | "consumoGasM3";

export type ConsumoRecomendacion = {
  servicio: string;
  unidad: string;
  consumoActual: number;
  consumoTrimestreAnterior: number | null;
  variacionPorcentual: number | null;
  recomendacion: string;
};

export type RecomendacionTrimestral = {
  casaId: number;
  anio: number;
  trimestre: number;
  energia: ConsumoRecomendacion;
  acueducto: ConsumoRecomendacion;
  alcantarillado: ConsumoRecomendacion;
  gas: ConsumoRecomendacion;
};
