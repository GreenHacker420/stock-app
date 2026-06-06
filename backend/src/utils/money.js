import { Prisma } from "../generated/prisma/index.js";

export const MONEY_SCALE = 2;

export const ZERO = new Prisma.Decimal(0);
export const ONE = new Prisma.Decimal(1);

export function money(value) {
  if (value === undefined || value === null) {
    return ZERO;
  }
  // Convert value to string if it's a number to avoid float precision issues during instantiation
  const val = typeof value === "number" ? value.toString() : value;
  return new Prisma.Decimal(val).toDecimalPlaces(
    MONEY_SCALE,
    Prisma.Decimal.ROUND_HALF_UP
  );
}

export function add(a, b) {
  return money(money(a).plus(money(b)));
}

export function sub(a, b) {
  return money(money(a).minus(money(b)));
}

export function mul(a, b) {
  return money(money(a).times(money(b)));
}

export function div(a, b) {
  return money(money(a).div(money(b)));
}

export function isZero(v) {
  return money(v).eq(ZERO);
}
