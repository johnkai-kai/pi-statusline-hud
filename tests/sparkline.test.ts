import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_SIZE, History } from "../src/collect/history.ts";
import { SPARK_CHARS, sparkline } from "../src/lines/sparkline.ts";

const LOW = SPARK_CHARS[0];
const MID = SPARK_CHARS[3];
const HIGH = SPARK_CHARS[SPARK_CHARS.length - 1];

test("一個點畫不出趨勢——少於兩筆就不畫", () => {
  assert.equal(sparkline([]), "");
  assert.equal(sparkline([42]), "");
});

test("最小值貼底、最大值頂天——尺度是視窗內的相對值", () => {
  const line = sparkline([10, 20, 30]);
  assert.equal(line.length, 3);
  assert.equal(line[0], LOW);
  assert.equal(line[2], HIGH);
});

test("相對尺度:整段都很慢時仍看得出起伏,不會整條貼底", () => {
  // 絕對尺度(拿 200 tok/s 當滿格)會讓本地模型的 3→5 完全看不出差別。
  const local = sparkline([3, 4, 5]);
  const cloud = sparkline([120, 160, 200]);
  assert.equal(local, cloud, "同樣的相對形狀應該畫出同樣的圖形");
});

test("全部一樣高時畫成一條平線,不是一片空白或全滿", () => {
  assert.equal(sparkline([33, 33, 33]), MID.repeat(3));
});

test("只畫最近的幾筆,舊的自己滾出去", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(sparkline(values, 4).length, 4);
  assert.equal(sparkline(values, 4)[3], HIGH);
});

test("History 是固定長度的環形緩衝,滿了就擠掉最舊的", () => {
  const history = new History(3);
  history.push(1);
  history.push(2);
  history.push(3);
  history.push(4);
  assert.deepEqual(history.recent(), [2, 3, 4]);
});

test("History 不收非數字與非正值——那不是速度", () => {
  const history = new History(4);
  history.push(Number.NaN);
  history.push(Infinity);
  history.push(0);
  history.push(-5);
  history.push(33);
  assert.deepEqual(history.recent(), [33]);
});

test("History reset 清空", () => {
  const history = new History();
  history.push(10);
  history.reset();
  assert.deepEqual(history.recent(), []);
});

test("預設長度與 sparkline 的預設格數是同一個常數", () => {
  assert.ok(HISTORY_SIZE >= 4);
  const history = new History();
  for (let i = 0; i < HISTORY_SIZE * 2; i += 1) history.push(i + 1);
  assert.equal(history.recent().length, HISTORY_SIZE);
  assert.equal(sparkline(history.recent()).length, HISTORY_SIZE);
});
