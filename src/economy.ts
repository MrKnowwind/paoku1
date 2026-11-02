import { CONFIG } from "./config.ts";

export interface ProgressSave {
  version: 1;
  wallet: number;
  boosterUnlocked: boolean;
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
    version: 1,
    wallet: 0,
    boosterUnlocked: false,
    hourglasses: 0,
  };
  private storage: SaveStorage;
  constructor(storage: SaveStorage) {
    this.storage = storage;
    try {
      const data = JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null");
      if (data?.version === 1)
        this.value = {
          version: 1,
          wallet: integer(data.wallet),
          boosterUnlocked: data.boosterUnlocked === true,
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
    if (product === "booster" && this.value.boosterUnlocked) return "owned";
    const price =
      product === "booster" ? CONFIG.boosterPrice : CONFIG.hourglassPrice;
    if (this.value.wallet < price) return "funds";
    const next = { ...this.value, wallet: this.value.wallet - price };
    if (product === "booster") next.boosterUnlocked = true;
    else next.hourglasses++;
    return this.commit(next, true) ? "ok" : "storage";
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
