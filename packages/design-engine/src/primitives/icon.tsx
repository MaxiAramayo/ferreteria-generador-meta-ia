import {
  BadgePercent,
  BatteryCharging,
  Blocks,
  Bolt,
  Brush,
  CarFront,
  Clock3,
  CreditCard,
  Drill,
  Droplets,
  Hammer,
  HardHat,
  House,
  MapPin,
  Package,
  PaintBucket,
  Phone,
  Plug,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  WashingMachine,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactElement } from "react";

import { DesignEngineError } from "../contracts/errors.ts";
import { isIconName, type IconName } from "../registry/icons.ts";
import { STROKES } from "../tokens/space.ts";

/**
 * Iconos por nombre semántico.
 *
 * El documento nombra una intención —`aceite`, `epp`, `promo`— y el motor
 * resuelve el icono de Lucide correspondiente. El generador anterior caía en
 * una llave inglesa cuando el nombre no existía; acá un nombre desconocido es
 * un error de contenido, porque una pieza publicada con el icono equivocado es
 * peor que una pieza que no se compone.
 */

const ICON_COMPONENTS: Readonly<Record<IconName, LucideIcon>> = Object.freeze({
  aceite: Droplets,
  automotor: CarFront,
  bateria: BatteryCharging,
  brocha: Brush,
  buloneria: Bolt,
  destacado: Sparkles,
  electricidad: Plug,
  epp: HardHat,
  herramienta: Drill,
  herramientas: Hammer,
  hogar: House,
  lubricentro: Wrench,
  pagos: CreditCard,
  pileta: Waves,
  pintura: PaintBucket,
  productos: Package,
  promo: BadgePercent,
  reloj: Clock3,
  repuestos: WashingMachine,
  rubros: Blocks,
  seguridad: ShieldCheck,
  sucursales: Store,
  tag: Tag,
  telefono: Phone,
  tienda: ShoppingBag,
  ubicacion: MapPin,
});

export function iconComponentFor(name: string): LucideIcon {
  if (!isIconName(name)) {
    throw new DesignEngineError(
      {
        issues: [{ code: "invalid-value", path: "content.icon" }],
        stage: "content",
      },
      "El nombre de icono no pertenece al registro semántico aprobado.",
    );
  }

  return ICON_COMPONENTS[name];
}

export interface IconProps {
  readonly color?: string | undefined;
  readonly name: IconName;
  readonly size?: number | undefined;
  readonly strokeWidth?: number | undefined;
}

export function Icon({
  color,
  name,
  size = 64,
  strokeWidth = STROKES.icon,
}: IconProps): ReactElement {
  const Component = iconComponentFor(name);

  return (
    <Component
      aria-hidden="true"
      color={color}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}
