# 线装古籍UI设计方案

## 一、设计背景与目标

### 1.1 现状分析

当前游戏UI存在以下问题：
- 视觉风格不够沉浸，仍保留 Tailwind 模板化特征
- 虽然使用了修真主题色彩（墨色、朱砂、灵气等），但组件设计缺乏独特性
- 卡片、按钮等基础元素过于标准化，未能充分体现修真与古籍的文化内涵

### 1.2 设计目标

- **核心隐喻**：将整个游戏界面重新构想为一部"线装古籍"
- **质感优先**：通过宣纸纹理、不规则边缘、墨色渐变营造真实的古书触感
- **克制的动效**：避免过度动画，模拟真实物理交互（纸张翻动、印章盖印）
- **保留布局**：不改变现有三栏结构（左侧导航、中央主区域、右侧抽屉），只替换视觉语言

### 1.3 设计原则

1. **一致性**：所有组件围绕"线装古籍"隐喻展开
2. **真实感**：每个视觉元素都有现实古籍的对应物（书页→卡片，印章→按钮，书签→导航）
3. **克制性**：去除所有游戏化、科技感的视觉元素，保持古朴雅致
4. **功能性**：视觉改造不影响现有交互逻辑和功能完整性

---

## 二、视觉系统基础

### 2.1 色彩系统

#### 古纸色（Paper Colors）
替代原有的 `paper-*` 色系，模拟不同年代的宣纸：

```javascript
// tailwind.config.js
colors: {
  paper: {
    fresh: '#FEFBF2',      // 新宣纸
    aged: '#F8F3E8',       // 陈年纸
    old: '#F0E5D1',        // 古旧纸
    dark: '#E8DCC0',       // 深古纸
    spine: '#2C2416',      // 书脊深色
  }
}
```

#### 墨色系（Ink Colors）
保留并细化原有墨色，增加浓淡层次：

```javascript
ink: {
  lightest: '#8B7355',   // 淡墨（辅助文字）
  light: '#6B5644',      // 浅墨
  medium: '#4A3C28',     // 中墨（主要文字）
  dark: '#2A1F12',       // 浓墨（标题）
  darkest: '#1A1410',    // 焦墨（强调）
}
```

#### 朱砂色（Cinnabar Colors）
保留原有 `cinnabar-*`，用于印章、强调：

```javascript
cinnabar: {
  light: '#D94F3D',
  DEFAULT: '#C1432E',
  dark: '#A8261F',
  darker: '#8F1810',
}
```

#### 金箔色（Gold Leaf）
用于书名、重要装饰：

```javascript
gold: {
  light: '#FFE4A0',
  DEFAULT: '#D4AF37',
  dark: '#B8941F',
}
```

#### 灵气色（克制使用）
仅在特殊状态（突破、顿悟）使用，透明度极低：

```javascript
aura: {
  cyan: 'rgba(96, 165, 250, 0.03)',
  purple: 'rgba(167, 139, 250, 0.03)',
  gold: 'rgba(212, 175, 55, 0.03)',
}
```

### 2.2 纸张纹理系统

#### 基础纹理（SVG）

在 `src/index.css` 中定义 SVG 纹理，通过 `background-image` 叠加：

```css
/* 宣纸纤维纹理 */
.paper-texture {
  background-image: 
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}

/* 细密麻布纹理（用于书脊） */
.cloth-texture {
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cdefs%3E%3Cpattern id='weave' width='8' height='8' patternUnits='userSpaceOnUse'%3E%3Cpath d='M0 0h4v4H0z' fill='%23000' opacity='0.05'/%3E%3Cpath d='M4 4h4v4H4z' fill='%23000' opacity='0.05'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23weave)'/%3E%3C/svg%3E");
}
```

#### 不规则边缘（SVG Path）

使用 CSS `clip-path` 或 SVG mask 创建手工裁切的纸张边缘：

```css
.paper-edge {
  clip-path: polygon(
    0% 0.5%,
    2% 0%,
    5% 0.8%,
    10% 0.2%,
    /* ... 更多控制点模拟不规则边缘 ... */
    98% 0.5%,
    100% 1%,
    100% 99%,
    98% 100%,
    95% 99.5%,
    /* ... */
    2% 99.8%,
    0% 99.2%
  );
}
```

实际使用时，可为不同卡片生成 3-5 种预设边缘变体，通过类名切换。

#### 陈旧效果（CSS Filter + Pseudo-elements）

```css
/* 泛黄渐变 */
.aged-paper::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 30% 40%,
    rgba(139, 115, 85, 0.08) 0%,
    transparent 60%
  ),
  radial-gradient(
    ellipse at 70% 60%,
    rgba(139, 115, 85, 0.05) 0%,
    transparent 50%
  );
  pointer-events: none;
}

/* 雀斑（foxing spots） */
.foxing-spots::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: 
    radial-gradient(circle at 20% 30%, rgba(107, 86, 68, 0.15) 2px, transparent 3px),
    radial-gradient(circle at 65% 15%, rgba(107, 86, 68, 0.12) 3px, transparent 4px),
    radial-gradient(circle at 85% 70%, rgba(107, 86, 68, 0.1) 2px, transparent 3px);
  pointer-events: none;
}

/* 边缘磨损 */
.edge-wear {
  box-shadow: 
    inset 2px 2px 8px rgba(139, 115, 85, 0.1),
    inset -2px -2px 8px rgba(139, 115, 85, 0.1);
}
```

### 2.3 装帧元素

#### 书脊侧签（Side Tabs）

用于左侧导航项，设计为凸出的书签：

```css
.side-tab {
  /* 基础形状 */
  position: relative;
  width: 24px;
  padding: 12px 6px;
  background: linear-gradient(to right, #F5E6C8, #F0E5D1);
  
  /* 不规则梯形 */
  clip-path: polygon(
    0% 0%,
    100% 2%,
    100% 98%,
    0% 100%
  );
  
  /* 纸张质感 */
  box-shadow: 
    -2px 0 4px rgba(0, 0, 0, 0.1),
    inset 1px 0 0 rgba(255, 255, 255, 0.3);
  
  /* 竖排文字 */
  writing-mode: vertical-rl;
  font-family: var(--font-kai);
  color: var(--ink-dark);
  letter-spacing: 2px;
  
  transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.side-tab:hover {
  transform: translateX(6px) rotateY(-5deg) rotateZ(1deg);
  box-shadow: 
    -4px 0 8px rgba(0, 0, 0, 0.15),
    inset 1px 0 0 rgba(255, 255, 255, 0.4);
}

.side-tab.active {
  transform: translateX(12px);
  background: linear-gradient(to right, #F5E8E0, #F0E5D1);
  border-left: 2px solid var(--cinnabar);
}
```

#### 印章系统（Seal Stamps）

三种印章类型，用于不同场景：

```css
/* 朱文印（主要按钮） */
.seal-primary {
  background: linear-gradient(135deg, #C1432E 0%, #A8261F 100%);
  border: 1px solid #8F1810;
  border-radius: 2px;
  color: #FFFEF7;
  font-family: var(--font-kai);
  font-weight: 500;
  letter-spacing: 2px;
  padding: 8px 20px;
  
  /* 印泥质感 */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    inset 0 -1px 2px rgba(0, 0, 0, 0.3),
    0 2px 4px rgba(193, 67, 46, 0.3);
  
  /* 细微颗粒噪点 */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='noise'%3E%3CfeTurbulence baseFrequency='0.8' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E");
  background-blend-mode: overlay;
}

/* 白文印（次要按钮） */
.seal-secondary {
  background: #FFFEF7;
  border: 2px solid #C1432E;
  border-radius: 2px;
  color: #C1432E;
  font-family: var(--font-kai);
  letter-spacing: 2px;
  padding: 6px 18px;
}

/* 闲章（装饰性标签） */
.seal-decorative {
  display: inline-block;
  background: rgba(193, 67, 46, 0.9);
  border-radius: 50%;
  width: 48px;
  height: 48px;
  color: white;
  font-size: 14px;
  font-family: var(--font-kai);
  text-align: center;
  line-height: 48px;
  box-shadow: 
    0 2px 8px rgba(193, 67, 46, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
```

#### 书眉装饰（Header Ornaments）

页面顶部或卡片顶部的装饰性元素：

```css
.book-header-ornament {
  position: relative;
  text-align: center;
  padding: 12px 0;
  
  /* 主文字 */
  font-family: var(--font-kai);
  color: var(--ink-medium);
  font-size: 14px;
}

.book-header-ornament::before,
.book-header-ornament::after {
  content: '◈';
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  color: var(--gold);
  font-size: 12px;
  opacity: 0.6;
}

.book-header-ornament::before {
  left: 20px;
}

.book-header-ornament::after {
  right: 20px;
}
```

#### 鱼尾符（Page Marker）

用于标记页面分隔或章节：

```css
.fish-tail {
  display: inline-block;
  width: 16px;
  height: 20px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 20'%3E%3Cpath d='M8 0 L14 10 L8 20 L2 10 Z' fill='%234A3C28' opacity='0.4'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
  vertical-align: middle;
}
```

#### 栏线（Column Lines）

卡片内容区域的垂直分栏线：

```css
.column-lines {
  position: relative;
  padding: 24px 40px;
}

.column-lines::before,
.column-lines::after {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  width: 1px;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(74, 60, 40, 0.3) 5%,
    rgba(74, 60, 40, 0.3) 95%,
    transparent 100%
  );
}

.column-lines::before {
  left: 16px;
}

.column-lines::after {
  right: 16px;
}
```

### 2.4 字体系统

保留现有字体配置，强化使用规范：

```javascript
// tailwind.config.js
fontFamily: {
  brush: ['Ma Shan Zheng', 'cursive'],        // 毛笔字：游戏标题、重要标题
  kai: ['KaiTi', 'STKaiti', 'serif'],         // 楷体：正文、导航
  song: ['Noto Serif SC', 'SimSun', 'serif'], // 宋体：长文本阅读
  number: ['Georgia', 'Times', 'serif'],      // 数字：避免等宽字体
}
```

**使用规范**：
- **标题层级**：
  - H1（游戏名）：brush，32-48px，金色
  - H2（章节标题）：kai，24-28px，浓墨
  - H3（小节标题）：kai，18-20px，中墨
- **正文**：kai 或 song，16px，中墨，line-height 1.8
- **辅助信息**：kai，14px，淡墨
- **数值显示**：number，14-16px，浓墨

---

## 三、组件设计

### 3.1 侧边导航（SideNav）

**文件**：`src/components/layout/SideNav.tsx`

**设计方案**：将整个左侧导航重新构想为"书脊与侧签系统"

#### 整体结构

```
┌─────────┐
│  云  ┐  │  ← 书名竖排（顶部）
│  栖  │  │
│  修  │  │
│  真  │  │
│  录  ┘  │
├─────────┤
│  〔角色〕 │  ← 侧签导航项
│  〔功法〕 │
│  〔法宝〕 │
│  〔宗门〕 │
│  〔社交〕 │
│  〔技艺〕 │
│  〔机缘〕 │
│  〔状态〕 │
│  〔令牌〕 │
├─────────┤
│    ◉    │  ← 问道按钮（圆形印章）
└─────────┘
```

#### 视觉规格

- **整体背景**：
  - 深古纸色（`#2C2416`）
  - 叠加布纹纹理（`.cloth-texture`）
  - 宽度：`80px`

- **书名区域**：
  - 文字：「天机衍世」，竖排
  - 字体：brush，18px
  - 颜色：金色渐变（`linear-gradient(to bottom, #FFE4A0, #D4AF37)`）
  - 位置：顶部 padding 20px
  - 效果：`text-shadow: 0 1px 2px rgba(0,0,0,0.3)`

- **导航侧签**：
  - 每个侧签使用 `.side-tab` 样式
  - 竖排文字，楷体，14px
  - 间距：上下 margin 4px
  - 状态提示点：右上角小圆点（朱砂色，直径 6px）

- **问道按钮**：
  - 圆形，直径 48px
  - 朱砂底色（`#C1432E`，opacity 0.9）
  - 白色篆文「问道」
  - 金色细框（1px，`#D4AF37`）
  - 位置：底部 margin 20px

#### 交互动效

```css
/* 侧签悬停 */
.side-tab:hover {
  transform: translateX(6px) rotateY(-5deg) rotateZ(1deg);
  transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 侧签激活 */
.side-tab.active {
  transform: translateX(12px);
  background: linear-gradient(to right, #F5E8E0, #F0E5D1);
  border-left: 2px solid #C1432E;
}

/* 问道按钮悬停 */
.ask-dao-button:hover {
  box-shadow: 0 0 16px rgba(212, 175, 55, 0.6);
  transform: scale(1.05);
}
```

### 3.2 主面板卡片（ScrollCard / 书页卡片）

**文件**：`src/components/ui/ScrollCard.tsx`

**设计方案**：将卡片重新设计为"书页"样式

#### 基础书页卡片

```tsx
interface BookPageCardProps {
  children: React.ReactNode;
  variant?: 'single' | 'stacked'; // 单页或叠页
  aged?: boolean; // 是否显示陈旧效果
  className?: string;
}
```

#### 视觉规格

**单页样式**：
```css
.book-page-card {
  /* 形状与背景 */
  background: radial-gradient(
    ellipse at 40% 30%,
    #F8F3E8 0%,
    #F0E5D1 100%
  );
  border-radius: 4px;
  
  /* 不规则边缘 */
  clip-path: var(--paper-edge-variant-1);
  
  /* 纸张纹理 */
  position: relative;
}

.book-page-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url(...); /* SVG 宣纸纹理 */
  opacity: 0.15;
  mix-blend-mode: multiply;
  pointer-events: none;
}

/* 栏线 */
.book-page-card::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  top: 12px;
  bottom: 12px;
  border-left: 1px solid rgba(74, 60, 40, 0.3);
  border-right: 1px solid rgba(74, 60, 40, 0.3);
  pointer-events: none;
}

/* 内容区域 */
.book-page-card > .content {
  position: relative;
  z-index: 1;
  padding: 24px 40px;
}

/* 阴影 */
.book-page-card {
  box-shadow: 
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
```

**叠页样式**（多层书页）：
```css
.book-page-card.stacked {
  position: relative;
}

/* 背后的书页层 */
.book-page-card.stacked::before {
  content: '';
  position: absolute;
  inset: -4px 0 4px 4px;
  background: linear-gradient(to right, #E8DCC0, #DED2B4);
  border-radius: 4px;
  z-index: -1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.book-page-card.stacked::after {
  content: '';
  position: absolute;
  inset: -8px 0 8px 8px;
  background: linear-gradient(to right, #DED2B4, #D4C8A8);
  border-radius: 4px;
  z-index: -2;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
```

**陈旧效果**：
```css
.book-page-card.aged {
  /* 泛黄渐变 */
  background: radial-gradient(
    ellipse at 30% 40%,
    #F0E5D1 0%,
    #E8DCC0 100%
  );
}

.book-page-card.aged .foxing-layer {
  position: absolute;
  inset: 0;
  background-image: 
    radial-gradient(circle at 20% 30%, rgba(107, 86, 68, 0.15) 2px, transparent 3px),
    radial-gradient(circle at 65% 15%, rgba(107, 86, 68, 0.12) 3px, transparent 4px),
    radial-gradient(circle at 85% 70%, rgba(107, 86, 68, 0.1) 2px, transparent 3px),
    radial-gradient(circle at 45% 80%, rgba(107, 86, 68, 0.08) 2px, transparent 3px);
  pointer-events: none;
}
```

#### 交互动效

```css
.book-page-card {
  transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 悬停：纸张微扬 */
.book-page-card:hover {
  transform: translateY(-4px) rotateX(2deg);
  box-shadow: 
    0 8px 16px rgba(0, 0, 0, 0.12),
    0 16px 48px rgba(0, 0, 0, 0.08);
}

/* 点击：印章盖印效果 */
.book-page-card:active {
  animation: stamp-press 150ms ease-out;
}

@keyframes stamp-press {
  0% { transform: scale(1); }
  50% { transform: scale(0.98); }
  100% { transform: scale(1); }
}
```

### 3.3 按钮系统（SealButton）

**文件**：`src/components/ui/SealButton.tsx`

**设计方案**：三种按钮样式对应不同印章类型

#### 按钮变体

```tsx
interface SealButtonProps {
  variant: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}
```

#### 主要按钮（朱文印）

```css
.seal-button-primary {
  /* 基础样式 */
  background: linear-gradient(135deg, #C1432E 0%, #A8261F 100%);
  border: 1px solid #8F1810;
  border-radius: 2px;
  color: #FFFEF7;
  font-family: var(--font-kai);
  font-weight: 500;
  letter-spacing: 2px;
  padding: 8px 20px;
  
  /* 印泥质感 */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    inset 0 -1px 2px rgba(0, 0, 0, 0.3),
    0 2px 4px rgba(193, 67, 46, 0.3);
  
  /* 印章纹理 */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='noise'%3E%3CfeTurbulence baseFrequency='0.8' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E");
  background-blend-mode: overlay;
  
  transition: all 200ms ease;
}

.seal-button-primary:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    inset 0 -1px 2px rgba(0, 0, 0, 0.3),
    0 4px 8px rgba(193, 67, 46, 0.4);
}

.seal-button-primary:active {
  animation: seal-stamp 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes seal-stamp {
  0% {
    transform: translateY(-8px) scale(1.1);
    box-shadow: 0 8px 16px rgba(193, 67, 46, 0.4);
  }
  50% {
    transform: translateY(2px) scale(0.95);
    box-shadow: 0 2px 4px rgba(193, 67, 46, 0.6);
  }
  100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 4px 8px rgba(193, 67, 46, 0.3);
  }
}

.seal-button-primary:disabled {
  background: linear-gradient(135deg, #8B7355 0%, #6B5644 100%);
  border-color: #4A3C28;
  cursor: not-allowed;
  opacity: 0.6;
}
```

#### 次要按钮（白文印）

```css
.seal-button-secondary {
  background: #FFFEF7;
  border: 2px solid #C1432E;
  border-radius: 2px;
  color: #C1432E;
  font-family: var(--font-kai);
  font-weight: 500;
  letter-spacing: 2px;
  padding: 6px 18px;
  
  box-shadow: 
    0 1px 3px rgba(193, 67, 46, 0.2),
    inset 0 0 0 1px rgba(193, 67, 46, 0.1);
  
  transition: all 200ms ease;
}

.seal-button-secondary:hover {
  background: rgba(193, 67, 46, 0.05);
  border-color: #A8261F;
  transform: translateY(-1px);
  box-shadow: 
    0 2px 6px rgba(193, 67, 46, 0.3),
    inset 0 0 0 1px rgba(193, 67, 46, 0.15);
}

.seal-button-secondary:active {
  transform: translateY(0);
  background: rgba(193, 67, 46, 0.1);
}
```

#### 轻量按钮（墨线描边）

```css
.seal-button-ghost {
  background: transparent;
  border: 2px solid #4A3C28;
  border-radius: 2px;
  color: #2A1F12;
  font-family: var(--font-kai);
  letter-spacing: 1.5px;
  padding: 6px 18px;
  
  transition: all 200ms ease;
}

.seal-button-ghost:hover {
  background: rgba(74, 60, 40, 0.08);
  border-color: #2A1F12;
}

.seal-button-ghost:active {
  background: rgba(74, 60, 40, 0.15);
}
```

#### 尺寸变体

```css
.seal-button-sm {
  padding: 4px 12px;
  font-size: 12px;
  letter-spacing: 1px;
}

.seal-button-md {
  padding: 8px 20px;
  font-size: 14px;
  letter-spacing: 2px;
}

.seal-button-lg {
  padding: 12px 32px;
  font-size: 16px;
  letter-spacing: 3px;
}
```

### 3.4 输入框系统

**设计方案**：题签样式输入框

#### 文本输入框

```css
.book-input {
  /* 基础样式 */
  background: #FEFBF2;
  border: none;
  border-bottom: 2px solid #4A3C28;
  padding: 12px 8px 8px;
  font-family: var(--font-kai);
  font-size: 14px;
  color: #1A1410;
  
  /* 墨线渐隐效果 */
  border-image: linear-gradient(
    90deg,
    transparent 0%,
    #4A3C28 5%,
    #4A3C28 95%,
    transparent 100%
  ) 1;
  
  transition: all 250ms ease;
}

.book-input::placeholder {
  color: #8B7355;
  opacity: 0.6;
}

.book-input:focus {
  outline: none;
  border-bottom-color: #2A1F12;
  background: rgba(193, 67, 46, 0.02); /* 微红晕染 */
  
  /* 墨线加深 */
  border-image: linear-gradient(
    90deg,
    transparent 0%,
    #2A1F12 3%,
    #2A1F12 97%,
    transparent 100%
  ) 1;
}

/* 标签（label） */
.book-input-label {
  display: block;
  font-family: var(--font-kai);
  font-size: 12px;
  color: #4A3C28;
  margin-bottom: 4px;
  position: relative;
  padding-right: 20px;
}

.book-input-label::after {
  content: '⌇';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%) rotate(90deg);
  color: #8B7355;
  opacity: 0.4;
  font-size: 10px;
}
```

#### 文本域（多行输入）

```css
.book-textarea {
  background: #FEFBF2;
  border: 1px solid rgba(74, 60, 40, 0.3);
  border-radius: 4px;
  padding: 16px;
  font-family: var(--font-kai);
  font-size: 14px;
  color: #1A1410;
  line-height: 1.8;
  resize: vertical;
  min-height: 120px;
  
  /* 稿纸格子效果 */
  background-image: 
    repeating-linear-gradient(
      transparent 0,
      transparent 27px,
      rgba(74, 60, 40, 0.1) 27px,
      rgba(74, 60, 40, 0.1) 28px
    );
  background-size: 100% 28px;
  
  transition: all 250ms ease;
}

.book-textarea:focus {
  outline: none;
  border-color: #4A3C28;
  background-color: rgba(248, 243, 232, 1);
  box-shadow: 0 0 0 3px rgba(74, 60, 40, 0.05);
}
```

### 3.5 顶部横幅（TopBanner）

**文件**：`src/components/layout/TopBanner.tsx`

**设计方案**：书名页样式

#### 整体结构

```
┌────────────────────────────────────────┐
│ [天机衍世]                 [⚙] [↻] [✕] │  ← 60px 高度
└────────────────────────────────────────┘
```

#### 视觉规格

```css
.top-banner {
  height: 60px;
  background: #2C2416;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  /* 暗纹背景 */
  background-image: url(...); /* 深色布纹 */
  
  /* 底部边缘不规则 */
  position: relative;
}

.top-banner::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    to right,
    transparent 0%,
    rgba(139, 115, 85, 0.3) 50%,
    transparent 100%
  );
}

/* 游戏标题 */
.game-title {
  font-family: var(--font-brush);
  font-size: 28px;
  background: linear-gradient(to bottom, #FFE4A0, #D4AF37, #B8941F);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  letter-spacing: 4px;
}

/* 工具栏按钮 */
.toolbar-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 254, 247, 0.1);
  border: 1px solid rgba(139, 115, 85, 0.3);
  color: #8B7355;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms ease;
}

.toolbar-button:hover {
  background: rgba(193, 67, 46, 0.15);
  border-color: #C1432E;
  color: #C1432E;
  transform: scale(1.05);
}

/* 图标改为线稿风格 */
.toolbar-icon {
  width: 20px;
  height: 20px;
  stroke-width: 1.5px;
}
```

### 3.6 底部状态栏（BottomStatus）

**文件**：`src/components/layout/BottomStatus.tsx`

**设计方案**：书尾牌记样式

#### 整体结构

```
┌────────────────────────────────────────┐
│ [印] 修为  [印] 寿元  │  系统信息...    │  ← 80px 高度
└────────────────────────────────────────┘
```

#### 视觉规格

```css
.bottom-status {
  height: 80px;
  background: #2C2416;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  
  /* 顶部不规则边缘 */
  position: relative;
  clip-path: polygon(
    0% 2%,
    5% 0%,
    10% 1.5%,
    /* ... */
    100% 1%,
    100% 100%,
    0% 100%
  );
}

/* 状态标签（印章样式） */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(193, 67, 46, 0.9);
  border-radius: 4px;
  padding: 8px 16px;
  color: #FFFEF7;
  font-family: var(--font-kai);
  font-size: 13px;
  box-shadow: 
    0 2px 4px rgba(193, 67, 46, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.status-badge-icon {
  width: 16px;
  height: 16px;
  opacity: 0.9;
}

/* 分隔符 */
.divider {
  width: 1px;
  height: 32px;
  background: rgba(212, 175, 55, 0.4);
}

/* 系统信息文字 */
.system-info {
  font-family: var(--font-kai);
  font-size: 12px;
  color: #8B7355;
  margin-left: auto;
}
```

### 3.7 抽屉面板（PanelDrawer）

**文件**：`src/components/layout/PanelDrawer.tsx`

**设计方案**：展开的书册样式

#### 整体结构

抽屉从右侧滑入，宽度约 `480px`，设计为打开的书册。

#### 视觉规格

```css
.panel-drawer {
  position: fixed;
  right: 0;
  top: 60px; /* TopBanner 高度 */
  bottom: 80px; /* BottomStatus 高度 */
  width: 480px;
  background: #F0E5D1;
  
  /* 书页叠加效果 */
  box-shadow: 
    -4px 0 16px rgba(0, 0, 0, 0.15),
    inset 4px 0 0 rgba(139, 115, 85, 0.2);
  
  /* 左侧装订侧 */
  border-left: 1px solid rgba(74, 60, 40, 0.3);
  
  transform-origin: left center;
  transform-style: preserve-3d;
}

/* 装订孔装饰 */
.panel-drawer::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 60px;
  bottom: 60px;
  width: 2px;
  background-image: 
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 60px,
      #D4AF37 60px,
      #D4AF37 62px,
      transparent 62px,
      transparent 80px
    );
}

/* 装订珠装饰 */
.binding-bead {
  position: absolute;
  left: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, #FFE4A0, #D4AF37);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* 标题栏（书签样式） */
.panel-drawer-header {
  height: 56px;
  background: linear-gradient(to bottom, #2C2416, #3A2F1E);
  padding: 0 20px 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  /* 金箔文字 */
  color: #D4AF37;
  font-family: var(--font-kai);
  font-size: 18px;
  letter-spacing: 3px;
}

/* 关闭按钮（圆形印章） */
.panel-drawer-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(193, 67, 46, 0.9);
  color: white;
  font-family: var(--font-kai);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #8F1810;
  cursor: pointer;
  transition: all 200ms ease;
}

.panel-drawer-close:hover {
  background: rgba(168, 38, 31, 1);
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(193, 67, 46, 0.5);
}

/* 内容区域 */
.panel-drawer-content {
  padding: 24px 32px 24px 40px; /* 左侧留出装订区域 */
  height: calc(100% - 56px);
  overflow-y: auto;
  
  /* 宣纸纹理 */
  background-image: url(...);
  background-size: 200px 200px;
}

/* 滚动条样式 */
.panel-drawer-content::-webkit-scrollbar {
  width: 8px;
}

.panel-drawer-content::-webkit-scrollbar-track {
  background: rgba(139, 115, 85, 0.1);
  border-radius: 4px;
}

.panel-drawer-content::-webkit-scrollbar-thumb {
  background: rgba(74, 60, 40, 0.4);
  border-radius: 4px;
}

.panel-drawer-content::-webkit-scrollbar-thumb:hover {
  background: rgba(74, 60, 40, 0.6);
}
```

#### 打开动画（书页翻开效果）

```css
/* 进入动画 */
.panel-drawer-enter {
  animation: book-open 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes book-open {
  0% {
    transform: rotateY(-90deg) translateX(50%);
    opacity: 0;
    filter: brightness(0.7);
  }
  50% {
    filter: brightness(1.1);
  }
  100% {
    transform: rotateY(0deg) translateX(0);
    opacity: 1;
    filter: brightness(1);
  }
}

/* 退出动画 */
.panel-drawer-exit {
  animation: book-close 400ms cubic-bezier(0.6, 0, 0.8, 0.2) forwards;
}

@keyframes book-close {
  0% {
    transform: rotateY(0deg) translateX(0);
    opacity: 1;
  }
  100% {
    transform: rotateY(-90deg) translateX(50%);
    opacity: 0;
  }
}
```

---

## 四、交互动效

### 4.1 页面切换动画

#### 面板切换（书页翻动）

当用户在不同面板间切换时，使用书页翻动效果：

```css
/* 面板进入 */
.panel-enter {
  animation: page-flip-in 800ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes page-flip-in {
  0% {
    transform: rotateY(-90deg) translateX(50%);
    opacity: 0;
    filter: brightness(0.7);
  }
  50% {
    filter: brightness(1.1); /* 模拟纸张反光 */
  }
  100% {
    transform: rotateY(0deg) translateX(0);
    opacity: 1;
    filter: brightness(1);
  }
}

/* 面板退出 */
.panel-exit {
  animation: page-flip-out 600ms cubic-bezier(0.6, 0, 0.8, 0.2);
}

@keyframes page-flip-out {
  0% {
    transform: rotateY(0deg) translateX(0);
    opacity: 1;
  }
  100% {
    transform: rotateY(90deg) translateX(-50%);
    opacity: 0;
    filter: brightness(0.7);
  }
}
```

### 4.2 卡片交互

#### 卡片悬停（纸张微扬）

```css
.book-page-card {
  transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.book-page-card:hover {
  transform: translateY(-4px) rotateX(2deg);
  box-shadow: 
    0 8px 16px rgba(0, 0, 0, 0.12),
    0 16px 48px rgba(0, 0, 0, 0.08);
}
```

#### 卡片点击（印章盖印反馈）

```css
.book-page-card:active {
  animation: stamp-press 150ms ease-out;
}

@keyframes stamp-press {
  0% { transform: scale(1); }
  50% { transform: scale(0.98); }
  100% { transform: scale(1); }
}
```

### 4.3 按钮反馈

#### 印章按钮点击（盖印效果）

```css
.seal-button:active {
  animation: seal-stamp 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes seal-stamp {
  0% {
    transform: translateY(-8px) scale(1.1);
    box-shadow: 0 8px 16px rgba(193, 67, 46, 0.4);
  }
  50% {
    transform: translateY(2px) scale(0.95);
    box-shadow: 0 2px 4px rgba(193, 67, 46, 0.6);
  }
  100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 4px 8px rgba(193, 67, 46, 0.3);
  }
}
```

#### 按钮禁用状态渐变

```css
.seal-button:disabled {
  transition: all 300ms ease;
  opacity: 0.6;
  filter: grayscale(0.3);
  cursor: not-allowed;
}
```

### 4.4 加载动画

#### 墨滴晕染效果（替换 spiritual-particles）

```css
.ink-ripple {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.ink-ripple::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(26, 20, 16, 0.3) 0%,
    rgba(26, 20, 16, 0.15) 30%,
    transparent 60%
  );
  animation: ink-spread 2s ease-out infinite;
}

@keyframes ink-spread {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(3);
    opacity: 0;
  }
}

/* 多墨滴效果 */
.ink-ripple::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(26, 20, 16, 0.2) 0%,
    rgba(26, 20, 16, 0.1) 30%,
    transparent 60%
  );
  animation: ink-spread 2s ease-out 1s infinite;
}
```

#### 页面加载骨架屏

```css
.skeleton-card {
  background: linear-gradient(
    90deg,
    #F0E5D1 0%,
    #F8F3E8 50%,
    #F0E5D1 100%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

### 4.5 文本输入微交互

#### 输入时墨迹扩散（可选装饰效果）

```css
.book-input:focus::before {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 2px;
  background: radial-gradient(
    ellipse,
    rgba(42, 31, 18, 0.6) 0%,
    transparent 70%
  );
  animation: ink-blot 400ms ease-out forwards;
}

@keyframes ink-blot {
  0% {
    width: 0;
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    width: 100%;
    opacity: 0.3;
  }
}
```

### 4.6 侧边导航书签翻动

```css
.side-tab {
  transition: 
    transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 300ms ease;
}

.side-tab:hover {
  transform: 
    translateX(6px) 
    rotateY(-5deg)
    rotateZ(1deg);
  box-shadow: 
    -2px 0 8px rgba(0, 0, 0, 0.15),
    inset 1px 0 0 rgba(255, 255, 255, 0.3);
}

/* 点击时短暂回弹 */
.side-tab:active {
  transform: translateX(4px);
  transition-duration: 100ms;
}
```

### 4.7 弹窗/模态框动画

#### 模态框打开（书页展开）

```css
.modal-overlay {
  backdrop-filter: blur(8px) brightness(0.7);
  animation: fade-in 300ms ease;
}

@keyframes fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.modal-content {
  animation: book-open 600ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-style: preserve-3d;
}

@keyframes book-open {
  0% {
    transform: 
      perspective(1200px)
      rotateX(-15deg)
      scaleY(0.8);
    opacity: 0;
  }
  100% {
    transform: 
      perspective(1200px)
      rotateX(0deg)
      scaleY(1);
    opacity: 1;
  }
}
```

#### 模态框关闭

```css
.modal-overlay.closing {
  animation: fade-out 200ms ease forwards;
}

@keyframes fade-out {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

.modal-content.closing {
  animation: book-close 400ms cubic-bezier(0.6, 0, 0.8, 0.2) forwards;
}

@keyframes book-close {
  0% {
    transform: 
      perspective(1200px)
      rotateX(0deg)
      scaleY(1);
    opacity: 1;
  }
  100% {
    transform: 
      perspective(1200px)
      rotateX(-15deg)
      scaleY(0.8);
    opacity: 0;
  }
}
```

### 4.8 灵气效果（极度克制使用）

仅在特殊状态（突破、顿悟、获得稀有物品）时使用：

```css
.spiritual-moment {
  position: relative;
}

.spiritual-moment::after {
  content: '';
  position: absolute;
  inset: -20px;
  background: radial-gradient(
    circle,
    rgba(212, 175, 55, 0.03) 0%,  /* 极淡金色 */
    transparent 60%
  );
  animation: gentle-pulse 4s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes gentle-pulse {
  0%, 100% { 
    opacity: 0.3; 
    transform: scale(1); 
  }
  50% { 
    opacity: 0.5; 
    transform: scale(1.05); 
  }
}
```

### 4.9 滚动行为

#### 平滑滚动

```css
* {
  scroll-behavior: smooth;
}

/* 内容区域滚动时的视差效果（可选） */
.scroll-parallax {
  transform: translateY(calc(var(--scroll) * -0.3px));
}
```

### 4.10 微交互细节

#### 工具提示（Tooltip）出现动画

```css
.tooltip {
  opacity: 0;
  transform: translateY(-4px);
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.tooltip.show {
  opacity: 1;
  transform: translateY(0);
}
```

#### 列表项依次出现（Stagger Animation）

```css
.list-item {
  opacity: 0;
  transform: translateX(-20px);
  animation: slide-in 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 50ms; }
.list-item:nth-child(3) { animation-delay: 100ms; }
.list-item:nth-child(4) { animation-delay: 150ms; }
.list-item:nth-child(5) { animation-delay: 200ms; }
/* ... */

@keyframes slide-in {
  0% {
    opacity: 0;
    transform: translateX(-20px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}
```

---

## 五、实施策略

### 5.1 分阶段实施

#### 第一阶段：基础系统（1-2天）
**目标**：建立核心视觉语言

1. **更新 `tailwind.config.js`**：
   - 更新色彩系统（paper/ink/cinnabar/gold）
   - 保留字体配置
   - 添加自定义阴影和动画

2. **重写 `src/index.css`**：
   - 定义纸张纹理 SVG
   - 定义边缘 clip-path 变体（3-5种）
   - 定义装帧元素基础类（.side-tab, .seal-primary, 等）
   - 定义核心动画 keyframes

3. **创建工具类文件 `src/styles/ancient-book.css`**：
   - 集中管理所有古籍相关样式
   - 便于维护和复用

#### 第二阶段：核心组件改造（2-3天）
**目标**：改造最关键的 UI 组件

1. **改造 `ScrollCard.tsx`** → `BookPageCard.tsx`：
   - 实现单页/叠页变体
   - 添加陈旧效果选项
   - 实现悬停/点击动效

2. **改造 `SealButton.tsx`**：
   - 实现三种按钮变体（primary/secondary/ghost）
   - 实现印章盖印动效
   - 添加尺寸变体

3. **改造 `SideNav.tsx`**：
   - 实现书脊背景
   - 实现侧签导航项
   - 添加书名竖排
   - 改造问道按钮为圆形印章

4. **改造输入框组件**：
   - 创建 `BookInput.tsx`
   - 创建 `BookTextarea.tsx`
   - 实现题签样式和墨线效果

#### 第三阶段：布局组件改造（2天）
**目标**：改造布局框架

1. **改造 `TopBanner.tsx`**：
   - 实现书名页样式
   - 改造工具栏图标为线稿风格

2. **改造 `BottomStatus.tsx`**：
   - 实现书尾牌记样式
   - 改造状态标签为印章样式

3. **改造 `PanelDrawer.tsx`**：
   - 实现书册展开样式
   - 添加装订孔装饰
   - 实现书页翻开动画

#### 第四阶段：细节优化（1-2天）
**目标**：打磨细节和一致性

1. **优化所有面板组件**（ProfilePanel, TechniquePanel 等）：
   - 统一使用 BookPageCard
   - 统一使用 SealButton
   - 添加书眉装饰

2. **优化模态框组件**：
   - 统一使用书页展开动画
   - 添加背景虚化效果

3. **优化加载状态**：
   - 替换 spiritual-particles 为 ink-ripple
   - 实现骨架屏加载

4. **响应式适配**（如需要）：
   - 确保小屏幕下的可用性
   - 调整纹理和装饰元素密度

#### 第五阶段：测试与调优（1天）
**目标**：确保质量和性能

1. **视觉一致性检查**：
   - 检查所有页面的视觉统一性
   - 确保装饰元素不过度

2. **性能优化**：
   - 优化 SVG 纹理大小
   - 减少不必要的动画
   - 优化 box-shadow 层级

3. **交互测试**：
   - 测试所有悬停/点击状态
   - 确保动画流畅度

### 5.2 技术实施要点

#### CSS 架构

```
src/
├── styles/
│   ├── ancient-book.css       # 古籍样式系统
│   ├── textures.css           # 纹理定义
│   ├── ornaments.css          # 装饰元素
│   └── animations.css         # 动画定义
├── index.css                  # 全局样式（整合以上文件）
└── ...
```

#### 组件命名规范

- 所有新组件添加 `Book` 前缀：`BookPageCard`, `BookInput`, 等
- 保留原组件作为别名，便于渐进式迁移：
  ```tsx
  export { BookPageCard as ScrollCard };
  ```

#### CSS 变量使用

在 `:root` 定义所有颜色和间距：

```css
:root {
  /* 纸张色 */
  --paper-fresh: #FEFBF2;
  --paper-aged: #F8F3E8;
  --paper-old: #F0E5D1;
  --paper-dark: #E8DCC0;
  --paper-spine: #2C2416;
  
  /* 墨色 */
  --ink-lightest: #8B7355;
  --ink-light: #6B5644;
  --ink-medium: #4A3C28;
  --ink-dark: #2A1F12;
  --ink-darkest: #1A1410;
  
  /* 朱砂 */
  --cinnabar: #C1432E;
  --cinnabar-dark: #A8261F;
  --cinnabar-darker: #8F1810;
  
  /* 金箔 */
  --gold-light: #FFE4A0;
  --gold: #D4AF37;
  --gold-dark: #B8941F;
  
  /* 间距 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* 圆角 */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 8px;
  --radius-full: 999px;
}
```

### 5.3 兼容性考虑

#### 浏览器支持

- **clip-path**：现代浏览器支持良好，IE 不支持（可接受）
- **backdrop-filter**：Safari 需要 `-webkit-` 前缀
- **CSS 变量**：现代浏览器支持，IE 不支持（可用 PostCSS 回退）

#### 降级方案

对于不支持的特性，提供优雅降级：

```css
/* 不支持 backdrop-filter 的浏览器使用纯色背景 */
.modal-overlay {
  background: rgba(44, 36, 22, 0.8);
  backdrop-filter: blur(8px);
}

@supports not (backdrop-filter: blur(8px)) {
  .modal-overlay {
    background: rgba(44, 36, 22, 0.95);
  }
}
```

### 5.4 性能优化

#### 纹理优化

- SVG 纹理使用 data URI 内联，避免额外请求
- 控制纹理尺寸不超过 400x400px
- 使用 `background-size` 控制重复密度

#### 动画优化

- 优先使用 `transform` 和 `opacity`（GPU 加速）
- 避免动画 `box-shadow`（改用伪元素）
- 使用 `will-change` 提示浏览器优化：
  ```css
  .side-tab {
    will-change: transform;
  }
  ```

#### 减少重绘

- 装饰性伪元素设置 `pointer-events: none`
- 固定层级使用 `position: fixed` + `transform`

---

## 六、验收标准

### 6.1 视觉还原度

- [ ] 所有卡片呈现纸张质感，边缘不规则
- [ ] 按钮具有印章质感，点击有盖印反馈
- [ ] 导航侧签有书签凸出效果，悬停有翻动感
- [ ] 输入框呈现题签样式，聚焦有墨晕效果
- [ ] 整体色调统一为古纸、墨色、朱砂、金箔
- [ ] 无 Tailwind 模板化痕迹

### 6.2 交互流畅度

- [ ] 所有动画在 60fps 下流畅运行
- [ ] 悬停反馈延迟 < 100ms
- [ ] 页面切换动画自然不突兀
- [ ] 无卡顿或闪烁

### 6.3 功能完整性

- [ ] 所有原有功能正常工作
- [ ] 所有交互逻辑保持不变
- [ ] 无布局错位或组件遮挡
- [ ] 响应式布局正常（如有）

### 6.4 代码质量

- [ ] CSS 架构清晰，易于维护
- [ ] 组件命名规范统一
- [ ] 无冗余或重复样式
- [ ] 性能优化到位（无不必要的重绘）

---

## 七、附录

### 7.1 色彩参考表

| 色系 | 用途 | 色值 | 示例 |
|------|------|------|------|
| 新宣纸 | 输入框背景 | #FEFBF2 | ████ |
| 陈年纸 | 卡片主背景 | #F8F3E8 | ████ |
| 古旧纸 | 卡片边缘渐变 | #F0E5D1 | ████ |
| 深古纸 | 面板背景 | #E8DCC0 | ████ |
| 书脊 | 导航/状态栏背景 | #2C2416 | ████ |
| 淡墨 | 辅助文字 | #8B7355 | ████ |
| 中墨 | 正文文字 | #4A3C28 | ████ |
| 浓墨 | 标题文字 | #2A1F12 | ████ |
| 焦墨 | 强调文字 | #1A1410 | ████ |
| 朱砂 | 按钮/强调 | #C1432E | ████ |
| 金箔 | 标题装饰 | #D4AF37 | ████ |

### 7.2 字体使用指南

| 元素 | 字体 | 字号 | 字重 | 行高 |
|------|------|------|------|------|
| 游戏标题 | brush | 28-48px | normal | 1.2 |
| 章节标题 | kai | 24-28px | normal | 1.4 |
| 小节标题 | kai | 18-20px | normal | 1.5 |
| 正文 | kai/song | 16px | normal | 1.8 |
| 辅助信息 | kai | 14px | normal | 1.6 |
| 按钮文字 | kai | 14px | 500 | 1.2 |
| 数值 | number | 14-16px | normal | 1.4 |

### 7.3 间距系统

| 等级 | 尺寸 | 用途 |
|------|------|------|
| xs | 4px | 图标边距、标签间距 |
| sm | 8px | 按钮内边距、小组件间距 |
| md | 16px | 卡片内容间距、表单间距 |
| lg | 24px | 卡片内边距、区块间距 |
| xl | 32px | 大区块间距、面板边距 |
| 2xl | 48px | 章节间距 |

### 7.4 圆角系统

| 等级 | 尺寸 | 用途 |
|------|------|------|
| sm | 2px | 按钮、印章 |
| md | 4px | 卡片、输入框 |
| lg | 8px | 大卡片、面板 |
| full | 999px | 圆形按钮、徽章 |

### 7.5 阴影系统

```css
/* 浅阴影（卡片默认） */
box-shadow: 
  0 2px 8px rgba(0, 0, 0, 0.08),
  0 8px 24px rgba(0, 0, 0, 0.06);

/* 中阴影（卡片悬停） */
box-shadow: 
  0 8px 16px rgba(0, 0, 0, 0.12),
  0 16px 48px rgba(0, 0, 0, 0.08);

/* 深阴影（面板、抽屉） */
box-shadow: 
  -4px 0 16px rgba(0, 0, 0, 0.15);

/* 印章阴影 */
box-shadow: 
  0 2px 4px rgba(193, 67, 46, 0.3),
  inset 0 1px 0 rgba(255, 255, 255, 0.2);
```

### 7.6 动画速度指南

| 交互类型 | 持续时间 | 缓动函数 |
|----------|----------|----------|
| 微交互（按钮点击） | 150-250ms | cubic-bezier(0.34, 1.56, 0.64, 1) |
| 悬停反馈 | 200-300ms | ease |
| 页面切换 | 600-800ms | cubic-bezier(0.16, 1, 0.3, 1) |
| 抽屉开关 | 400-600ms | cubic-bezier(0.16, 1, 0.3, 1) |
| 加载动画 | 1500-2000ms | ease-in-out (infinite) |

---

## 八、总结

本设计方案将游戏 UI 从 Tailwind 模板化风格彻底转变为独特的"线装古籍"视觉语言。核心策略是：

1. **统一隐喻**：所有组件都围绕"古籍"这一核心隐喻展开（书页→卡片，印章→按钮，书签→导航）
2. **质感优先**：通过纸张纹理、不规则边缘、墨色渐变营造真实触感
3. **克制动效**：避免过度动画，所有动效都模拟真实物理（纸张翻动、印章盖印）
4. **保留布局**：不破坏现有三栏结构和交互逻辑，只替换视觉表达

实施后，玩家将获得沉浸式的修真古籍阅读体验，完全感受不到 Tailwind 的影子。
