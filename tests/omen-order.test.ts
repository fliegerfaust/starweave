import { describe, expect, it } from 'vitest';
import { OMEN_LIST } from '../src/core/content/omens';
import { misorderedOmens } from '../src/core/omen-order';

const of = (kind: string) => OMEN_LIST.find((o) => o.kind === kind)!.id;
const inst = (...ids: string[]) => ids.map((id, i) => ({ uid: i, id, data: {} }));

describe('порядок Знамений', () => {
  it('умножающее перед прибавляющим — подсказка', () => {
    expect(misorderedOmens(inst(of('xmult'), of('light')))).toEqual({ xmult: of('xmult'), additive: of('light') });
    expect(misorderedOmens(inst(of('xmult'), of('gold'), of('mult')))?.additive).toBe(of('mult'));
  });

  it('правильный порядок и «правила» не трогаем', () => {
    expect(misorderedOmens(inst(of('light'), of('mult'), of('xmult')))).toBeNull();
    expect(misorderedOmens(inst(of('xmult'), of('rule'), of('gold')))).toBeNull();
    expect(misorderedOmens([])).toBeNull();
  });
});
