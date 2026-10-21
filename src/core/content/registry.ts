/**
 * Реестр контента по id без прототипа (SEC.5): `REG['constructor']` и `REG['__proto__']` —
 * `undefined`, а не служебные поля объекта. Ключи приходят из ссылок вызова, сохранений и
 * облака — им нельзя доверять.
 */
export function registry<T extends { id: string }>(list: readonly T[]): Record<string, T> {
  const reg = Object.create(null) as Record<string, T>;
  for (const item of list) reg[item.id] = item;
  return reg;
}
