import { forget } from '@/engine/canvas-life';

/**
 * Кэш спрайтов с вытеснением самого давнего (LRU). Без потолка кэш рос весь сеанс: каждый
 * размер карты, DPR и рубашка — новый холст, на телефоне это сотни мегабайт видеопамяти.
 */
export class SpriteCache {
  private map = new Map<string, HTMLCanvasElement>();

  constructor(readonly limit: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): HTMLCanvasElement | undefined {
    const hit = this.map.get(key);
    if (hit) {
      // Map хранит порядок вставки: перевставка делает ключ самым свежим
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit;
  }

  set(key: string, canvas: HTMLCanvasElement): void {
    this.map.delete(key);
    this.map.set(key, canvas);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value as string;
      const gone = this.map.get(oldest)!;
      this.map.delete(oldest);
      forget(gone);
      // Освободить буфер сразу, не дожидаясь сборщика (Safari держит его долго)
      gone.width = gone.height = 0;
    }
  }

  clear(): void {
    this.map.clear();
  }
}
