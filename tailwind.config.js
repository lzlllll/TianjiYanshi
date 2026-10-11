/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 宣纸色系 - 古籍纸张质感
        paper: {
          fresh: "#FEFBF2",    // 新纸 - 主背景
          aged: "#F8F3E8",     // 陈纸 - 次要背景
          old: "#F0E5D1",      // 旧纸 - 边缘泛黄
          dark: "#E8DCC0",     // 深旧纸 - 阴影区域
          spine: "#2C2416",    // 书脊 - 深色装订
          // 数字档：旧面板/弹窗沿用了 paper-50..900 作「文字与描边」，
          // 线装古籍是浅底，故这里统一取墨色，保证浅底上的可读性
          50: "#5A4A38",
          100: "#4A3C28",
          200: "#3E3221",
          300: "#33291B",
          400: "#2A1F12",
          500: "#241B0F",
          600: "#1E160C",
          700: "#1A1410",
          800: "#160F0B",
          900: "#0F0A07",
        },
        // 墨色系 - 文字和线条
        ink: {
          lightest: "#8B7355", // 淡墨 - 辅助文字
          light: "#6B5644",    // 轻墨 - 说明文字
          medium: "#4A3C28",   // 中墨 - 正文
          dark: "#2A1F12",     // 浓墨 - 标题
          darkest: "#1A1410",  // 焦墨 - 强调
          // 数字档：旧面板/弹窗沿用了 ink-800/900 作「底色」，
          // 线装古籍是浅底，故这里取偏深的纸色，作浅色底片与按钮
          50: "#F5EFE1",
          100: "#F0E9D8",
          200: "#EAE1CC",
          300: "#E3D8BE",
          400: "#DDD0B2",
          500: "#D5C7A6",
          600: "#CDBD9A",
          700: "#C5B48E",
          800: "#BCAA82",
          900: "#B3A076",
        },
        // 朱砂色系 - 印章和重点
        cinnabar: {
          light: "#D94F3D",    // 淡朱砂
          DEFAULT: "#C1432E",  // 标准朱砂 - 印章
          dark: "#A8261F",     // 深朱砂
          darker: "#8F1810",   // 暗朱砂
          200: "#E8A092",
          300: "#DE7562",
          400: "#D94F3D",
          500: "#C1432E",
          600: "#A8261F",
        },
        // 金色系 - 标题装饰
        gold: {
          light: "#FFE4A0",    // 淡金
          DEFAULT: "#D4AF37",  // 标准金 - 标题装饰
          dark: "#B8941F",     // 深金
          100: "#FFEFC2",
          200: "#EBD07E",
          300: "#D9BA4E",
          400: "#C9A227",      // 常用文字金，压暗以便浅底可读
          500: "#B8941F",
          600: "#9A7B14",
        },
        // 保留原有色系
        pine: {
          400: "#4f6262",
          500: "#3a4a4a",
          600: "#2c3838",
          700: "#1f2828",
        },
        jade: {
          200: "#A8C9B8",
          300: "#7FAE95",
          400: "#5a8a72",
          500: "#3f6b58",
          600: "#2F5242",
        },
        aura: {
          cyan: "rgb(130, 195, 210)",
          purple: "rgb(168, 135, 205)",
          gold: "rgb(230, 185, 115)",
        },
        spiritual: {
          100: "rgba(130, 195, 210, 0.1)",
          200: "rgba(130, 195, 210, 0.2)",
          300: "rgba(130, 195, 210, 0.3)",
          400: "rgba(130, 195, 210, 0.4)",
          500: "rgba(130, 195, 210, 0.5)",
          600: "rgba(130, 195, 210, 0.6)",
          700: "rgba(130, 195, 210, 0.7)",
          800: "rgba(130, 195, 210, 0.8)",
          900: "rgba(130, 195, 210, 0.9)",
        },
        formation: {
          100: "rgba(168, 135, 205, 0.1)",
          200: "rgba(168, 135, 205, 0.2)",
          300: "rgba(168, 135, 205, 0.3)",
          400: "rgba(168, 135, 205, 0.4)",
          500: "rgba(168, 135, 205, 0.5)",
          600: "rgba(168, 135, 205, 0.6)",
          700: "rgba(168, 135, 205, 0.7)",
        },
      },
      fontFamily: {
        brush: ['"Ma Shan Zheng"', '"KaiTi"', 'serif'],
        kai: ['"KaiTi"', '"STKaiti"', '"Ma Shan Zheng"', 'serif'],
        serif: ['"Noto Serif SC"', '"STSong"', 'serif'],
        number: ['"ZCOOL XiaoWei"', '"Noto Serif SC"', 'serif'],
      },
      fontSize: {
        xs: ["0.9rem", { lineHeight: "1.4rem" }],
        sm: ["1.05rem", { lineHeight: "1.65rem" }],
        base: ["1.2rem", { lineHeight: "1.85rem" }],
        lg: ["1.35rem", { lineHeight: "1.95rem" }],
        xl: ["1.55rem", { lineHeight: "2.1rem" }],
        "2xl": ["1.8rem", { lineHeight: "2.3rem" }],
        "3xl": ["2.2rem", { lineHeight: "2.6rem" }],
        "4xl": ["2.8rem", { lineHeight: "3.1rem" }],
        "5xl": ["3.5rem", { lineHeight: "1.1" }],
        "6xl": ["4.25rem", { lineHeight: "1.1" }],
        "7xl": ["5.25rem", { lineHeight: "1.1" }],
        "8xl": ["6.5rem", { lineHeight: "1.1" }],
        "9xl": ["8rem", { lineHeight: "1.1" }],
      },
      boxShadow: {
        // 古籍阴影系统
        "book-lift": "0 2px 8px rgba(42, 31, 18, 0.08), 0 4px 16px rgba(42, 31, 18, 0.06)",
        "book-float": "0 4px 16px rgba(42, 31, 18, 0.12), 0 8px 32px rgba(42, 31, 18, 0.08)",
        "seal-press": "inset 0 2px 4px rgba(168, 38, 31, 0.6), 0 1px 2px rgba(0, 0, 0, 0.3)",
        "seal-lift": "0 2px 6px rgba(193, 67, 46, 0.4), 0 4px 12px rgba(193, 67, 46, 0.2)",
        "ink-soft": "0 1px 3px rgba(42, 31, 18, 0.12), 0 1px 2px rgba(42, 31, 18, 0.06)",
        "spine-depth": "inset -2px 0 8px rgba(26, 20, 16, 0.4), inset -4px 0 12px rgba(26, 20, 16, 0.2)",
        // 保留灵气系统
        glow: "0 0 24px rgba(201,169,97,0.4)",
        "spiritual-glow": "0 0 30px rgba(130,195,210,0.3), 0 0 50px rgba(130,195,210,0.15)",
        "formation-glow": "0 0 30px rgba(168,135,205,0.35), 0 0 50px rgba(168,135,205,0.2)",
        "inner-glow": "inset 0 0 30px rgba(130,195,210,0.1), inset 0 0 60px rgba(168,135,205,0.06)",
      },
      backgroundImage: {
        'paper-grain': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.55 0 0 0 0 0.45 0 0 0 0 0.3 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        // 古籍动画系统
        pageFlip: {
          "0%": { transform: "perspective(1200px) rotateY(0deg)", opacity: "1" },
          "50%": { transform: "perspective(1200px) rotateY(-90deg)", opacity: "0.3" },
          "100%": { transform: "perspective(1200px) rotateY(-180deg)", opacity: "1" },
        },
        sealStamp: {
          "0%": { transform: "scale(1.1) translateY(-4px)", opacity: "0.8" },
          "60%": { transform: "scale(0.95)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        inkDiffuse: {
          "0%": { opacity: "0", filter: "blur(4px)" },
          "100%": { opacity: "1", filter: "blur(0)" },
        },
        tabSlide: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        // 保留原有动画
        shimmer: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        inkSpread: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        sandFall: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        drawerIn: {
          "0%": { transform: "translateX(100%)", opacity: "0.3" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        windowIn: {
          "0%": { transform: "scale(0.94)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        mapPulse: {
          "0%": { transform: "scale(0.7)", opacity: "0.85" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        spiritualPulse: {
          "0%, 100%": { opacity: "0.6", boxShadow: "0 0 14px rgba(130,195,210,0.25)" },
          "50%": { opacity: "1", boxShadow: "0 0 26px rgba(130,195,210,0.5)" },
        },
        formationRotate: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        auraFlow: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        runeGlow: {
          "0%, 100%": { filter: "brightness(1) drop-shadow(0 0 6px rgba(230,185,115,0.35))" },
          "50%": { filter: "brightness(1.35) drop-shadow(0 0 14px rgba(230,185,115,0.7))" },
        },
      },
      animation: {
        // 古籍动画
        pageFlip: "pageFlip 0.8s cubic-bezier(0.45, 0.05, 0.55, 0.95)",
        sealStamp: "sealStamp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        inkDiffuse: "inkDiffuse 0.6s ease-out",
        tabSlide: "tabSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        // 保留原有动画
        shimmer: "shimmer 3s ease-in-out infinite",
        float: "float 5s ease-in-out infinite",
        inkSpread: "inkSpread 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        sandFall: "sandFall 3s linear infinite",
        drawerIn: "drawerIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        windowIn: "windowIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        fadeIn: "fadeIn 0.3s ease-out",
        mapPulse: "mapPulse 2.4s ease-out infinite",
        spiritualPulse: "spiritualPulse 3s ease-in-out infinite",
        formationRotate: "formationRotate 20s linear infinite",
        auraFlow: "auraFlow 8s ease-in-out infinite",
        runeGlow: "runeGlow 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
