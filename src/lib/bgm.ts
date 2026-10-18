/**
 * 背景音乐。
 *
 * 两轨常驻：日常一轨（醉酒）、战斗一轨（将军令）。场景切换时不是硬切，
 * 而是旧的一轨淡出、新的一轨淡入；音量由设置里的滑杆定，改了即刻生效。
 *
 * 音频文件与 game_data、image_assets 一样走 /game/ 前缀：开发态由 Vite 中间件
 * 直接托管项目根目录，打包后由本地服务取 resources/game/music。
 *
 * 浏览器不许无声自动播放，故第一下手势（点击或按键）之后才真正出声。
 */

type Scene = "daily" | "battle";

const TRACKS: Record<Scene, string> = {
  daily: new URL("game/music/Jiukuang.mp3", document.baseURI).href,
  battle: new URL("game/music/Jiangjunling.mp3", document.baseURI).href,
};

const SCENES: Scene[] = ["daily", "battle"];

/** 交叉淡化时长 */
const FADE_MS = 900;
/** 淡化每步的间隔 */
const TICK_MS = 40;

/** 缺省音量：默认关闭，玩家可在设置里自行开启 */
export const DEFAULT_BGM_VOLUME = 0;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

class BgmPlayer {
  private players: Partial<Record<Scene, HTMLAudioElement>> = {};
  /** 眼下该响的那一轨 */
  private scene: Scene = "daily";
  /** 玩家设定的音量，0 到 1 */
  private volume = DEFAULT_BGM_VOLUME;
  /** 每一轨各自的淡化系数：1 为满声，0 为静默 */
  private levels: Record<Scene, number> = { daily: 0, battle: 0 };
  private timer: number | null = null;
  /** 是否已经过了一次玩家手势；没有便不出声，只把状态记下 */
  private unlocked = false;
  private bound = false;

  constructor() {
    // 开局场景与缺省相同，setScene 会直接返回，故在构造时就把手势哨挂上
    this.bindUnlock();
  }

  /** 取一轨的播放器；头一回用到时才建，免得开局先白拉两份音频 */
  private player(scene: Scene): HTMLAudioElement {
    let el = this.players[scene];
    if (!el) {
      el = new Audio(TRACKS[scene]);
      el.loop = true;
      el.preload = "auto";
      el.volume = 0;
      this.players[scene] = el;
    }
    return el;
  }

  private bindUnlock(): void {
    if (this.bound || typeof window === "undefined") return;
    this.bound = true;
    const unlock = () => {
      this.unlocked = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      this.apply();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  /** 换场景：旧轨淡出，新轨淡入 */
  setScene(scene: Scene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.apply();
  }

  /** 调音量：静音即停，调回有声再从头淡入 */
  setVolume(volume: number): void {
    const next = clamp01(volume);
    const wasSilent = this.volume <= 0;
    this.volume = next;

    if (this.volume <= 0) {
      for (const scene of SCENES) {
        const el = this.players[scene];
        if (el) {
          el.volume = 0;
          if (!el.paused) {
            el.pause();
            el.currentTime = 0;
          }
        }
        this.levels[scene] = 0;
      }
      if (this.timer !== null) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }

    for (const scene of SCENES) {
      const el = this.players[scene];
      if (el) el.volume = clamp01(this.volume * this.levels[scene]);
    }
    // 从静音调回来：此刻才真正开始放
    if (wasSilent) this.apply();
  }

  /** 照当前场景与音量，把两轨往各自的目标推 */
  private apply(): void {
    this.bindUnlock();
    if (!this.unlocked || this.volume <= 0) return;
    for (const scene of SCENES) {
      const el = this.player(scene);
      // 该响的那一轨从该响的地方起：前一战放完便回到开头，下一战从头再来
      if (scene === this.scene && el.paused) {
        el.currentTime = 0;
        void el.play().catch(() => {
          /* 自动播放被拦下时不必强求，等下一次手势 */
        });
      }
    }
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const step = TICK_MS / FADE_MS;
    let moving = false;

    for (const scene of SCENES) {
      const el = this.player(scene);
      const target = scene === this.scene && this.unlocked ? 1 : 0;
      const level = this.levels[scene];
      let next = level;
      if (level < target) next = Math.min(target, level + step);
      else if (level > target) next = Math.max(target, level - step);
      if (next !== level) {
        this.levels[scene] = next;
        moving = true;
      }
      el.volume = clamp01(this.volume * next);
      // 淡尽的那一轨停下并归零，下次从头放
      if (next === 0 && !el.paused) {
        el.pause();
        el.currentTime = 0;
      }
    }

    if (!moving && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/** 全局只此一份 */
export const bgm = new BgmPlayer();
