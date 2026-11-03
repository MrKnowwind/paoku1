import { CONFIG } from "./config.ts";

export interface ProgressSave {
  version: 2;
  wallet: number;
  boosters: number;
  hourglasses: number;
}
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type PurchaseResult = "ok" | "owned" | "funds" | "storage";
export const PROGRESS_KEY = "wild-dash:progress";
const integer = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

export class Economy {
  private value: ProgressSave = {
    version: 2,
    wallet: 0,
    boosters: 0,
    hourglasses: 0,
  };
  private storage: SaveStorage;
  constructor(storage: SaveStorage) {
    this.storage = storage;
    try {
      const data = JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null");
      if (data?.version === 1 || data?.version === 2)
        this.value = {
          version: 2,
          wallet: integer(data.wallet),
          boosters: data.version === 1
            ? (data.boosterUnlocked === true ? 1 : 0)
            : integer(data.boosters),
          hourglasses: integer(data.hourglasses),
        };
    } catch {
      /* Old settings and best scores live under separate, untouched keys. */
    }
  }
  get state(): Readonly<ProgressSave> {
    return { ...this.value };
  }
  private commit(next: ProgressSave, required: boolean): boolean {
    try {
      this.storage.setItem(PROGRESS_KEY, JSON.stringify(next));
    } catch {
      if (required) return false;
    }
    this.value = next;
    return true;
  }
  credit(count: number) {
    if (!Number.isSafeInteger(count) || count <= 0) return;
    this.commit(
      {
        ...this.value,
        wallet: Math.min(Number.MAX_SAFE_INTEGER, this.value.wallet + count),
      },
      false,
    );
  }
  flush() {
    this.commit(this.value, false);
  }
  buy(product: "booster" | "hourglass"): PurchaseResult {
    const price =
      product === "booster" ? CONFIG.boosterPrice : CONFIG.hourglassPrice;
    if (this.value.wallet < price) return "funds";
    const next = { ...this.value, wallet: this.value.wallet - price };
    if (product === "booster") next.boosters++;
    else next.hourglasses++;
    return this.commit(next, true) ? "ok" : "storage";
  }
  consumeBooster(): boolean {
    return (
      this.value.boosters > 0 &&
      this.commit({ ...this.value, boosters: this.value.boosters - 1 }, true)
    );
  }
  consumeHourglass(): boolean {
    return (
      this.value.hourglasses > 0 &&
      this.commit(
        { ...this.value, hourglasses: this.value.hourglasses - 1 },
        true,
      )
    );
  }
}
