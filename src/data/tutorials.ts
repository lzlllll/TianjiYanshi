/**
 * 新手引导的脚本。
 *
 * 每一页一套，每套分若干步；每步圈住界面上的一个真东西，旁边摊一页话。
 * 圈哪个由 data-tutorial 属性认，故界面上那些元素都挂着同名记号；
 * 元素没找着时，卡片便摆在正中间，不至于把教程卡死。
 */

export type TutorialId = "map" | "story" | "fate" | "sect";

export interface TutorialStep {
  /** 要圈出来的元素；不写就把卡片摆在正中 */
  target?: string;
  title: string;
  body: string;
  /** 卡片落在圈口的哪一边；不写便按空位自己挑 */
  placement?: "top" | "bottom" | "left" | "right";
  /**
   * 走到这一步之前先替玩家把该开的开出来，好让圈口落在真东西上。
   * 取值见 GuidedTutorial 里的 runEnter：story、panel:<面板名> 之类。
   */
  enter?: string;
}

export interface Tutorial {
  id: TutorialId;
  label: string;
  steps: TutorialStep[];
}

export const TUTORIALS: Tutorial[] = [
  {
    id: "map",
    label: "主界面",
    steps: [
      {
        target: '[data-tutorial="world-map"]',
        title: "九州舆图",
        body: "这方天地都摊在这张图上。滚轮缩放，按住拖拽平移；城池、宗门、村庄与奇遇都能点开看详情。想动身去某处，不在图上点，得在问道里付诸行动。",
        placement: "bottom",
        // 先把问道窗收起，免得它挡着舆图
        enter: "story-close",
      },
      {
        target: '[data-tutorial="nav-story"]',
        title: "问道：一切行动的入口",
        body: "左栏底下这枚朱红的「问道」便是你的手脚。写下要做什么，通灵演出一段叙事，再照你做的事把修为、气血、灵石、人情一一记账。",
        placement: "right",
      },
      {
        target: '[data-tutorial="side-nav"]',
        title: "左栏书脊：各项身家",
        body: "本命、功法、财宝、宗门、尘缘、本事、机缘、快报、地产、状态、推演账，都收在这一列。点开一页，再点一次或按 Esc 收起。",
        placement: "right",
      },
      {
        target: '[data-tutorial="top-banner"]',
        title: "顶栏：这一世的账",
        body: "修为、年岁、所剩寿元与天时都在这里。右上角三个点管存档与开新局，齿轮里填通灵接口与模型。",
        placement: "bottom",
      },
      {
        target: '[data-tutorial="bottom-status"]',
        title: "底栏：当下的身子",
        body: "气血、灵力、神识三条常驻在此。右侧「修行录」记着近期动静，点开能翻前几条。",
        placement: "top",
      },
    ],
  },
  {
    id: "story",
    label: "问道",
    steps: [
      {
        target: '[data-tutorial="story-narrative"]',
        title: "天机：这一回的叙事",
        body: "你做的事会演成一段文字摆在这里。叙事之后若缀着红绿小字，那是本回落到账上的变化：绿为得，红为失；没有这类字样，便是只叙事、未动账。",
        enter: "story",
        placement: "bottom",
      },
      {
        target: '[data-tutorial="story-input"]',
        title: "心念：写下你的决断",
        body: "上面几条是照着眼前处境拟的打算，点一下便填进下面的框，还能再改。也可以自己写；Ctrl 或 ⌘ + Enter 直接发送。",
        enter: "story",
        placement: "top",
      },
      {
        target: '[data-tutorial="story-evolve"]',
        title: "演化：落定这一念",
        body: "确认无误后点「演化」。演完若不满意，可用「重演」按同一句话重来一次。",
        enter: "story",
        placement: "top",
      },
    ],
  },
  {
    id: "fate",
    label: "机缘",
    steps: [
      {
        target: '[data-tutorial="fate-tabs"]',
        title: "机缘分五页",
        body: "机会只有酬谢；任务误期要罚；另有奇遇、最近听来的闲话，以及与人当面说定的约定。页签上的数字是各页未了的桩数。",
        enter: "panel:fate",
        placement: "bottom",
      },
      {
        target: '[data-tutorial="fate-list"]',
        title: "每一桩都写明去处与赏罚",
        body: "卡片上写着托自何人、到何处办、交差的条件，以及酬谢与误期的罚。带星的目标会在城图上点出来，照着走便是。",
        enter: "panel:fate",
        placement: "bottom",
      },
    ],
  },
  {
    id: "sect",
    label: "宗门",
    steps: [
      {
        target: '[data-tutorial="sect-header"]',
        title: "宗门：你的门户",
        body: "这一页是宗门的名号、门派等级、声望与你自己的贡献。无门无派时，可在此开宗立派。",
        enter: "panel:sect",
        placement: "bottom",
      },
      {
        target: '[data-tutorial="sect-tabs"]',
        title: "宗门各页",
        body: "弟子名册、职位、差事榜、库房、传承、往来与营造，都分在这一排页签里。差事的赏是贡献与灵石，误期则倒扣贡献。",
        enter: "panel:sect",
        placement: "bottom",
      },
    ],
  },
];

export function tutorialById(id: TutorialId): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
