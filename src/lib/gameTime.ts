import type { GameTime } from "@/data/types";

/** 十二时辰，索引即 GameTime.hour：0=子时，1=丑时，……，11=亥时 */
export const SHICHEN_NAMES: string[] = [
  "子时", "丑时", "寅时", "卯时", "辰时", "巳时",
  "午时", "未时", "申时", "酉时", "戌时", "亥时",
];

/** 历法名，年份一律以此纪年，如「修真历514年」 */
export const ERA_NAME = "修真历";

/** 开局时刻：修真历 514 年 1 月 14 日卯时 */
export const OPENING_GAME_TIME: GameTime = { year: 514, month: 1, day: 14, hour: 3 };

/** 早期存档的年份从 1 起算，迁移时用它平移到修真历纪元 */
export const ERA_YEAR_OFFSET = OPENING_GAME_TIME.year - 1;

/** 开局那天即第一日；往后每过一天加一 */
export const OPENING_DAY_SERIAL = 1;

/** 一年十二个月，一月三十日；不做闰月，跨月跨年由叙事直接给出新的年月日 */
const MONTHS_PER_YEAR = 12;
const DAYS_PER_MONTH = 30;

/**
 * 早先的日序是按真实历法从 1 年 1 月 1 日数下来的绝对日，开局那天是 185054。
 * 如今开局算第一日，旧档里记下的那些日子要一并减去这个数才对得上。
 */
export const LEGACY_DAY_OFFSET =
  OPENING_GAME_TIME.year * MONTHS_PER_YEAR * DAYS_PER_MONTH +
  (OPENING_GAME_TIME.month - 1) * DAYS_PER_MONTH +
  OPENING_GAME_TIME.day -
  OPENING_DAY_SERIAL;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 数字折时辰：0-11 视为时辰序号，12-23 视为二十四小时制钟点 */
function hourNumberToIndex(value: number): number | null {
  const n = Math.trunc(value);
  if (n >= 0 && n <= 11) return n;
  if (n >= 12 && n <= 23) return Math.floor(((n + 1) % 24) / 2);
  return null;
}

/**
 * 把各种时辰写法归一到 0-11 的索引。
 * 优先认「午时」这样的名字，其次认「午」这类首字，最后才当数字处理；
 * 认不出来就沿用 fallback，绝不让脏值把界面上的时辰顶成空白。
 */
export function normalizeHour(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return hourNumberToIndex(value) ?? fallback;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return fallback;

    const exact = SHICHEN_NAMES.indexOf(text);
    if (exact >= 0) return exact;

    // 「午」「午时三刻」「正午时分」这类，取首字与时辰名比对
    const byFirstChar = SHICHEN_NAMES.findIndex((name) => name.startsWith(text.charAt(0)));
    if (byFirstChar >= 0) return byFirstChar;

    const num = Number(text);
    if (Number.isFinite(num)) return hourNumberToIndex(num) ?? fallback;
  }
  return fallback;
}

/** 时辰索引 → 时辰名 */
export function shichenName(hour: number): string {
  return SHICHEN_NAMES[normalizeHour(hour, 0)];
}

/**
 * 归一化整份时间。年份取正整数，月日夹在合理区间，
 * 时辰认名也认数；任何一项坏掉都退回 fallback 的对应字段。
 */
export function normalizeGameTime(value: unknown, fallback: GameTime = OPENING_GAME_TIME): GameTime {
  if (!value || typeof value !== "object") return { ...fallback };
  const raw = value as Partial<GameTime>;

  const year = Number(raw.year);
  const month = Number(raw.month);
  const day = Number(raw.day);

  return {
    year: Number.isFinite(year) && year > 0 ? Math.trunc(year) : fallback.year,
    month: Number.isFinite(month) ? clamp(Math.trunc(month), 1, MONTHS_PER_YEAR) : fallback.month,
    day: Number.isFinite(day) ? clamp(Math.trunc(day), 1, DAYS_PER_MONTH) : fallback.day,
    hour: raw.hour === undefined ? fallback.hour : normalizeHour(raw.hour, fallback.hour),
  };
}

/** 书写形式，如「修真历514年1月14日 子时」 */
export function formatGameTime(time: GameTime): string {
  return `${ERA_NAME}${time.year}年${time.month}月${time.day}日 ${shichenName(time.hour)}`;
}

/** 往后推几个时辰，跨日、跨月、跨年一并折算。城里打听、等候这类事是要花时辰的 */
export function shiftGameTime(time: GameTime, hours: number): GameTime {
  const steps = Math.trunc(hours);
  if (!Number.isFinite(steps) || steps === 0) return { ...time };

  const perDay = SHICHEN_NAMES.length;
  const total = time.hour + steps;
  const hour = ((total % perDay) + perDay) % perDay;
  let day = time.day + Math.floor(total / perDay);
  let month = time.month;
  let year = time.year;

  while (day > DAYS_PER_MONTH) {
    day -= DAYS_PER_MONTH;
    month += 1;
  }
  while (month > MONTHS_PER_YEAR) {
    month -= MONTHS_PER_YEAR;
    year += 1;
  }
  return { year, month, day, hour };
}

/** 日期键，只到日，用来判断是否跨天 */
export function gameDateKey(time: GameTime): string {
  return `${time.year}-${time.month}-${time.day}`;
}

/** 月份键，只到月，用来判断是否跨月（按月结算的进项拿它比对） */
export function gameMonthKey(time: GameTime): string {
  return `${time.year}-${time.month}`;
}

/**
 * 日序：把年月日折成一个整数，只用来比日子的先后。
 * 开局那天便是第一日，往后逐日加一——叙事与界面上的「第几日」都照这个数说，
 * 免得开局头一天就顶着个十几万的数目。
 */
export function daySerial(time: GameTime): number {
  const year = Number(time?.year);
  const month = Number(time?.month);
  const day = Number(time?.day);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return OPENING_DAY_SERIAL;
  }
  return (
    (Math.trunc(year) - OPENING_GAME_TIME.year) * MONTHS_PER_YEAR * DAYS_PER_MONTH +
    (Math.trunc(month) - OPENING_GAME_TIME.month) * DAYS_PER_MONTH +
    (Math.trunc(day) - OPENING_GAME_TIME.day) +
    OPENING_DAY_SERIAL
  );
}

/** 把日期键还原成书写形式；键坏掉就原样返回，界面上不至于变成空白 */
export function formatDateKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return key;
  return `${ERA_NAME}${year}年${month}月${day}日`;
}

/**
 * 时辰序：日序乘十二再加上时辰，只用来比时刻的先后。
 * 「持续到某时」这类时效都拿它比对。
 */
export function timeSerial(time: GameTime): number {
  return daySerial(time) * SHICHEN_NAMES.length + normalizeHour(time.hour, 0);
}

/** a 是否已经到（或过了）b 这个时刻 */
export function reached(a: GameTime, b: GameTime): boolean {
  return timeSerial(a) >= timeSerial(b);
}

/** 书写形式，如「514年2月18日 午时」；不带纪元，嵌在句子里的时效用它 */
export function formatTimeShort(time: GameTime): string {
  return `${time.year}年${time.month}月${time.day}日 ${shichenName(time.hour)}`;
}
