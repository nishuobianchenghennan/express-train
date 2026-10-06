// test/helpers/random.js
/**
 * 测试用可复现随机数（线性同余）。
 * 从原 core/selection.js 复制而来，删除 core/selection.js 后测试仍可使用。
 *
 * @param {number} seed 种子
 * @returns {() => number} [0, 1) 区间的随机数函数
 */
export function createSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

/** 线性同余生成器的前几个输出对相邻种子几乎相同，空转几次以获得分散的序列。 */
export function seeded(seed) {
  const random = createSeededRandom(seed);
  for (let index = 0; index < 4; index += 1) random();
  return random;
}
