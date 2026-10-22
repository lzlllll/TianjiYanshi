/**
 * 宅邸建筑贴图的对齐标定。
 *
 * 贴图是等距立绘，自带一块薄方台；把它摆到宅邸院的菱形格上，
 * 得知道方台在图上占多大、落在哪，这里记的就是这两个数：
 * - w：方台菱形宽 ÷ 图宽
 * - cx：方台菱形中心的横向占比
 * - cy：方台菱形中心的纵向占比
 *
 * 由 tools/manor-sprite-align.py 量出，勿手改；重画贴图后跑一遍脚本再生成。
 */
import { assetUrl } from "@/data/map";
import type { ManorShape } from "@/data/types";

export interface ManorSpriteAlign {
  /** 方台菱形宽 ÷ 图宽 */
  w: number;
  /** 方台菱形中心的横向占比 */
  cx: number;
  /** 方台菱形中心的纵向占比 */
  cy: number;
}

/** 形制 → 文化圈 → 对齐点 */
export const MANOR_SPRITE_ALIGN: Record<ManorShape, Record<string, ManorSpriteAlign>> = {
  亭: {
    中原: { w: 0.8945, cx: 0.498, cy: 0.5762 },
    江南: { w: 0.8848, cx: 0.499, cy: 0.5547 },
    苗疆: { w: 0.873, cx: 0.499, cy: 0.582 },
    西域: { w: 0.8477, cx: 0.5156, cy: 0.5801 },
    漠北: { w: 0.8262, cx: 0.499, cy: 0.5977 },
    日韩: { w: 0.8203, cx: 0.5, cy: 0.668 },
  },
  正房: {
    中原: { w: 0.9219, cx: 0.5, cy: 0.5781 },
    江南: { w: 0.8848, cx: 0.499, cy: 0.582 },
    苗疆: { w: 0.8125, cx: 0.5039, cy: 0.6367 },
    西域: { w: 0.9062, cx: 0.4922, cy: 0.5781 },
    漠北: { w: 0.8691, cx: 0.5049, cy: 0.5918 },
    日韩: { w: 0.8633, cx: 0.5049, cy: 0.5293 },
  },
  厢房: {
    中原: { w: 0.9883, cx: 0.5, cy: 0.5293 },
    江南: { w: 0.8887, cx: 0.4912, cy: 0.5625 },
    苗疆: { w: 0.8223, cx: 0.499, cy: 0.5859 },
    西域: { w: 0.8262, cx: 0.501, cy: 0.5508 },
    漠北: { w: 0.8926, cx: 0.4834, cy: 0.5195 },
    日韩: { w: 0.8613, cx: 0.5068, cy: 0.5703 },
  },
  工坊: {
    中原: { w: 0.9023, cx: 0.4961, cy: 0.5508 },
    江南: { w: 0.875, cx: 0.498, cy: 0.5703 },
    苗疆: { w: 0.8379, cx: 0.5088, cy: 0.5859 },
    西域: { w: 0.9004, cx: 0.4971, cy: 0.5801 },
    漠北: { w: 0.875, cx: 0.5068, cy: 0.5723 },
    日韩: { w: 0.8105, cx: 0.499, cy: 0.5801 },
  },
  水榭: {
    中原: { w: 0.7891, cx: 0.498, cy: 0.541 },
    江南: { w: 0.8066, cx: 0.499, cy: 0.5605 },
    苗疆: { w: 0.8613, cx: 0.501, cy: 0.5605 },
    西域: { w: 0.9141, cx: 0.5039, cy: 0.5684 },
    漠北: { w: 0.8613, cx: 0.5078, cy: 0.5762 },
    日韩: { w: 0.8965, cx: 0.501, cy: 0.543 },
  },
  高阁: {
    中原: { w: 0.8633, cx: 0.502, cy: 0.5859 },
    江南: { w: 0.8652, cx: 0.4941, cy: 0.6426 },
    苗疆: { w: 0.8848, cx: 0.499, cy: 0.6875 },
    西域: { w: 0.9551, cx: 0.499, cy: 0.7012 },
    漠北: { w: 0.7461, cx: 0.502, cy: 0.6484 },
    日韩: { w: 0.9707, cx: 0.5, cy: 0.6895 },
  },
  花园: {
    中原: { w: 0.9316, cx: 0.499, cy: 0.5469 },
    江南: { w: 0.875, cx: 0.498, cy: 0.5547 },
    苗疆: { w: 0.873, cx: 0.501, cy: 0.5312 },
    西域: { w: 0.8496, cx: 0.4941, cy: 0.541 },
    漠北: { w: 0.873, cx: 0.499, cy: 0.5293 },
    日韩: { w: 0.8496, cx: 0.5049, cy: 0.5449 },
  },
  水域: {
    中原: { w: 0.8535, cx: 0.5068, cy: 0.5645 },
    江南: { w: 0.9141, cx: 0.502, cy: 0.5293 },
    苗疆: { w: 0.8633, cx: 0.499, cy: 0.5117 },
    西域: { w: 0.8105, cx: 0.4971, cy: 0.5312 },
    漠北: { w: 0.9043, cx: 0.499, cy: 0.4961 },
    日韩: { w: 0.8633, cx: 0.502, cy: 0.5156 },
  },
};

/**
 * 一格菱形上该摆哪张立绘、摆多大。
 *
 * 取的是去底后的透明版，见 tools/manor-sprite-alpha.py。
 * cellWidth 是格子的菱形对角宽，也就是它在屏幕上的横向宽度；
 * 立绘按方台宽度与格宽等比放大，左上角相对格心的偏移由方台中心倒推。
 * 认不出地域就退到中原那一套，免得整格空着。
 */
export function manorSpriteLayout(shape: ManorShape, culture: string | undefined, cellWidth: number) {
  const byCulture = MANOR_SPRITE_ALIGN[shape];
  const key = culture && byCulture[culture] ? culture : byCulture["中原"] ? "中原" : Object.keys(byCulture)[0];
  const align = byCulture[key];
  const width = cellWidth / align.w;
  return {
    url: assetUrl(`image_assets/宅邸建筑贴图透明/${shape}_${key}.png`),
    align,
    width,
    height: width,
    left: -align.cx * width,
    top: -align.cy * width,
  };
}
