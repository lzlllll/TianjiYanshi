/**
 * 公开测试版用户协议。
 * 正文直接取自项目根目录的「用户协议.txt」——改那份文件、重新构建即可，
 * 不在这里另抄一份，免得两处对不上。
 */
import raw from "../../用户协议.txt?raw";

/** 协议正文 */
export const AGREEMENT_TEXT: string = raw;

/** 当前协议版本，从正文里认；正文写成「**版本：** 0.1」，先把强调记号去掉再认。认不出便按 1 算 */
export const AGREEMENT_VERSION: string =
  /版本：\s*([0-9][0-9.]*)/.exec(raw.replace(/\*/g, ""))?.[1] ?? "1";

/** 记下用户按下的是哪一版协议 */
const AGREED_KEY = "xiuxian-terms-agreed";

/** 先前同意过的那一版；没同意过、或读不出来时给 null */
export function agreedVersion(): string | null {
  try {
    return localStorage.getItem(AGREED_KEY);
  } catch {
    return null;
  }
}

/** 眼下这一版是否已经同意过 */
export function hasAgreed(): boolean {
  return agreedVersion() === AGREEMENT_VERSION;
}

/** 记下已同意眼下这一版 */
export function markAgreed(): void {
  try {
    localStorage.setItem(AGREED_KEY, AGREEMENT_VERSION);
  } catch {
    // 隐私模式等存不下的情形：这次放行，下次再问一遍便是
  }
}
